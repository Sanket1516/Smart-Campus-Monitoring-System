// Synthetic "ID card held in front of a webcam" frames with controlled degradations.
// Deterministic (seeded) so before/after decoder comparisons are fair.
import bwipjs from 'bwip-js';

export const W = 1280;
export const H = 720;

const mulberry32 = (seed) => () => {
  seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const canvas = (w, h) => Object.assign(document.createElement('canvas'), { width: w, height: h });

export const FORMATS = [
  { id: 'code128', bcid: 'code128', text: '70552300067', height: 6 },
  { id: 'code128-leading-zero', bcid: 'code128', text: '00123456789', height: 6 },
  { id: 'code128-alnum', bcid: 'code128', text: 'E265202600123', height: 6 },
  { id: 'code39', bcid: 'code39', text: '70552300067', height: 6 },
  { id: 'itf', bcid: 'interleaved2of5', text: '705523000673', height: 6 },
  { id: 'ean13', bcid: 'ean13', text: '5901234123457', height: 6 },
  { id: 'qrcode', bcid: 'qrcode', text: '70552300067', height: 0 },
  { id: 'pdf417', bcid: 'pdf417', text: '70552300067', height: 0 },
];

const drawBarcode = (fmt) => {
  const c = canvas(10, 10);
  const opts = { bcid: fmt.bcid, text: fmt.text, scale: 3, includetext: false, paddingwidth: 12, paddingheight: 12, backgroundcolor: 'FFFFFF' };
  if (fmt.height) opts.height = fmt.height;
  if (fmt.bcid === 'pdf417') { opts.rowmult = 3; opts.columns = 3; }
  bwipjs.toCanvas(c, opts);
  return c;
};

// Card art: white card, teal SAP strip, text-like grey bars, barcode at the bottom.
const drawCard = (fmt, rand) => {
  const card = canvas(560, 350);
  const g = card.getContext('2d');
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, 560, 350);
  g.fillStyle = '#12304f'; g.fillRect(0, 0, 560, 56);
  g.fillStyle = '#2aa6a6'; g.fillRect(0, 150, 560, 44);
  g.fillStyle = '#c9ced6';
  for (let i = 0; i < 4; i += 1) g.fillRect(190, 72 + i * 18, 140 + rand() * 150, 8);
  g.fillStyle = '#9aa3b0'; g.fillRect(24, 72, 140, 64);
  const bc = drawBarcode(fmt);
  const is2d = fmt.bcid === 'qrcode' || fmt.bcid === 'pdf417';
  const maxW = is2d ? 200 : 500;
  const maxH = is2d ? 140 : 110;
  const s = Math.min(maxW / bc.width, maxH / bc.height);
  const bw = bc.width * s; const bh = bc.height * s;
  g.drawImage(bc, (560 - bw) / 2, 198 + (150 - bh) / 2, bw, bh);
  return { card, bar: { x: (560 - bw) / 2, y: 198 + (150 - bh) / 2, w: bw, h: bh } };
};

export const CONDITIONS = [
  { id: 'normal', scale: 1.0 },
  { id: 'close', scale: 1.7 },
  { id: 'far', scale: 0.55 },
  { id: 'very-far', scale: 0.4 },
  { id: 'rot-15', scale: 1.0, rot: 15 },
  { id: 'rot-30', scale: 1.0, rot: 30 },
  { id: 'rot-45', scale: 1.0, rot: 45 },
  { id: 'rot-90', scale: 1.0, rot: 90 },
  { id: 'rot-180', scale: 1.0, rot: 180 },
  { id: 'tilt', scale: 1.0, shear: [0.12, 0.28], rot: 6 },
  { id: 'low-light', scale: 1.0, brightness: 0.3, noise: 18 },
  { id: 'very-low-light', scale: 1.0, brightness: 0.17, noise: 30 },
  { id: 'glare', scale: 1.0, glare: 0.9 },
  { id: 'shadow', scale: 1.0, shadow: 0.7 },
  { id: 'blur-1px', scale: 1.0, blur: 1 },
  { id: 'blur-1.5px', scale: 1.0, blur: 1.5 },
  { id: 'blur-2px', scale: 1.0, blur: 2 },
  { id: 'blur-4px', scale: 1.0, blur: 4 },
  { id: 'blur-6px', scale: 1.0, blur: 6 },
  { id: 'damaged', scale: 1.0, damage: 3 },
  { id: 'low-res-640', scale: 1.0, lowres: 0.5 },
  { id: 'combo-rot20-blur2-dim', scale: 1.0, rot: 20, blur: 2, brightness: 0.5, noise: 12 },
  { id: 'combo-far-tilt-noise', scale: 0.6, shear: [0.1, 0.2], noise: 16 },
];

