// Runs the ZXing WASM decoder off the main thread so the video and UI never stall while decoding.
import { decodeImageData } from './wasmDecoder';

self.onmessage = async ({ data: { id, buffer, width, height, options } }) => {
  try {
    const imageData = new ImageData(new Uint8ClampedArray(buffer), width, height);
    self.postMessage({ id, hit: await decodeImageData(imageData, options) });
  } catch (error) {
    self.postMessage({ id, error: error?.message || 'decode failed' });
  }
};
