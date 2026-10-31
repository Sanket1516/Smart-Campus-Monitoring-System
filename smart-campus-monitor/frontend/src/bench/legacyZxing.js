// The previous decoder (zxing-js), kept ONLY so the benchmark can compare it against the new one.
import {
  BarcodeFormat, BinaryBitmap, DecodeHintType, GlobalHistogramBinarizer,
  HTMLCanvasElementLuminanceSource, HybridBinarizer, MultiFormatReader,
} from '@zxing/library';
import { binarizeAdaptive, drawScaled, invert, rotate90, sharpen, stretchContrast } from '../utils/frameProcessing';

const FORMATS = [BarcodeFormat.CODE_128, BarcodeFormat.CODE_39, BarcodeFormat.CODE_93, BarcodeFormat.EAN_13,
  BarcodeFormat.EAN_8, BarcodeFormat.UPC_A, BarcodeFormat.UPC_E, BarcodeFormat.ITF, BarcodeFormat.CODABAR,
  BarcodeFormat.QR_CODE, BarcodeFormat.DATA_MATRIX, BarcodeFormat.PDF_417];

const reader = new MultiFormatReader();
reader.setHints(new Map([[DecodeHintType.POSSIBLE_FORMATS, FORMATS], [DecodeHintType.TRY_HARDER, true]]));

const tryDecode = (canvas) => {
  const source = new HTMLCanvasElementLuminanceSource(canvas);
  for (const Binarizer of [HybridBinarizer, GlobalHistogramBinarizer]) {
    try {
      return reader.decodeWithState(new BinaryBitmap(new Binarizer(source))).getText();
    } catch (_e) { /* not found */ }
  }
  return null;
};

export const VARIANTS = [
  (f) => f, (f) => stretchContrast(f), (f) => sharpen(stretchContrast(f)),
  (f) => { const w = f.width * 0.7, h = f.height * 0.5; return sharpen(stretchContrast(drawScaled(f, (f.width - w) / 2, (f.height - h) / 2, w, h, f.width < 1400 ? 2 : 1))); },
  (f) => binarizeAdaptive(stretchContrast(f)), (f) => rotate90(sharpen(stretchContrast(f))),
  (f) => invert(stretchContrast(f)),
  (f) => binarizeAdaptive(sharpen(stretchContrast(drawScaled(f, 0, 0, f.width, f.height, 0.6))), 0.05, 6),
];

/** Best case for the old pipeline: every variant is tried on the same frame. */
export const decodeLegacy = (frameCanvas) => {
  const started = performance.now();
  for (const variant of VARIANTS) {
    const text = tryDecode(variant(frameCanvas));
    if (text) return { text, ms: performance.now() - started };
  }
  return { text: null, ms: performance.now() - started };
};
