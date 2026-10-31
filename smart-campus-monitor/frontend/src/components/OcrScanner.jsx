import { useRef, useState, useCallback, useEffect } from 'react';
import { createWorker } from 'tesseract.js';
import useCamera from '../hooks/useCamera';
import {
  binarizeAdaptive,
  binarizeOtsu,
  drawScaled,
  invert,
  sharpen,
  stretchContrast,
} from '../utils/frameProcessing';

const SCAN_INTERVAL_MS = 1200;
const CONFIRM_WINDOW_MS = 4000;
const SCAN_COOLDOWN_MS = 2500;

// Treatments tried in rotation so one tick never costs more than one OCR pass.
const VARIANTS = [
  (c) => binarizeOtsu(stretchContrast(c)),
  (c) => binarizeAdaptive(sharpen(stretchContrast(c)), 0.06, 8),
  (c) => binarizeOtsu(stretchContrast(c), true),
  (c) => sharpen(stretchContrast(c)),
  (c) => invert(binarizeAdaptive(stretchContrast(c), 0.06, 8)),
];

// The SAP ID is printed as dark bold digits on a teal strip. Find rows dominated by teal.
const findTealStrip = (ctx, width, height) => {
  const d = ctx.getImageData(0, 0, width, height).data;
  const rowScores = new Float32Array(height);
  for (let y = 0; y < height; y++) {
    let teal = 0;
    for (let x = 0; x < width; x += 2) {
      const i = (y * width + x) * 4;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      if (g > r + 15 && b > r + 10 && g > 100 && b > 100 && r < 200) teal++;
    }
    rowScores[y] = teal / (width / 2);
  }
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
  if (bestLen < 8) return null;
  const pad = Math.floor(bestLen * 0.35);
  return { y: Math.max(0, bestStart - pad), h: Math.min(height, bestLen + pad * 2) };
};

// Pick the most plausible SAP ID from noisy OCR output (9-11 digits, prefer exactly 11).
const extractSapCandidate = (text) => {
  const runs = String(text || '').match(/\d+/g) || [];
  const joined = runs.join('');
  return (
    runs.find((run) => run.length === 11) ||
    (joined.length === 11 ? joined : null) ||
    runs.find((run) => run.length >= 9 && run.length <= 11) ||
    null
  );
};

