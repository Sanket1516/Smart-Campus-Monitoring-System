import { useCallback, useEffect, useRef, useState } from 'react';

const STORAGE_KEY = 'scanner.cameraId';

const readStoredCamera = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) || '';
  } catch (_e) {
    return '';
  }
};

/**
 * Opens any camera (webcam, phone, USB/document camera) at the best resolution it offers,
 * with continuous autofocus where supported. Falls back through progressively looser constraints.
 */
export default function useCamera(enabled) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [devices, setDevices] = useState([]);
  const [deviceId, setDeviceIdState] = useState(readStoredCamera);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [torch, setTorchState] = useState(false);

  const setDeviceId = useCallback((id) => {
    setDeviceIdState(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch (_e) {
      // storage unavailable — selection just won't persist
    }
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setReady(false);
    setTorchSupported(false);
    setTorchState(false);
  }, []);

  useEffect(() => {
    if (!enabled) {
      stop();
      return undefined;
    }
    let cancelled = false;

    const attempts = () => {
      const base = deviceId ? { deviceId: { exact: deviceId } } : { facingMode: { ideal: 'environment' } };
      return [
        { video: { ...base, width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 30 } } },
        { video: { ...base, width: { ideal: 1280 }, height: { ideal: 720 } } },
        { video: deviceId ? { deviceId: { exact: deviceId } } : true },
        { video: true },
      ];
    };

    const open = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('Camera API unavailable. Open this page over HTTPS or on localhost.');
        return;
      }
      let stream = null;
      let lastError = null;
      for (const constraints of attempts()) {
        try {
          stream = await navigator.mediaDevices.getUserMedia(constraints);
          break;
        } catch (err) {
          lastError = err;
          if (err.name === 'NotAllowedError' || err.name === 'SecurityError') break;
        }
      }
      if (cancelled) {
        stream?.getTracks().forEach((track) => track.stop());
        return;
      }
      if (!stream) {
        setError(
          lastError?.name === 'NotAllowedError'
            ? 'Camera access denied. Please allow camera access in your browser settings.'
            : `Camera error: ${lastError?.message || 'no camera could be opened'}`
        );
        return;
      }

      streamRef.current = stream;
      const [track] = stream.getVideoTracks();
      const caps = track.getCapabilities?.() || {};
      const advanced = [];
      if (caps.focusMode?.includes('continuous')) advanced.push({ focusMode: 'continuous' });
      if (caps.exposureMode?.includes('continuous')) advanced.push({ exposureMode: 'continuous' });
      if (caps.whiteBalanceMode?.includes('continuous')) advanced.push({ whiteBalanceMode: 'continuous' });
      if (advanced.length) await track.applyConstraints({ advanced }).catch(() => {});
      setTorchSupported(Boolean(caps.torch));

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
      }
      setError('');
      setReady(true);

      // Labels only populate after permission has been granted.
      const all = await navigator.mediaDevices.enumerateDevices();
      if (!cancelled) setDevices(all.filter((d) => d.kind === 'videoinput'));
    };

    open();
    return () => {
      cancelled = true;
      stop();
    };
  }, [enabled, deviceId, stop]);

  const setTorch = useCallback(async (on) => {
    const [track] = streamRef.current?.getVideoTracks() || [];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: on }] });
      setTorchState(on);
    } catch (_e) {
      setTorchState(false);
    }
  }, []);

  return { videoRef, devices, deviceId, setDeviceId, error, ready, torchSupported, torch, setTorch };
}
