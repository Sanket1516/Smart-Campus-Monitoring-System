import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';

export default function BarcodeScanner({ onScan, enabled = true }) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!enabled) {
      // Stop everything when disabled
      if (controlsRef.current) {
        controlsRef.current.stop();
        controlsRef.current = null;
      }
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
        videoRef.current.srcObject = null;
      }
      return;
    }

    const reader = new BrowserMultiFormatReader();
    let cancelled = false;

    const startScanning = async () => {
      try {
        const devices = await BrowserMultiFormatReader.listVideoInputDevices();
        if (devices.length === 0) {
          setError('No camera found. Please connect a webcam.');
          return;
        }
        if (cancelled) return;

        const controls = await reader.decodeFromVideoDevice(
          undefined,
          videoRef.current,
          (result, err) => {
            if (result) {
              onScan(result.getText());
            }
            if (err && err.name !== 'NotFoundException') {
              console.warn('Scanner warning:', err.message);
            }
          }
        );
        controlsRef.current = controls;
        setError('');
      } catch (err) {
        if (cancelled) return;
        console.error('Camera error:', err);
        if (err.name === 'NotAllowedError') {
          setError('Camera access denied. Please allow camera access in your browser settings.');
        } else {
          setError(`Camera error: ${err.message}`);
        }
      }
    };

    startScanning();

    return () => {
      cancelled = true;
      if (controlsRef.current) {
        controlsRef.current.stop();
        controlsRef.current = null;
      }
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach((t) => t.stop());
        videoRef.current.srcObject = null;
      }
    };
  }, [enabled, onScan]);

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
          <video
            ref={videoRef}
            className="w-full scanner-video"
            style={{ maxHeight: '400px' }}
          />
          {/* Scan target overlay */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-64 h-40 border-2 border-green-400 rounded-lg opacity-70">
              <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-green-400 rounded-tl" />
              <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-green-400 rounded-tr" />
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-green-400 rounded-bl" />
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-green-400 rounded-br" />
            </div>
          </div>
          <div className="absolute bottom-4 left-0 right-0 text-center">
            <span className="bg-black/60 text-white px-4 py-2 rounded-full text-sm">
              Position barcode within the frame
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
