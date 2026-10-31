import { useEffect, useRef, useState } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';

const SUPPORTED_BARCODE_FORMATS = [
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODABAR,
  Html5QrcodeSupportedFormats.QR_CODE,
];

// Continuous "barcode reader" behaviour:
//  - A NEW code is accepted as soon as it is read twice in a row (filters 1D misreads).
//  - The SAME code is not re-submitted while the card stays in front of the camera.
//    It is accepted again only after it has left the frame for ABSENCE_RESET_MS and
//    at least SAME_CODE_REPEAT_MS has passed (prevents an accidental entry->exit toggle).
const CONFIRM_WINDOW_MS = 1500;
const ABSENCE_RESET_MS = 1200;
const SAME_CODE_REPEAT_MS = 5000;
const FLASH_MS = 600;

function normalizeDecodedValue(decodedText) {
  if (!decodedText) return null;

  const trimmed = decodedText.trim();
  if (!trimmed) return null;

  const digitMatch = trimmed.match(/\d{9,11}/);
  return digitMatch ? digitMatch[0] : null;
}

export default function BarcodeScanner({ onScan, enabled = true }) {
  const scannerRef = useRef(null);
  const onScanRef = useRef(onScan);
  const elementIdRef = useRef(`barcode-scanner-${Math.random().toString(36).slice(2)}`);
  const candidateRef = useRef({ value: '', at: 0 });
  const lastSeenRef = useRef(new Map()); // value -> last time it was decoded
  const lastAcceptedRef = useRef(new Map()); // value -> last time it was submitted
  const flashTimerRef = useRef(null);
  const [error, setError] = useState('');
  const [flashValue, setFlashValue] = useState('');

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  useEffect(() => () => clearTimeout(flashTimerRef.current), []);

  useEffect(() => {
    const stopScanner = async () => {
      const scanner = scannerRef.current;
      scannerRef.current = null;

      if (!scanner) return;

      try {
        if (scanner.isScanning) {
          await scanner.stop();
        }
      } catch (stopError) {
        console.warn('Scanner stop warning:', stopError);
      }

      try {
        await scanner.clear();
      } catch (clearError) {
        console.warn('Scanner clear warning:', clearError);
      }
    };

    if (!enabled) {
      void stopScanner();
      return undefined;
    }

    let active = true;

    const handleDecoded = (decodedText) => {
      if (!active) return;

      const value = normalizeDecodedValue(decodedText);
      if (!value) return;

      const now = Date.now();
      const previouslySeenAt = lastSeenRef.current.get(value) || 0;
      lastSeenRef.current.set(value, now);

      // Require two matching reads in quick succession before accepting.
      const candidate = candidateRef.current;
      if (candidate.value !== value || now - candidate.at > CONFIRM_WINDOW_MS) {
        candidateRef.current = { value, at: now };
        return;
      }
      candidateRef.current = { value, at: now };

      const acceptedAt = lastAcceptedRef.current.get(value);
      if (acceptedAt) {
        const cardWasRemoved = now - previouslySeenAt > ABSENCE_RESET_MS;
        if (!cardWasRemoved || now - acceptedAt < SAME_CODE_REPEAT_MS) {
          return;
        }
      }

      lastAcceptedRef.current.set(value, now);

      // Keep the maps small.
      for (const [key, at] of lastSeenRef.current) {
        if (now - at > 60000) {
          lastSeenRef.current.delete(key);
          lastAcceptedRef.current.delete(key);
        }
      }

      setError('');
      setFlashValue(value);
      clearTimeout(flashTimerRef.current);
      flashTimerRef.current = setTimeout(() => setFlashValue(''), FLASH_MS);

      try {
        navigator.vibrate?.(80);
      } catch {
        /* vibration not supported */
      }

      onScanRef.current(value);
    };

    const handleScanFailure = (scanErrorMessage) => {
      if (
        scanErrorMessage &&
        !/No MultiFormat Readers were able to detect|No barcode or QR code detected|NotFoundException/i.test(
          scanErrorMessage
        )
      ) {
        console.warn('Scanner warning:', scanErrorMessage);
      }
    };

    const scanConfig = {
      fps: 12,
      disableFlip: false,
      formatsToSupport: SUPPORTED_BARCODE_FORMATS,
      experimentalFeatures: {
        useBarCodeDetectorIfSupported: true,
      },
      qrbox: (viewfinderWidth, viewfinderHeight) => ({
        width: Math.max(150, Math.min(Math.floor(viewfinderWidth * 0.85), 360)),
        height: Math.max(100, Math.min(Math.floor(viewfinderHeight * 0.5), 220)),
      }),
    };

    const startScanner = async () => {
      try {
        const scanner = new Html5Qrcode(elementIdRef.current, {
          verbose: false,
          formatsToSupport: SUPPORTED_BARCODE_FORMATS,
          experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        });
        scannerRef.current = scanner;

        try {
          // Rear camera via facingMode is the most reliable choice on phones.
          await scanner.start(
            { facingMode: 'environment' },
            scanConfig,
            handleDecoded,
            handleScanFailure
          );
        } catch (facingModeError) {
          if (!active) return;
          console.warn('facingMode start failed, falling back to camera list:', facingModeError);

          const cameras = await Html5Qrcode.getCameras();
          if (!active) return;

          if (!cameras.length) {
            setError('No camera found. Please connect a webcam or use a mobile device camera.');
            return;
          }

          const preferredCamera =
            cameras.find((camera) => /back|rear|environment/i.test(`${camera.label} ${camera.id}`)) ||
            cameras[cameras.length - 1];

          await scanner.start(preferredCamera.id, scanConfig, handleDecoded, handleScanFailure);
        }

        if (!active) {
          void stopScanner();
          return;
        }

        // Continuous autofocus so cards at different distances stay readable.
        try {
          await scanner.applyVideoConstraints({ advanced: [{ focusMode: 'continuous' }] });
        } catch {
          /* not supported on this device - ignore */
        }

        setError('');
      } catch (err) {
        if (!active) return;

        console.error('Camera error:', err);
        const message = err?.message || String(err || 'Unable to start the camera.');
        if (err?.name === 'NotAllowedError' || /permission|denied/i.test(message)) {
          setError('Camera access denied. Please allow camera access in your browser settings.');
        } else {
          setError(`Camera error: ${message}`);
        }
      }
    };

    void startScanner();

    return () => {
      active = false;
      void stopScanner();
    };
  }, [enabled]);

  if (!enabled) {
    return (
      <div className="bg-gray-100 rounded-lg p-12 text-center">
        <p className="text-gray-500 font-medium">Scanner paused</p>
        <p className="text-gray-400 text-sm mt-1">Click "Start" to resume scanning</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <p className="text-red-700">{error}</p>
        </div>
      ) : (
        <div className="relative rounded-lg overflow-hidden bg-black">
          <div
            id={elementIdRef.current}
            className="scanner-shell w-full"
            style={{ minHeight: '300px', maxHeight: '400px' }}
          />
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div
              className={`relative w-64 h-40 border-2 rounded-lg transition-colors duration-150 ${
                flashValue ? 'border-green-300 bg-green-400/30 opacity-100' : 'border-green-400 opacity-70'
              }`}
            >
              <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-green-400 rounded-tl" />
              <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-green-400 rounded-tr" />
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-green-400 rounded-bl" />
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-green-400 rounded-br" />
            </div>
          </div>
          <div className="absolute bottom-4 left-0 right-0 text-center pointer-events-none">
            <span className="bg-black/60 text-white px-4 py-2 rounded-full text-sm">
              {flashValue ? `Read: ${flashValue}` : 'Scanning continuously - show the next card'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
