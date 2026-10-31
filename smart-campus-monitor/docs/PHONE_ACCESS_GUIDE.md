# Open a project on your phone over the same Wi-Fi

This guide covers the reusable setup for development projects and the exact phone URLs for Smart Campus Monitor.

## General steps for any web project

1. Connect the PC and phone to the same trusted Wi-Fi network. Guest Wi-Fi, client isolation, or a VPN can prevent the devices from reaching each other.
2. Start the project's web server on the PC. It must listen on the LAN, usually by binding to `0.0.0.0`, instead of only `localhost` or `127.0.0.1`. For example:

   ```text
   Vite:       npm run dev -- --host 0.0.0.0
   Express:    app.listen(PORT, '0.0.0.0')
   Docker:     publish the container port, e.g. -p 8080:80
   ```

   Use the framework's equivalent host/bind option for other servers. Vite documents `--host 0.0.0.0` in its [server options](https://vite.dev/config/server-options).
3. On the PC, run `ipconfig` and find the IPv4 address under the Wi-Fi adapter. Use that address in the phone's browser. Do not type `localhost` on the phone: that points back to the phone itself.
4. Allow the app's web port through Windows Defender Firewall on **Private networks** only. If Windows shows a firewall prompt when the server starts, allow it on Private networks. Only open the frontend port needed by the phone.
5. On the phone, open `http://<PC-WI-FI-IP>:<WEB-PORT>` and sign in if the app requires it.
6. If the page loads but its data/API calls fail, check that the frontend uses a relative API path such as `/api` through a proxy, or uses an API URL reachable from the phone. A frontend URL containing `localhost` for its backend will point at the phone. For direct browser-to-API calls, allow the frontend's LAN origin in the backend's CORS settings.

Common framework examples:

```powershell
# Vite
npm run dev -- --host 0.0.0.0

# Next.js
npm run dev -- --hostname 0.0.0.0

# Django
python manage.py runserver 0.0.0.0:8000

# Flask
flask run --host=0.0.0.0
```

`0.0.0.0` is the server bind address, not the address to enter on the phone. Use the PC's Wi-Fi IPv4 address instead. The PC must stay on and the server must keep running. The address can change after reconnecting to Wi-Fi; check `ipconfig` again if the link stops working.

## Smart Campus Monitor

### Local development over HTTPS

The Vite configuration listens on `0.0.0.0:5173`, uses a local mkcert certificate, and proxies `/api` and `/socket.io` to the backend on port `5000`.

Install mkcert once on Windows:

```powershell
winget install --id FiloSottile.mkcert -e
```

From the frontend folder, generate a certificate for the laptop's current Wi-Fi IP and install mkcert's local CA into the laptop's Windows trust store:

```powershell
cd "<project-folder>\frontend"
npm run setup:lan-https
```

The script prints the Wi-Fi IP it used and the path to `rootCA.pem`. If the laptop gets a different private IP, run the script again after reconnecting. For an unusual adapter name, pass the address explicitly:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/setup-lan-https.ps1 -LanIp 192.168.31.112
```

Keep the certificate and key in `frontend/certs/`; that directory is ignored by Git. The server private key `lan-key.pem` and mkcert CA private key `rootCA-key.pem` must never be copied to the phone or committed.

For local development, start the configured backend and database as usual, then start each server in its own PowerShell window:

```powershell
cd "<project-folder>\backend"
npm run dev
```

```powershell
cd "<project-folder>\frontend"
npm run dev
```

The backend needs the project's database and local environment configuration. Keep secrets in the ignored `.env` files; do not put them in this guide or share them in a URL.

This PC's Wi-Fi address when this guide was written is `192.168.31.112`. Confirm it with `ipconfig` before using these links, since a router can assign a different address later.

| On the phone | URL |
|---|---|
| App | `https://192.168.31.112:5173/` |
| Sign in | `https://192.168.31.112:5173/login` |
| Gate scanner | `https://192.168.31.112:5173/scanner` |
| Backend health check (optional) | `http://192.168.31.112:5000/api/health` |

