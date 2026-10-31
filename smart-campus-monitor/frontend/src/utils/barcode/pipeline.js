// Frame -> decoded barcode. Cheap passes first; heavier image treatments only when needed.
// Everything runs locally in the browser; no frame is ever sent to the server.
import { decodeImageData } from './wasmDecoder';
import { denoise, drawScaled, rotateBy, sharpen, stretchContrast } from '../frameProcessing';

const imageDataOf = (canvas) =>
  canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);

// Centre crop: where the guard aims the card, and where upscaling pays off.
const centreCrop = (frame, fx = 0.7, fy = 0.6, scale = 2) => {
  const w = frame.width * fx;
  const h = frame.height * fy;
  return drawScaled(frame, (frame.width - w) / 2, (frame.height - h) / 2, w, h, scale);
};

// Ordered cheapest -> most expensive. `heavy` passes are spread across live frames by scanFrameStep.
export const PASSES = [
  { id: 'raw', heavy: false, run: (f) => ({ img: f }) },
  { id: 'raw-global', heavy: false, run: (f) => ({ img: f, binarizer: 'GlobalHistogram' }) },
  { id: 'stretch', heavy: false, run: (f) => ({ img: stretchContrast(f) }) },
  { id: 'sharp', heavy: true, run: (f) => ({ img: sharpen(stretchContrast(f)) }) },
  { id: 'crop2x-sharp', heavy: true, run: (f) => ({ img: sharpen(stretchContrast(centreCrop(f))) }) },
  { id: 'denoise-stretch', heavy: true, run: (f) => ({ img: stretchContrast(denoise(f)) }) },
  { id: 'crop3x-denoise', heavy: true, run: (f) => ({ img: stretchContrast(denoise(centreCrop(f, 0.6, 0.5, 3))) }) },
  // Deskew guesses: 1D readers scan along rows, so a code rotated more than ~10 degrees needs straightening.
  ...[-12, 12, -25, 25, -40, 40].map((deg) => ({
    id: `rot${deg}`,
    heavy: true,
    run: (f) => ({ img: stretchContrast(rotateBy(centreCrop(f, 0.8, 0.8, 1.5), deg)) }),
  })),
];

const runPass = async (pass, frame, formats, readerOptions = {}) => {
  const { img, binarizer } = pass.run(frame);
  const hit = await decodeImageData(imageDataOf(img), { formats, binarizer, ...readerOptions });
  return hit ? { ...hit, pass: pass.id } : null;
};

/** Every pass on one frame — used by the benchmark and by the "Capture" button. */
export const scanFrameFull = async (frame, formats = []) => {
  const started = performance.now();
  for (const pass of PASSES) {
    const hit = await runPass(pass, frame, formats);
    if (hit) return { ...hit, totalMs: performance.now() - started };
  }
  return null;
};

const PHOTO_PASS_IDS = new Set([
  'raw', 'raw-global', 'stretch', 'sharp', 'crop2x-sharp',
  'rot-12', 'rot12', 'rot-25', 'rot25',
]);

/** Still-photo reader: fewer expensive transforms, with progress between passes. */
export const scanFramePhoto = async (frame, formats = [], onProgress = null) => {
  const started = performance.now();
  const passes = PASSES.filter((pass) => PHOTO_PASS_IDS.has(pass.id));

  for (let index = 0; index < passes.length; index += 1) {
    const pass = passes[index];
    if (onProgress) {
      onProgress({ current: index + 1, total: passes.length });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    const hit = await runPass(pass, frame, formats, {
      tryHarder: false,
      tryRotate: false,
      tryInvert: true,
      tryDownscale: false,
    });
    if (hit) return { ...hit, totalMs: performance.now() - started };
  }

  return null;
};

/**
 * Live scanning: each tick runs the two cheap passes plus ONE heavy pass (round-robin),
 * keeping CPU low while still covering every treatment within a few frames.
 */
export const scanFrameStep = async (frame, tick, formats = []) => {
  const light = PASSES.filter((p) => !p.heavy);
  const heavy = PASSES.filter((p) => p.heavy);
  for (const pass of [...light, heavy[tick % heavy.length]]) {
    const hit = await runPass(pass, frame, formats);
    if (hit) return hit;
  }
  return null;
};
