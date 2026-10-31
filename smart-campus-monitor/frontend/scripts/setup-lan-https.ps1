param(
  [string]$LanIp
)

$ErrorActionPreference = 'Stop'

if (-not $LanIp) {
  $LanIp = Get-NetIPAddress -AddressFamily IPv4 -AddressState Preferred -ErrorAction Stop |
    Where-Object {
      $_.InterfaceAlias -match 'wi-?fi' -and
      $_.IPAddress -notlike '169.254.*' -and
      $_.IPAddress -ne '127.0.0.1'
    } |
    Select-Object -First 1 -ExpandProperty IPAddress
}

if (-not $LanIp) {
  throw 'Could not find a Wi-Fi IPv4 address. Re-run with -LanIp <your-private-Wi-Fi-IPv4>.'
}

try {
  $parsedIp = [System.Net.IPAddress]::Parse($LanIp)
} catch {
  throw "'$LanIp' is not a valid IP address."
}

if ($parsedIp.AddressFamily -ne [System.Net.Sockets.AddressFamily]::InterNetwork -or
    $LanIp -notmatch '^(10\.|192\.168\.|172\.(1[6-9]|2[0-9]|3[01])\.)') {
  throw "'$LanIp' is not a private IPv4 address. Use the laptop's Wi-Fi IPv4 address."
}

$mkcertCommand = Get-Command mkcert -ErrorAction SilentlyContinue
$mkcertPath = if ($mkcertCommand) { $mkcertCommand.Source } else { $null }

if (-not $mkcertPath) {
  $wingetPackages = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages'
  if (Test-Path $wingetPackages) {
    $mkcertPath = Get-ChildItem -LiteralPath $wingetPackages -Filter 'mkcert.exe' -File -Recurse -ErrorAction SilentlyContinue |
      Select-Object -First 1 -ExpandProperty FullName
  }
}

if (-not $mkcertPath) {
  throw 'mkcert is missing. Install it with: winget install --id FiloSottile.mkcert -e'
}

$frontendRoot = Split-Path -Parent $PSScriptRoot
$certificateDirectory = Join-Path $frontendRoot 'certs'
$certificatePath = Join-Path $certificateDirectory 'lan.pem'
$privateKeyPath = Join-Path $certificateDirectory 'lan-key.pem'
New-Item -ItemType Directory -Path $certificateDirectory -Force | Out-Null

$previousTrustStores = $env:TRUST_STORES
$env:TRUST_STORES = 'system'
try {
  & $mkcertPath -install
  if ($LASTEXITCODE -ne 0) {
    throw 'mkcert could not install its local CA into the Windows trust store.'
  }
} finally {
  if ($null -eq $previousTrustStores) {
    Remove-Item Env:TRUST_STORES -ErrorAction SilentlyContinue
  } else {
    $env:TRUST_STORES = $previousTrustStores
  }
}

& $mkcertPath -cert-file $certificatePath -key-file $privateKeyPath 'localhost' '127.0.0.1' '::1' $LanIp
if ($LASTEXITCODE -ne 0) {
  throw 'mkcert could not create the HTTPS certificate.'
}

$caRoot = (& $mkcertPath -CAROOT).Trim()
Write-Output "Created a local HTTPS certificate for $LanIp and localhost."
Write-Output "Vite URL: https://${LanIp}:5173/login"
Write-Output "Android CA certificate to transfer: $(Join-Path $caRoot 'rootCA.pem')"
Write-Output 'Transfer rootCA.pem only. Never copy or share rootCA-key.pem.'
