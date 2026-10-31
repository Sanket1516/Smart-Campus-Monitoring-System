import { useRef, useState } from 'react';
import { extractStudentId, firstElevenDigits } from '../utils/barcode/extractId';
import { getBarcodeFormats } from '../utils/barcode/config';
import { scanFramePhoto } from '../utils/barcode/pipeline';

const MAX_IMAGE_EDGE = 1600;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const NATIVE_FORMATS = [
  'code_128', 'code_39', 'code_93', 'codabar', 'itf', 'ean_13', 'ean_8',
  'upc_a', 'upc_e', 'qr_code', 'pdf417', 'data_matrix',
];

const loadImage = (source) => new Promise((resolve, reject) => {
  const image = new Image();
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('The photo could not be opened. Try taking it again.'));
  image.src = source;
});

const scanWithNativeDetector = async (canvas) => {
  const Detector = window.BarcodeDetector;
  if (!Detector) return null;

  try {
    const supported = typeof Detector.getSupportedFormats === 'function'
      ? await Detector.getSupportedFormats()
      : NATIVE_FORMATS;
    const formats = NATIVE_FORMATS.filter((format) => supported.includes(format));
    const detector = new Detector(formats.length ? { formats } : undefined);
    let timeoutId;
    const results = await Promise.race([
      detector.detect(canvas),
      new Promise((resolve) => {
        timeoutId = setTimeout(() => resolve([]), 3000);
      }),
    ]);
    clearTimeout(timeoutId);
    const [result] = results;
    return result ? { text: result.rawValue, format: result.format, pass: 'native' } : null;
  } catch (_error) {
    return null;
  }
};

/**
 * Opens the phone's native rear-camera capture and decodes the photo locally.
 * The photo itself is never sent to the backend.
 */
export default function PhoneBarcodeCapture({ onDetected, onValueRead = null, disabled = false }) {
  const inputRef = useRef(null);
  const busyRef = useRef(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  const handlePhoto = async (event) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file || busyRef.current) return;

    if ((file.type && !file.type.startsWith('image/')) || file.size > MAX_IMAGE_BYTES) {
      setMessage(file.size > MAX_IMAGE_BYTES ? 'Choose a photo under 20 MB.' : 'Choose an image photo.');
      return;
    }

    busyRef.current = true;
    setBusy(true);
    setMessage('Reading barcode from photo…');
    const objectUrl = URL.createObjectURL(file);

    try {
      const image = await loadImage(objectUrl);
      const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(image.naturalWidth, image.naturalHeight));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
      canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));

      const context = canvas.getContext('2d', { willReadFrequently: true });
      if (!context) throw new Error('Photo processing is unavailable in this browser.');
      context.drawImage(image, 0, 0, canvas.width, canvas.height);

      setMessage('Checking the photo…');
      const nativeHit = await scanWithNativeDetector(canvas);
      const hit = nativeHit || await scanFramePhoto(canvas, getBarcodeFormats(), ({ current, total }) => {
        setMessage(`Reading barcode (${current}/${total})…`);
      });
      if (!hit) {
        setMessage('No barcode found. Hold the card close, in focus, and without glare, then try again.');
        return;
      }

      const rawValue = String(hit.text ?? '');
      onValueRead?.(rawValue);
      const processedValue = firstElevenDigits(rawValue);
      const parsed = extractStudentId(processedValue);
      if (!parsed.ok) {
        setMessage(`Barcode found. Value read: ${rawValue}. First 11 digits: ${processedValue || 'none'}`);
        return;
      }

      setMessage(`Read ${rawValue}; processing SAP ID ${parsed.value}…`);
      await onDetected?.({
        value: parsed.value,
        format: hit.format,
        pass: `phone-photo:${hit.pass}`,
        ms: Math.round(hit.totalMs || 0),
      });
    } catch (error) {
      setMessage(error?.message || 'Could not read that photo. Try again.');
    } finally {
      URL.revokeObjectURL(objectUrl);
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handlePhoto}
        className="sr-only"
        aria-label="Take a barcode photo with the rear camera"
      />
      <div>
        <h3 className="font-semibold text-gray-800">Use your phone camera</h3>
        <p className="mt-1 text-sm text-gray-500">
          On your phone, tap the button to take a clear photo of the barcode. The image is decoded on the phone and is not uploaded.
        </p>
        {message && <p className="mt-2 break-all text-sm text-blue-700" role="status" aria-live="polite">{message}</p>}
      </div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || busy}
        className="shrink-0 rounded-lg bg-primary-600 px-4 py-2.5 font-semibold text-white hover:bg-primary-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? 'Reading photo…' : 'Take barcode photo'}
      </button>
    </div>
  );
}
