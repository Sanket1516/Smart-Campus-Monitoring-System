// decodeImageData() that runs in a Web Worker when the browser has one (falls back to the main thread).
import { decodeImageData } from './wasmDecoder';

let worker = null;
let broken = typeof Worker === 'undefined';
let nextId = 0;
const pending = new Map();

const fail = (error) => {
  broken = true;
  worker?.terminate();
  worker = null;
  pending.forEach(({ reject }) => reject(error));
  pending.clear();
};

const getWorker = () => {
  if (!worker) {
    worker = new Worker(new URL('./decode.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data: { id, hit, error } }) => {
      const entry = pending.get(id);
      pending.delete(id);
      if (!entry) return;
      if (error) entry.reject(new Error(error));
      else entry.resolve(hit);
    };
    worker.onerror = () => fail(new Error('Decoder worker failed'));
  }
  return worker;
};

export const decodeOffThread = (imageData, options = {}) => {
  if (broken) return decodeImageData(imageData, options);
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    try {
      getWorker().postMessage(
        { id, buffer: imageData.data.buffer, width: imageData.width, height: imageData.height, options },
        [imageData.data.buffer]
      );
    } catch (error) {
      pending.delete(id);
      fail(error);
      reject(error);
    }
  }).catch(() => null); // the buffer was transferred; later frames use the main-thread fallback
};
