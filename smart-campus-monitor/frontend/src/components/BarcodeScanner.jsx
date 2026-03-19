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

const SCAN_COOLDOWN_MS = 2000;

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
  const lastAcceptedValueRef = useRef('');
  const lastAcceptedAtRef = useRef(0);
  const [error, setError] = useState('');

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

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

    const startScanner = async () => {
      try {
        const cameras = await Html5Qrcode.getCameras();
        if (!active) return;

        if (!cameras.length) {
          setError('No camera found. Please connect a webcam or use a mobile device camera.');
          return;
        }

        const preferredCamera =
          cameras.find((camera) => /back|rear|environment/i.test(`${camera.label} ${camera.id}`)) ||
          cameras[0];

        const scanner = new Html5Qrcode(elementIdRef.current, {
          verbose: false,
        });
        scannerRef.current = scanner;

        await scanner.start(
          preferredCamera.id,
          {
            fps: 10,
            disableFlip: false,
            formatsToSupport: SUPPORTED_BARCODE_FORMATS,
            experimentalFeatures: {
              useBarCodeDetectorIfSupported: true,
            },
            qrbox: (viewfinderWidth, viewfinderHeight) => ({
              width: Math.min(Math.floor(viewfinderWidth * 0.8), 320),
              height: Math.min(Math.floor(viewfinderHeight * 0.35), 160),
            }),
          },
          (decodedText) => {
            const value = normalizeDecodedValue(decodedText);
            const now = Date.now();

            if (!value) {
              return;
            }

            if (now - lastAcceptedAtRef.current < SCAN_COOLDOWN_MS) {
              return;
            }

            if (
              value === lastAcceptedValueRef.current &&
              now - lastAcceptedAtRef.current < SCAN_COOLDOWN_MS * 2
            ) {
              return;
            }

            if (active) {
              lastAcceptedValueRef.current = value;
              lastAcceptedAtRef.current = now;
              setError('');
              onScanRef.current(value);
            }
          },
          (scanErrorMessage) => {
            if (
              scanErrorMessage &&
              !/No MultiFormat Readers were able to detect|No barcode or QR code detected/i.test(scanErrorMessage)
            ) {
              console.warn('Scanner warning:', scanErrorMessage);
            }
          }
        );

        if (active) {
          setError('');
        }
      } catch (err) {
        if (!active) return;

        console.error('Camera error:', err);
        const message = err?.message || 'Unable to start the camera.';
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
            <div className="relative w-64 h-40 border-2 border-green-400 rounded-lg opacity-70">
              <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-green-400 rounded-tl" />
              <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-green-400 rounded-tr" />
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-green-400 rounded-bl" />
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-green-400 rounded-br" />
            </div>
          </div>
          <div className="absolute bottom-4 left-0 right-0 text-center pointer-events-none">
            <span className="bg-black/60 text-white px-4 py-2 rounded-full text-sm">
              Position barcode within the frame
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
