// Browser benchmark: renders degraded barcode frames and runs each decoder over them.
// Results are POSTed to a local receiver (see docs/BARCODE_SCANNER.md). Dev tool only.
import { FORMATS, CONDITIONS, renderFrame } from './generate';
import { decodeLegacy } from './legacyZxing';
import { decodeImageData } from '../utils/barcode/wasmDecoder';
import { scanFrameFull } from '../utils/barcode/pipeline';

const params = new URLSearchParams(location.search);
const OUT = `http://127.0.0.1:${params.get('port') || 8123}/result`;
const pick = (key) => (params.get(key) ? params.get(key).split(',') : null);
import { stretchContrast, sharpen, binarizeAdaptive } from '../utils/frameProcessing';

const log = document.getElementById('log');
const say = (m) => { log.textContent += `${m}\n`; };

const toImageData = (c) => c.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, c.width, c.height);

const decodeWasmPlain = async (frame) => {
  const t = performance.now();
  const r = await decodeImageData(toImageData(frame));
  return { text: r?.text ?? null, ms: performance.now() - t };
};

// Production pipeline: plain decode, then enhanced variants only if the first pass fails.
const decodeWasmEnhanced = async (frame) => {
  const t = performance.now();
  const passes = [(f) => f, (f) => stretchContrast(f), (f) => sharpen(stretchContrast(f)), (f) => binarizeAdaptive(stretchContrast(f))];
  for (const pass of passes) {
    const r = await decodeImageData(toImageData(pass(frame)));
    if (r) return { text: r.text, ms: performance.now() - t };
  }
  return { text: null, ms: performance.now() - t };
};

const decodeV2 = async (frame) => {
  const t = performance.now();
  const r = await scanFrameFull(frame);
  return { text: r?.text ?? null, ms: performance.now() - t, pass: r?.pass };
};

const ALL_DECODERS = {
  'wasm pipeline v2 (all passes)': decodeV2,
  'zxing-js (old, all 8 variants)': (f) => Promise.resolve(decodeLegacy(f)),
  'zxing-wasm (single pass)': decodeWasmPlain,
  'zxing-wasm + enhance fallback': decodeWasmEnhanced,
};
const wantDec = pick('dec');
const DECODERS = Object.fromEntries(Object.entries(ALL_DECODERS).filter(([k]) => !wantDec || wantDec.some((w) => k.includes(w))));

const show = params.get('show');
if (show) {
  const cond = CONDITIONS.find((c) => c.id === show);
  const base = FORMATS.find((f) => f.id === (params.get('fmt') || 'code128'));
  const fmt = { ...base, text: params.get('text') || base.text };
  const c = renderFrame(fmt, cond);
  document.body.innerHTML = '';
  document.body.style.margin = '0';
  document.body.appendChild(c);
  throw new Error('show mode');
}

const run = async () => {
  const rows = [];
  const warm = renderFrame(FORMATS[0], CONDITIONS[0]);
  for (const d of Object.values(DECODERS)) await d(warm); // JIT / wasm warm-up, not measured

  const wantFmt = pick('fmt');
  for (const fmt of FORMATS.filter((f) => !wantFmt || wantFmt.includes(f.id))) {
    for (const cond of CONDITIONS) {
      const frame = renderFrame(fmt, cond);
      for (const [name, decode] of Object.entries(DECODERS)) {
        const r = await decode(frame);
        rows.push({
          decoder: name, format: fmt.id, condition: cond.id, expected: fmt.text,
          pass: r.pass, got: r.text, ok: r.text === fmt.text, wrong: r.text !== null && r.text !== fmt.text, ms: Math.round(r.ms * 10) / 10,
        });
      }
    }
    say(`done ${fmt.id}`);
    await fetch(OUT, { method: 'POST', body: JSON.stringify(rows) }); // partial results
  }
  return rows;
};

run()
  .then((rows) => fetch(OUT, { method: 'POST', body: JSON.stringify(rows) }))
  .then(() => say('POSTED'))
  .catch((e) => { say(`ERROR ${e.message}`); fetch(OUT, { method: 'POST', body: JSON.stringify({ error: String(e.stack || e) }) }); });
