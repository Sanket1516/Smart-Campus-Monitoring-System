// Pixel helpers that make blurry / low-contrast / badly lit camera frames decodable.
// All functions work on canvases and return new canvases (inputs are never mutated).

const makeCanvas = (width, height) => {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width));
  canvas.height = Math.max(1, Math.round(height));
  return canvas;
};

export const drawScaled = (source, sx, sy, sw, sh, scale = 1) => {
  const canvas = makeCanvas(sw * scale, sh * scale);
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
};

const mapPixels = (canvas, fn) => {
  const out = makeCanvas(canvas.width, canvas.height);
  const ctx = out.getContext('2d', { willReadFrequently: true });
  const image = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, canvas.width, canvas.height);
  fn(image.data, canvas.width, canvas.height);
  ctx.putImageData(image, 0, 0);
  return out;
};

const luma = (d, i) => 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];

export const grayscale = (canvas) =>
  mapPixels(canvas, (d) => {
    for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = luma(d, i);
  });

/** Histogram stretch (1%-99%) — rescues washed-out or dim frames. */
export const stretchContrast = (canvas) =>
  mapPixels(canvas, (d) => {
    const hist = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) hist[Math.round(luma(d, i))] += 1;
    const total = d.length / 4;
    let lo = 0;
    let hi = 255;
    for (let acc = 0; lo < 255; lo += 1) {
      acc += hist[lo];
      if (acc > total * 0.01) break;
    }
    for (let acc = 0; hi > 0; hi -= 1) {
      acc += hist[hi];
      if (acc > total * 0.01) break;
    }
    const range = Math.max(1, hi - lo);
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.max(0, Math.min(255, ((luma(d, i) - lo) * 255) / range));
      d[i] = d[i + 1] = d[i + 2] = v;
    }
  });

/** Unsharp mask — recovers edges on out-of-focus bars. */
export const sharpen = (canvas, amount = 1.4) =>
  mapPixels(canvas, (d, w, h) => {
    const gray = new Float32Array(w * h);
    for (let p = 0; p < gray.length; p += 1) gray[p] = luma(d, p * 4);
    const blur = new Float32Array(w * h);
    for (let y = 1; y < h - 1; y += 1) {
      for (let x = 1; x < w - 1; x += 1) {
        const p = y * w + x;
        blur[p] =
          (gray[p - w - 1] + gray[p - w] + gray[p - w + 1] + gray[p - 1] + gray[p] + gray[p + 1] + gray[p + w - 1] + gray[p + w] + gray[p + w + 1]) / 9;
      }
    }
    for (let p = 0; p < gray.length; p += 1) {
      const v = Math.max(0, Math.min(255, gray[p] + amount * (gray[p] - blur[p])));
      d[p * 4] = d[p * 4 + 1] = d[p * 4 + 2] = v;
    }
  });

/** Otsu global threshold -> pure black/white. */
export const binarizeOtsu = (canvas, invert = false) =>
  mapPixels(canvas, (d) => {
    const hist = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) hist[Math.round(luma(d, i))] += 1;
    const total = d.length / 4;
    let sum = 0;
    for (let t = 0; t < 256; t += 1) sum += t * hist[t];
    let sumB = 0;
    let wB = 0;
    let best = 0;
    let threshold = 127;
    for (let t = 0; t < 256; t += 1) {
      wB += hist[t];
      if (!wB) continue;
      const wF = total - wB;
      if (!wF) break;
      sumB += t * hist[t];
      const between = wB * wF * (sumB / wB - (sum - sumB) / wF) ** 2;
      if (between > best) {
        best = between;
        threshold = t;
      }
    }
    for (let i = 0; i < d.length; i += 4) {
      const on = luma(d, i) > threshold;
      const v = on !== invert ? 255 : 0;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
  });