Sign in with an account that has permission to use the scanner. The app's API calls are proxied through Vite, so normal app use goes through port `5173`; phone users generally do not need to open port `5000` directly. The scanner page also displays a phone link using the PC's detected LAN address.

Vite is configured with a strict port, so it stops with a clear error if `5173` is occupied instead of silently advertising the wrong phone URL.

### Trust the local CA on Android

Each Android phone that will open the local HTTPS site must trust mkcert's public root CA once:

1. On the laptop, run `mkcert -CAROOT` and locate `rootCA.pem` in that folder. If `mkcert` is not on PATH in the current terminal, use the path printed by `npm run setup:lan-https`.
2. Copy **only** `rootCA.pem` to the phone, for example over USB. Do not copy `rootCA-key.pem`; it can issue certificates trusted by every device that trusts this CA.
3. On Android, open **Settings → Security & privacy → More security settings → Encryption & credentials → Install a certificate → CA certificate**. Menu names vary by Android version and manufacturer; search Settings for **Install a certificate** if needed.
4. Select `rootCA.pem`, review Android's warning, and confirm installation. Android may require a screen lock. This installs a user CA, so only do this with the CA generated on your own laptop.
5. Open Chrome and visit `https://<laptop-Wi-Fi-IP>:5173/login`. Allow camera access when prompted.

Google's [Pixel certificate instructions](https://support.google.com/pixelphone/answer/2844832) show the certificate installation flow. Android distinguishes user-added CAs from preinstalled system CAs; this local trust is intended for this development website, not as a public certificate authority.

### Docker Compose

From the project root, start/rebuild the stack:

```powershell
docker compose up -d --build
```

The web frontend is published on port `80`. Open `http://<PC-WI-FI-IP>/` on the phone; the Nginx frontend proxies API and live socket traffic to the backend inside Docker. For the current Wi-Fi address, that is `http://192.168.31.112/`. The app's scanner is at `/scanner` after sign-in. The Compose file also publishes other service ports; do not open those to the phone unless you specifically need them.

The base Compose Nginx service remains HTTP-only on port `80`. For mobile live-camera scanning, use the HTTPS Vite development URL above, or deploy Compose behind an HTTPS reverse proxy with a trusted certificate.

### Using the phone camera for barcode scanning

On the phone, open the scanner page over HTTPS, sign in, tap **Start camera** once, and allow camera access. The scanner requests the rear camera and continuously decodes frames in the browser, preferring the native browser barcode detector when available and falling back to ZXing WebAssembly. Each accepted SAP ID goes through the existing scan API. While the backend verifies a scan, frame decoding pauses briefly; the camera stream stays open and scanning resumes automatically for the next student. No camera frames or photos are uploaded. See [MDN's getUserMedia requirements](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia#privacy_and_security).

If needed, the collapsed **Optional photo fallback** remains below the live scanner, but it is not required for normal gate scanning.

### Windows Firewall

If the phone cannot connect, allow the web port on the PC's Private network profile:

- Local Vite development: TCP `5173`
- Docker Compose frontend: TCP `80`
- Direct backend health/API access only when needed: TCP `5000`

For example, in an elevated PowerShell window, a development-only rule is:

```powershell
New-NetFirewallRule -DisplayName "Smart Campus dev web" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 5173 -Profile Private
```

Use port `80` in the rule instead when accessing the Docker frontend. Remove the rule when it is no longer needed if the PC is used on networks you do not trust.

## Troubleshooting

| What happens | Check |
|---|---|
| Phone says site cannot be reached | Confirm the server is running, the PC IP is current, and the phone is on the same non-guest Wi-Fi. |
| It works on the PC but not the phone | Confirm the server binds to `0.0.0.0` and Windows Firewall allows the frontend port on Private networks. |
| Page opens but API/data fails | Check for hard-coded `localhost` API URLs, the frontend proxy, backend status, and CORS if requests go directly to the API. |
| App opens but camera is unavailable | Allow camera permission, confirm the Android CA is installed, and use the `https://` URL. |
| Link worked earlier but stopped | The PC's Wi-Fi IPv4 may have changed; run `ipconfig` again and use the new address. |

Keep the app on a trusted local network while using a development server. Do not configure router port forwarding for these development ports.
