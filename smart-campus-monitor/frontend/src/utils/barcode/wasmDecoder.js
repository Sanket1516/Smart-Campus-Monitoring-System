// zxing-cpp compiled to WebAssembly (via zxing-wasm). The .wasm ships with the app (no CDN needed).
import { readBarcodes, setZXingModuleOverrides } from 'zxing-wasm/reader';
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url';

setZXingModuleOverrides({
  locateFile: (path, prefix) => (path.endsWith('.wasm') ? wasmUrl : prefix + path),
});

/**
 * Decode one frame (ImageData). Returns the first valid symbol { text, format, ms } or null.
 * `rawText` is exactly what the barcode encodes — nothing is trimmed or converted here, so leading zeros survive.
 */
export const decodeImageData = async (
  imageData,
  {
    formats = [],
    binarizer = 'LocalAverage',
    tryHarder = true,
    tryRotate = true,
    tryInvert = true,
    tryDownscale = true,
  } = {}
) => {
  const started = performance.now();
  const results = await readBarcodes(imageData, {
    formats,
    binarizer,
    tryHarder,
    tryRotate,
    tryInvert,
    tryDownscale,
    maxNumberOfSymbols: 1,
  });
  const hit = results.find((r) => r.isValid);
  return hit ? { text: hit.text, format: hit.format, ms: performance.now() - started } : null;
};
