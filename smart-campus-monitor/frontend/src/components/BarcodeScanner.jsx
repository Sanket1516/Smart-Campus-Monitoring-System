import { useEffect, useMemo, useRef, useState } from 'react';
import useCamera from '../hooks/useCamera';
import { scanFrameStep } from '../utils/barcode/pipeline';
import { getBarcodeFormats, isSelfChecking } from '../utils/barcode/config';
import { extractStudentId, firstElevenDigits } from '../utils/barcode/extractId';

const TICK_MS = 110; // upper bound on scan rate; the real rate is lower because frames never queue
const MAX_FRAME_WIDTH = 1280;
const CONFIRM_WINDOW_MS = 2500;
const SAME_VALUE_COOLDOWN_MS = 4000;
const HELP_AFTER_MS = 10000;
const NATIVE_FORMATS = {
  Code128: 'code_128',
  Code39: 'code_39',
  Code93: 'code_93',
  Codabar: 'codabar',
  ITF: 'itf',
  EAN13: 'ean_13',
  EAN8: 'ean_8',
  UPCA: 'upc_a',
  UPCE: 'upc_e',
  QRCode: 'qr_code',
  PDF417: 'pdf417',
  DataMatrix: 'data_matrix',
};

const createNativeDetector = async (formats) => {
  const Detector = window.BarcodeDetector;
  if (typeof Detector !== 'function') return null;

  try {
    const supported = typeof Detector.getSupportedFormats === 'function'
      ? await Detector.getSupportedFormats()
      : null;
    const requested = formats.map((format) => NATIVE_FORMATS[format]).filter(Boolean);
    const nativeFormats = Array.isArray(supported)
      ? requested.filter((format) => supported.includes(format))
      : requested;
    if (Array.isArray(supported) && !nativeFormats.length) return null;

    try {
      return new Detector(nativeFormats.length ? { formats: nativeFormats } : undefined);
    } catch (_error) {
      // Some implementations expose BarcodeDetector but don't accept a format list.
      return new Detector();
    }
  } catch (_error) {
    return null;
  }
};

export const STAGES = {
  initializing: { label: 'Initializing camera...', tone: 'gray' },
  ready: { label: 'Camera ready', tone: 'blue' },
  searching: { label: 'Searching for barcode...', tone: 'blue' },
  detected: { label: 'Barcode detected', tone: 'amber' },
  reading: { label: 'Reading barcode...', tone: 'amber' },
  invalid: { label: 'Invalid barcode', tone: 'red' },
  denied: { label: 'Camera permission denied', tone: 'red' },
  unavailable: { label: 'Camera unavailable', tone: 'red' },
};

const TONES = {
  gray: 'bg-gray-700/80 text-white',
  blue: 'bg-sky-600/85 text-white',
  amber: 'bg-amber-500/90 text-gray-900',
  red: 'bg-red-600/90 text-white',
  green: 'bg-emerald-600/90 text-white',
};

const debugEnabled = () => new URLSearchParams(window.location.search).has('debug');

/**
 * Live camera barcode reader. Native browser decoding is preferred when available, with ZXing WASM
 * as a fallback. Decoding happens entirely in the browser (no frames are uploaded).
 * `onDetected({ value, format, ms, pass })` fires once per accepted ID; the parent verifies it with
 * the backend. While `locked` (verification running) frames are not decoded.
 * `statusOverride` lets the parent show downstream states (Verifying, Entry Successful, ...).
 */