export default function OcrScanner({ onScan, enabled = true }) {
  const { videoRef, devices, deviceId, setDeviceId, error: cameraError, ready, torchSupported, torch, setTorch } =
    useCamera(enabled);
  const workerRef = useRef(null);
  const frameRef = useRef(null);
  const busyRef = useRef(false);
  const tickRef = useRef(0);
  const pendingRef = useRef({ value: '', at: 0 });
  const lastAcceptedRef = useRef({ value: '', at: 0 });
  const onScanRef = useRef(onScan);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const [status, setStatus] = useState('Initializing OCR...');

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  // Tesseract worker (digits only), created once.
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const worker = await createWorker('eng');
        await worker.setParameters({
          tessedit_char_whitelist: '0123456789',
          tessedit_pageseg_mode: '7',
        });
        if (cancelled) {
          worker.terminate();
          return;
        }
        workerRef.current = worker;
        setStatus('Ready - point camera at the ID card');
      } catch (err) {
        if (!cancelled) setError(`OCR init failed: ${err.message}`);
      }
    })();
    return () => {
      cancelled = true;
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, [enabled]);

  const captureAndRead = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth || !workerRef.current || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);

    try {
      const frame = frameRef.current || document.createElement('canvas');
      frameRef.current = frame;
      frame.width = video.videoWidth;
      frame.height = video.videoHeight;
      const ctx = frame.getContext('2d', { willReadFrequently: true });
      ctx.drawImage(video, 0, 0);

      const strip = findTealStrip(ctx, frame.width, frame.height);
      const region = strip
        ? { y: strip.y, h: strip.h }
        : { y: Math.floor(frame.height * 0.3), h: Math.floor(frame.height * 0.45) };
      // Tesseract reads best at roughly 40-60px glyph height: upscale small crops, cap big ones.
      const scale = region.h < 160 ? 3 : region.h < 320 ? 2 : 1;
      const crop = drawScaled(frame, 0, region.y, frame.width, region.h, scale);

      const processed = VARIANTS[tickRef.current % VARIANTS.length](crop);
      tickRef.current += 1;
      setPreview(processed.toDataURL());

      const { data } = await workerRef.current.recognize(processed);
      const candidate = extractSapCandidate(data.text);
      const now = Date.now();

      if (!candidate) {
        setStatus(strip ? 'Strip found - no digits yet, hold steady' : 'Scanning for SAP ID...');
        return;
      }
      const last = lastAcceptedRef.current;
      if (candidate === last.value && now - last.at < SCAN_COOLDOWN_MS) return;

      // Two independent reads must agree before the ID is accepted.
      const pending = pendingRef.current;
      if (pending.value === candidate && now - pending.at < CONFIRM_WINDOW_MS) {
        pendingRef.current = { value: '', at: 0 };
        lastAcceptedRef.current = { value: candidate, at: now };
        setStatus(`SAP ID found: ${candidate}`);
        onScanRef.current(candidate);
      } else {
        pendingRef.current = { value: candidate, at: now };
        setStatus(`Read ${candidate} - confirming...`);
      }
    } catch (_err) {
      setStatus('OCR error - retrying...');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }, [videoRef]);

  // Auto-scan continuously once camera and OCR are both ready.
  useEffect(() => {
    if (!enabled || !ready) return undefined;
    const timer = setInterval(captureAndRead, SCAN_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [enabled, ready, captureAndRead]);

  if (!enabled) return null;

  const shownError = error || cameraError;

  return (
    <div className="relative">
      {shownError && (
        <div className="mb-3 bg-red-50 border border-red-200 rounded-lg p-3 text-red-700 text-sm">{shownError}</div>
      )}

      <div className="relative rounded-lg overflow-hidden bg-black">
        <video ref={videoRef} autoPlay playsInline muted className="w-full" style={{ maxHeight: '400px', objectFit: 'cover' }} />
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-72 h-16 border-2 border-yellow-400 rounded-lg mt-16 opacity-80 flex items-center justify-center">
            <span className="text-yellow-300 text-xs font-medium bg-black/50 px-2 py-0.5 rounded">
              Align SAP ID teal strip here
            </span>
          </div>
        </div>
        <div className="absolute bottom-4 left-0 right-0 text-center">
          <span className="bg-black/60 text-white px-4 py-2 rounded-full text-sm">{busy ? 'Reading...' : status}</span>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {devices.length > 1 && (
          <select
            value={deviceId || devices[0]?.deviceId}
            onChange={(event) => setDeviceId(event.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
            aria-label="Select camera"
          >
            {devices.map((device, index) => (
              <option key={device.deviceId || index} value={device.deviceId}>
                {device.label || `Camera ${index + 1}`}
              </option>
            ))}
          </select>
        )}
        {torchSupported && (
          <button
            type="button"
            onClick={() => setTorch(!torch)}
            className={`rounded-lg border px-3 py-1.5 text-sm ${torch ? 'border-yellow-400 bg-yellow-100 text-yellow-800' : 'border-gray-300 text-gray-700'}`}
          >
            {torch ? 'Light on' : 'Light'}
          </button>
        )}
      </div>

      <button
        onClick={captureAndRead}
        disabled={busy}
        className="mt-3 w-full py-3 bg-yellow-500 text-white rounded-lg font-semibold hover:bg-yellow-600 disabled:opacity-60 transition-colors text-lg"
      >
        {busy ? 'Reading SAP ID...' : 'Capture & Read SAP ID'}
      </button>

      {preview && (
        <div className="mt-3">
          <p className="text-xs text-gray-500 mb-1">Processed capture (what OCR sees):</p>
          <img src={preview} alt="OCR preview" className="w-full rounded border border-gray-200" />
        </div>
      )}
    </div>
  );
}
