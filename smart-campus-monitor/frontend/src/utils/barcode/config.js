// Which symbologies the gate scanner reads. Restricting this to what the ID cards really use makes
// scanning faster and avoids false reads. Override with VITE_BARCODE_FORMATS="Code128,QRCode".
export const DEFAULT_FORMATS = [
  'Code128', 'Code39', 'Code93', 'Codabar', 'ITF', 'EAN13', 'EAN8', 'UPCA', 'UPCE', 'QRCode', 'PDF417', 'DataMatrix',
];

export const getBarcodeFormats = () => {
  const configured = String(import.meta.env?.VITE_BARCODE_FORMATS || '')
    .split(',')
    .map((f) => f.trim())
    .filter(Boolean);
  return configured.length ? configured : DEFAULT_FORMATS;
};

// Symbologies with a built-in checksum or error correction: a single read can be trusted.
// Everything else (Code 39, ITF, Codabar, ...) must be read twice before it is accepted.
const SELF_CHECKING = new Set(['code128', 'ean13', 'ean8', 'upca', 'upce', 'qrcode', 'microqrcode', 'datamatrix', 'pdf417']);

export const isSelfChecking = (format) => SELF_CHECKING.has(String(format || '').toLowerCase().replace(/[^a-z0-9]/g, ''));