export default function BarcodeScanner({ onDetected, onValueRead = null, enabled = true, locked = false, statusOverride = null, onStart = null }) {
  const { videoRef, devices, deviceId, setDeviceId, error, ready, torchSupported, torch, setTorch } = useCamera(enabled);
  const formats = useMemo(() => getBarcodeFormats(), []);
  const onDetectedRef = useRef(onDetected);
  const onValueReadRef = useRef(onValueRead);
  const lockedRef = useRef(locked);
  const frameRef = useRef(null);
  const openedAt = useRef(0);
  const [stage, setStage] = useState('initializing');
  const [showHelp, setShowHelp] = useState(false);
  const [stats, setStats] = useState(null);
  const showDebug = useMemo(debugEnabled, []);

  useEffect(() => {
    onDetectedRef.current = onDetected;
  }, [onDetected]);
  useEffect(() => {
    onValueReadRef.current = onValueRead;
  }, [onValueRead]);
  useEffect(() => {
    lockedRef.current = locked;
  }, [locked]);
  useEffect(() => {
    if (enabled) openedAt.current = performance.now();
  }, [enabled]);

  // Camera lifecycle -> stage
  useEffect(() => {
    if (!enabled) return;
    if (error) setStage(/denied/i.test(error) ? 'denied' : 'unavailable');
    else if (ready) {
      setStage('searching');
      if (showDebug) setStats((s) => ({ ...s, cameraReadyMs: Math.round(performance.now() - openedAt.current) }));
    } else setStage('initializing');
  }, [enabled, ready, error, showDebug]);

  // Scan loop: one frame at a time, never queued, paused while verifying or when the tab is hidden.
  useEffect(() => {
    if (!enabled || !ready) return undefined;
    let active = true;
    let timer = null;
    let tick = 0;
    let frames = 0;
    let windowStart = performance.now();
    let pending = { value: '', at: 0 };
    let lastAccepted = { value: '', at: 0 };
    let lastInvalid = { value: '', at: 0 };
    let lastObservedValue = '';
    let nativeDetector = null;
    let nativeDetectorInitialized = false;
    const sessionStart = performance.now();

    const loop = async () => {
      if (!active) return;
      const video = videoRef.current;
      const skip = lockedRef.current || document.hidden || !video || video.readyState < 2 || !video.videoWidth;
      if (!skip) {
        try {
          const scale = Math.min(1, MAX_FRAME_WIDTH / video.videoWidth);
          const frame = frameRef.current || document.createElement('canvas');
          frameRef.current = frame;
          frame.width = Math.round(video.videoWidth * scale);
          frame.height = Math.round(video.videoHeight * scale);
          frame.getContext('2d', { willReadFrequently: true }).drawImage(video, 0, 0, frame.width, frame.height);

          const t0 = performance.now();
          if (!nativeDetectorInitialized) {
            nativeDetector = await createNativeDetector(formats);
            nativeDetectorInitialized = true;
          }

          let hit = null;
          if (nativeDetector) {
            try {
              const [nativeHit] = await nativeDetector.detect(frame);
              if (nativeHit?.rawValue) {
                hit = {
                  text: nativeHit.rawValue,
                  format: nativeHit.format || '',
                  pass: 'native',
                };
              }
            } catch (err) {
              console.warn('Native barcode detector unavailable; switching to ZXing WASM:', err?.message);
              nativeDetector = null;
            }
          }

          if (!hit) hit = await scanFrameStep(frame, tick, formats);
          tick += 1;
          frames += 1;
          const now = performance.now();

          if (showDebug && now - windowStart > 1000) {
            setStats((s) => ({ ...s, fps: Math.round((frames * 1000) / (now - windowStart)), lastTickMs: Math.round(now - t0) }));
            frames = 0;
            windowStart = now;
          }

          if (hit && active) {
            const rawValue = String(hit.text ?? '');
            if (rawValue && rawValue !== lastObservedValue) {
              lastObservedValue = rawValue;
              onValueReadRef.current?.(rawValue);
            }
            const parsed = extractStudentId(firstElevenDigits(rawValue));
            if (!parsed.ok) {
              if (lastInvalid.value !== hit.text || now - lastInvalid.at > 3000) {
                lastInvalid = { value: hit.text, at: now };
                setStage('invalid');
                setTimeout(() => active && setStage('searching'), 2200);
              }
            } else if (parsed.value === lastAccepted.value && now - lastAccepted.at < SAME_VALUE_COOLDOWN_MS) {
              // same card still in view: ignore
            } else if (!isSelfChecking(hit.format) && !(pending.value === parsed.value && now - pending.at < CONFIRM_WINDOW_MS)) {
              pending = { value: parsed.value, at: now };
              setStage('reading');
            } else {
              pending = { value: '', at: 0 };
              lastAccepted = { value: parsed.value, at: now };
              setShowHelp(false);
              setStage('detected');
              if (showDebug) {
                setStats((s) => ({ ...s, detectMs: Math.round(now - t0), pass: hit.pass, format: hit.format, firstReadMs: Math.round(now - sessionStart) }));
              }
              onDetectedRef.current({ value: parsed.value, format: hit.format, ms: Math.round(now - t0), pass: hit.pass });
            }
          }
        } catch (err) {
          console.warn('Scan frame error:', err?.message);
        }
        if (performance.now() - sessionStart > HELP_AFTER_MS && performance.now() - lastAccepted.at > HELP_AFTER_MS) setShowHelp(true);
      }
      if (active) timer = setTimeout(loop, TICK_MS);
    };
    loop();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [enabled, ready, formats, videoRef, showDebug]);

  if (!enabled) {
    return (
      <div className="rounded-lg bg-gray-100 p-12 text-center">
        <p className="font-medium text-gray-500">Camera is off</p>
        <p className="mt-1 text-sm text-gray-400">The browser will ask for camera permission when you start</p>
        {onStart && (
          <button
            type="button"
            onClick={onStart}
            className="mt-4 rounded-lg bg-primary-600 px-5 py-2 font-semibold text-white hover:bg-primary-700"
          >
            Start camera
          </button>
        )}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-center">
        <p className="font-semibold text-red-800">{STAGES[stage]?.label || 'Camera unavailable'}</p>
        <p className="mt-1 text-sm text-red-700">{error}</p>
        <p className="mt-2 text-sm text-red-600">Manual SAP ID entry below still works.</p>
      </div>
    );
  }

  const shown = statusOverride || STAGES[stage];
  const tone = TONES[shown.tone] || TONES.gray;

  return (
    <div className="relative">
      <style>{`@keyframes scanline{0%{transform:translateY(0)}100%{transform:translateY(150px)}}@media (prefers-reduced-motion:reduce){.scanline{animation:none!important}}`}</style>
      <div className="relative overflow-hidden rounded-lg bg-black">
        <video ref={videoRef} autoPlay playsInline muted className="w-full" style={{ maxHeight: '420px', minHeight: '280px', objectFit: 'cover' }} />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="relative h-40 w-[72%] max-w-xl rounded-lg border-2 border-emerald-400/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.28)]">
            <div className="absolute left-0 top-0 h-6 w-6 rounded-tl border-l-4 border-t-4 border-emerald-300" />
            <div className="absolute right-0 top-0 h-6 w-6 rounded-tr border-r-4 border-t-4 border-emerald-300" />
            <div className="absolute bottom-0 left-0 h-6 w-6 rounded-bl border-b-4 border-l-4 border-emerald-300" />
            <div className="absolute bottom-0 right-0 h-6 w-6 rounded-br border-b-4 border-r-4 border-emerald-300" />
            {!locked && (
              <div className="absolute inset-x-1 inset-y-1 overflow-hidden">
                <div
                  className="scanline bg-emerald-300/90 shadow-[0_0_8px_rgba(110,231,183,0.9)]"
                  style={{ height: '2px', animation: 'scanline 2.2s linear infinite alternate' }}
                />
              </div>
            )}
          </div>
        </div>
        <div className="absolute left-3 top-3 flex items-center gap-2">
          <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold ${tone}`} role="status" aria-live="polite">
            <span className={`h-2 w-2 rounded-full bg-current ${stage === 'searching' && !statusOverride ? 'animate-pulse' : ''}`} />
            {shown.label}
          </span>
        </div>
        <div className="pointer-events-none absolute bottom-3 left-0 right-0 text-center">
          <span className="rounded-full bg-black/60 px-4 py-1.5 text-sm text-white">Hold the ID card so the barcode is inside the frame</span>
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

      {showHelp && (
        <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Not reading? Hold the card flat 15-25 cm from the camera, add light or avoid glare, keep it steady for a second, or use manual entry.
        </p>
      )}

      {showDebug && stats && <pre className="mt-2 rounded bg-gray-900 p-2 text-[11px] text-green-300">{JSON.stringify(stats)}</pre>}
    </div>
  );
}