export const renderFrame = (fmt, cond, seed = 7) => {
  const rand = mulberry32(seed);
  const frame = canvas(W, H);
  const g = frame.getContext('2d', { willReadFrequently: true });

  // desk
  g.fillStyle = '#5f646c'; g.fillRect(0, 0, W, H);
  const { card, bar } = drawCard(fmt, rand);

  g.save();
  g.translate(W / 2, H / 2);
  if (cond.rot) g.rotate((cond.rot * Math.PI) / 180);
  if (cond.shear) g.transform(1, cond.shear[0], cond.shear[1], 1, 0, 0);
  g.scale(cond.scale, cond.scale);
  g.translate(-card.width / 2, -card.height / 2);
  g.drawImage(card, 0, 0);
  g.restore();

  // damage: random strokes straight through the barcode region
  if (cond.damage) {
    g.save();
    g.translate(W / 2, H / 2);
    if (cond.rot) g.rotate((cond.rot * Math.PI) / 180);
    g.scale(cond.scale, cond.scale);
    g.translate(-card.width / 2, -card.height / 2);
    for (let i = 0; i < cond.damage; i += 1) {
      g.strokeStyle = i % 2 ? '#ffffff' : '#000000';
      g.lineWidth = 3 + rand() * 4;
      const x = bar.x + rand() * bar.w;
      g.beginPath(); g.moveTo(x, bar.y - 4); g.lineTo(x + (rand() - 0.5) * 20, bar.y + bar.h + 4); g.stroke();
    }
    g.restore();
  }

  let out = frame;
  if (cond.lowres) {
    const small = canvas(W * cond.lowres, H * cond.lowres);
    small.getContext('2d').drawImage(out, 0, 0, small.width, small.height);
    const up = canvas(W, H); const ug = up.getContext('2d', { willReadFrequently: true });
    ug.imageSmoothingEnabled = true; ug.drawImage(small, 0, 0, W, H); out = up;
  }
  if (cond.blur) {
    const b = canvas(W, H); const bg = b.getContext('2d', { willReadFrequently: true });
    bg.filter = `blur(${cond.blur}px)`; bg.drawImage(out, 0, 0); out = b;
  }
  const og = out.getContext('2d', { willReadFrequently: true });
  if (cond.glare) {
    const grad = og.createRadialGradient(W / 2 + 40, H / 2 + 60, 10, W / 2 + 40, H / 2 + 60, 230);
    grad.addColorStop(0, `rgba(255,255,255,${cond.glare})`); grad.addColorStop(1, 'rgba(255,255,255,0)');
    og.fillStyle = grad; og.fillRect(0, 0, W, H);
  }
  if (cond.shadow) {
    const grad = og.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0.35, 'rgba(0,0,0,0)'); grad.addColorStop(0.6, `rgba(0,0,0,${cond.shadow})`);
    og.fillStyle = grad; og.fillRect(0, 0, W, H);
  }
  if (cond.brightness !== undefined || cond.noise) {
    const img = og.getImageData(0, 0, W, H); const d = img.data;
    const k = cond.brightness ?? 1; const n = cond.noise || 0;
    for (let i = 0; i < d.length; i += 4) {
      const noise = n ? (rand() + rand() + rand() - 1.5) * n * 1.6 : 0;
      d[i] = Math.max(0, Math.min(255, d[i] * k + noise));
      d[i + 1] = Math.max(0, Math.min(255, d[i + 1] * k + noise));
      d[i + 2] = Math.max(0, Math.min(255, d[i + 2] * k + noise));
    }
    og.putImageData(img, 0, 0);
  }
  return out;
};
