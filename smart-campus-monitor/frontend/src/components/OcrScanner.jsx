import { useRef, useState, useCallback, useEffect } from 'react';
import { createWorker } from 'tesseract.js';

export default function OcrScanner({ onScan, enabled = true }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const workerRef = useRef(null);
  const scanTimerRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const [status, setStatus] = useState('Initializing OCR...');

  // ── 1. Initialize Tesseract worker once (reuse across scans) ──
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    const init = async () => {
      try {
        const worker = await createWorker('eng');
        await worker.setParameters({
          tessedit_char_whitelist: '0123456789',
          tessedit_pageseg_mode: '7', // single text line
        });
        if (!cancelled) {
          workerRef.current = worker;
          setStatus('Ready — point camera at ID card');
        }
      } catch (err) {
        if (!cancelled) setError(`OCR init failed: ${err.message}`);
      }
    };
    init();

    return () => {
      cancelled = true;
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, [enabled]);

  // ── 2. Start webcam ──
  useEffect(() => {
    if (!enabled) return;

    const startCamera = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: 1280, height: 720 },
        });
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
        setError('');
      } catch (err) {
        if (err.name === 'NotAllowedError') {
          setError('Camera access denied. Please allow camera access.');
        } else {
          setError(`Camera error: ${err.message}`);
        }
      }
    };
    startCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [enabled]);

  // ── 3. Detect the teal/cyan strip on the ID card ──
  // The SAP ID is printed as dark bold text on a distinctive teal strip.
  // We scan each row for pixels where green & blue dominate red.
  const findTealStrip = useCallback((ctx, width, height) => {
    const imgData = ctx.getImageData(0, 0, width, height);
    const d = imgData.data;

    const rowScores = new Float32Array(height);
    for (let y = 0; y < height; y++) {
      let teal = 0;
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        const r = d[i], g = d[i + 1], b = d[i + 2];
        // Teal: green & blue notably higher than red
        if (g > r + 15 && b > r + 10 && g > 100 && b > 100 && r < 200) teal++;
      }
      rowScores[y] = teal / width;
    }

    // Find the longest continuous band with >10% teal pixels
    let bestStart = -1, bestLen = 0, curStart = -1, curLen = 0;
    for (let y = 0; y < height; y++) {
      if (rowScores[y] > 0.1) {
        if (curStart === -1) curStart = y;
        curLen++;
      } else {
        if (curLen > bestLen) { bestStart = curStart; bestLen = curLen; }
        curStart = -1; curLen = 0;
      }
    }
    if (curLen > bestLen) { bestStart = curStart; bestLen = curLen; }

    if (bestLen < 8) return null; // too small — not a real strip

    // Add vertical padding
    const pad = Math.floor(bestLen * 0.35);
    return {
      y: Math.max(0, bestStart - pad),
      h: Math.min(height, bestLen + pad * 2),
    };
  }, []);

  // ── 4. Preprocess: dark text on teal/colored bg → black on white ──
  const preprocessForOcr = useCallback((canvas) => {
    const ctx = canvas.getContext('2d');
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imgData.data;

    // Scale up for better OCR accuracy (Tesseract prefers larger text)
    const scale = 2;
    const bigCanvas = document.createElement('canvas');
    bigCanvas.width = canvas.width * scale;
    bigCanvas.height = canvas.height * scale;
    const bigCtx = bigCanvas.getContext('2d');
    bigCtx.imageSmoothingEnabled = false;
    bigCtx.drawImage(canvas, 0, 0, bigCanvas.width, bigCanvas.height);

    const bigData = bigCtx.getImageData(0, 0, bigCanvas.width, bigCanvas.height);
    const bd = bigData.data;

    for (let i = 0; i < bd.length; i += 4) {
      const brightness = 0.299 * bd[i] + 0.587 * bd[i + 1] + 0.114 * bd[i + 2];
      // Dark text → black(0), teal/white bg → white(255)
      const val = brightness < 120 ? 0 : 255;
      bd[i] = bd[i + 1] = bd[i + 2] = val;
    }
    bigCtx.putImageData(bigData, 0, 0);

    return bigCanvas;
  }, []);

  // ── 5. Capture frame, find strip, OCR ──
  const captureAndRead = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || !workerRef.current || busy) return;

    setBusy(true);

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    if (canvas.width === 0) { setBusy(false); return; }
    ctx.drawImage(video, 0, 0);

    // Try to find the teal strip
    const strip = findTealStrip(ctx, canvas.width, canvas.height);

    let cropCanvas = document.createElement('canvas');
    let cropCtx;

    if (strip) {
      cropCanvas.width = canvas.width;
      cropCanvas.height = strip.h;
      cropCtx = cropCanvas.getContext('2d');
      cropCtx.drawImage(canvas, 0, strip.y, canvas.width, strip.h, 0, 0, canvas.width, strip.h);
      setStatus('Teal strip found — reading SAP ID...');
    } else {
      // Fallback: scan center 30-75% of the frame
      const y0 = Math.floor(canvas.height * 0.3);
      const h = Math.floor(canvas.height * 0.45);
      cropCanvas.width = canvas.width;
      cropCanvas.height = h;
      cropCtx = cropCanvas.getContext('2d');
      cropCtx.drawImage(canvas, 0, y0, canvas.width, h, 0, 0, canvas.width, h);
      setStatus('Scanning for SAP ID...');
    }

    const processed = preprocessForOcr(cropCanvas);
    setPreview(processed.toDataURL());

    try {
      const { data } = await workerRef.current.recognize(processed.toDataURL());
      const digits = data.text.replace(/\D/g, '');
      const match = digits.match(/\d{11}/);

      if (match) {
        onScan(match[0]);
        setStatus(`SAP ID found: ${match[0]}`);
      } else if (digits.length >= 9) {
        onScan(digits.slice(0, 11));
        setStatus(`Partial read: ${digits}`);
      } else {
        setStatus(digits ? `Digits: ${digits} — need 11` : 'No digits — adjust position');
      }
    } catch (err) {
      setStatus(`OCR error — retrying...`);
    } finally {
      setBusy(false);
    }
  }, [busy, findTealStrip, preprocessForOcr, onScan]);

  // ── 6. Auto-scan every 2 seconds ──
  useEffect(() => {
    if (!enabled) return;
    scanTimerRef.current = setInterval(() => { captureAndRead(); }, 2000);
    return () => clearInterval(scanTimerRef.current);
  }, [enabled, captureAndRead]);

  if (!enabled) return null;

  return (
    <div className="relative">
      {error && (
        <div className="mb-3 bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">
          {error}
        </div>
      )}

      <div className="relative rounded-lg overflow-hidden bg-black">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full scanner-video"
          style={{ maxHeight: '400px' }}
        />

        {/* Guide overlay — teal strip target */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-72 h-16 border-2 border-yellow-400 rounded-lg mt-16 opacity-80 flex items-center justify-center">
            <span className="text-yellow-300 text-xs font-medium bg-black/50 px-2 py-0.5 rounded">
              Align SAP ID teal strip here
            </span>
          </div>
        </div>

        <div className="absolute bottom-4 left-0 right-0 text-center">
          <span className="bg-black/60 text-white px-4 py-2 rounded-full text-sm">
            {busy ? 'Reading...' : status}
          </span>
        </div>
      </div>

      {/* Hidden canvas for capture */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Manual capture button */}
      <button
        onClick={captureAndRead}
        disabled={busy}
        className="mt-4 w-full py-3 bg-yellow-500 text-white rounded-lg font-semibold hover:bg-yellow-600 disabled:opacity-60 transition-colors text-lg"
      >
        {busy ? (
          <span className="flex items-center justify-center gap-2">
            <span className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
            Reading SAP ID...
          </span>
        ) : (
          'Capture & Read SAP ID'
        )}
      </button>

      {/* Preview of what OCR sees */}
      {preview && (
        <div className="mt-3">
          <p className="text-xs text-gray-500 mb-1">Processed capture (what OCR sees):</p>
          <img src={preview} alt="OCR preview" className="w-full rounded border border-gray-200" />
        </div>
      )}
    </div>
  );
}