/** Local-mean adaptive threshold (integral image) — handles uneven lighting and shadows. */
export const binarizeAdaptive = (canvas, windowFraction = 0.08, bias = 8) =>
  mapPixels(canvas, (d, w, h) => {
    const integral = new Float64Array((w + 1) * (h + 1));
    for (let y = 0; y < h; y += 1) {
      let row = 0;
      for (let x = 0; x < w; x += 1) {
        row += luma(d, (y * w + x) * 4);
        integral[(y + 1) * (w + 1) + x + 1] = integral[y * (w + 1) + x + 1] + row;
      }
    }
    const r = Math.max(4, Math.round(Math.max(w, h) * windowFraction));
    for (let y = 0; y < h; y += 1) {
      const y0 = Math.max(0, y - r);
      const y1 = Math.min(h - 1, y + r);
      for (let x = 0; x < w; x += 1) {
        const x0 = Math.max(0, x - r);
        const x1 = Math.min(w - 1, x + r);
        const area = (x1 - x0 + 1) * (y1 - y0 + 1);
        const sum =
          integral[(y1 + 1) * (w + 1) + x1 + 1] -
          integral[y0 * (w + 1) + x1 + 1] -
          integral[(y1 + 1) * (w + 1) + x0] +
          integral[y0 * (w + 1) + x0];
        const i = (y * w + x) * 4;
        const v = luma(d, i) < sum / area - bias ? 0 : 255;
        d[i] = d[i + 1] = d[i + 2] = v;
      }
    }
  });

export const invert = (canvas) =>
  mapPixels(canvas, (d) => {
    for (let i = 0; i < d.length; i += 4) {
      d[i] = 255 - d[i];
      d[i + 1] = 255 - d[i + 1];
      d[i + 2] = 255 - d[i + 2];
    }
  });

export const rotate90 = (canvas) => {
  const out = makeCanvas(canvas.height, canvas.width);
  const ctx = out.getContext('2d', { willReadFrequently: true });
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  return out;
};

/** Mean Laplacian-ish sharpness score; low values mean the frame is too blurry to bother decoding. */
export const sharpnessScore = (canvas) => {
  const small = drawScaled(canvas, 0, 0, canvas.width, canvas.height, Math.min(1, 320 / canvas.width));
  const { data, width, height } = small.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, small.width, small.height);
  let acc = 0;
  let n = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const p = (y * width + x) * 4;
      const c = luma(data, p);
      acc += Math.abs(4 * c - luma(data, p - 4) - luma(data, p + 4) - luma(data, p - width * 4) - luma(data, p + width * 4));
      n += 1;
    }
  }
  return n ? acc / n : 0;
};

/** 3x3 box blur — suppresses sensor noise before thresholding (dim scenes). */
export const denoise = (canvas) =>
  mapPixels(canvas, (d, w, h) => {
    const gray = new Float32Array(w * h);
    for (let p = 0; p < gray.length; p += 1) gray[p] = luma(d, p * 4);
    for (let y = 1; y < h - 1; y += 1) {
      for (let x = 1; x < w - 1; x += 1) {
        const p = y * w + x;
        const v =
          (gray[p - w - 1] + gray[p - w] + gray[p - w + 1] + gray[p - 1] + gray[p] + gray[p + 1] + gray[p + w - 1] + gray[p + w] + gray[p + w + 1]) / 9;
        d[p * 4] = d[p * 4 + 1] = d[p * 4 + 2] = v;
      }
    }
  });

/** Rotate by `deg` degrees about the centre, keeping the canvas size (edges filled mid-grey). */
export const rotateBy = (canvas, deg) => {
  const out = makeCanvas(canvas.width, canvas.height);
  const ctx = out.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  return out;
};

/** Unsharp mask with a configurable radius (separable box blur): recovers bars from real defocus blur. */
export const unsharp = (canvas, radius = 4, amount = 3) =>
  mapPixels(canvas, (d, w, h) => {
    const n = w * h;
    const gray = new Float32Array(n);
    for (let p = 0; p < n; p += 1) gray[p] = luma(d, p * 4);
    const tmp = new Float32Array(n);
    const blur = new Float32Array(n);
    const win = radius * 2 + 1;
    for (let y = 0; y < h; y += 1) {
      let acc = 0;
      for (let x = -radius; x <= radius; x += 1) acc += gray[y * w + Math.min(w - 1, Math.max(0, x))];
      for (let x = 0; x < w; x += 1) {
        tmp[y * w + x] = acc / win;
        acc += gray[y * w + Math.min(w - 1, x + radius + 1)] - gray[y * w + Math.max(0, x - radius)];
      }
    }
    for (let x = 0; x < w; x += 1) {
      let acc = 0;
      for (let y = -radius; y <= radius; y += 1) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x];
      for (let y = 0; y < h; y += 1) {
        blur[y * w + x] = acc / win;
        acc += tmp[Math.min(h - 1, y + radius + 1) * w + x] - tmp[Math.max(0, y - radius) * w + x];
      }
    }
    for (let p = 0; p < n; p += 1) {
      const v = Math.max(0, Math.min(255, gray[p] + amount * (gray[p] - blur[p])));
      d[p * 4] = d[p * 4 + 1] = d[p * 4 + 2] = v;
    }
  });
