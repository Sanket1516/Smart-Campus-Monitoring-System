/**
 * Renders the email icon + header-visual PNGs from SVG sources using headless Edge/Chrome.
 * Output: services/emailTemplates/assets/png/*.png (committed; only re-run to change artwork).
 *
 * Usage:  npm run email:assets
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { ICONS } = require('../services/emailTemplates/assets/icons');

const OUT = path.join(__dirname, '..', 'services', 'emailTemplates', 'assets', 'png');
const BROWSERS = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
];
const browser = BROWSERS.find((p) => fs.existsSync(p));
if (!browser) throw new Error('Edge or Chrome is required to render the email assets');

const COBALT = '#2F5FD0';
const stroke = (color, w = 1.8) =>
  `fill="none" stroke="${color}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;

const iconSvg = (body, color = COBALT, size = 48) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" ${stroke(color)}>${body}</svg>`;

// Security-themed header visual: shield inside concentric rings on a faint grid, accent-coloured.
const visualSvg = (accent, glyph) => `
<svg xmlns="http://www.w3.org/2000/svg" width="520" height="360" viewBox="0 0 260 180">
  <g fill="none" stroke="#7FA2FF" stroke-opacity="0.18" stroke-width="1">
    <circle cx="150" cy="92" r="84"/><circle cx="150" cy="92" r="62"/><circle cx="150" cy="92" r="40"/>
    <path d="M20 150H250M20 118H250M20 60H250M20 28H250" stroke-opacity="0.07"/>
    <path d="M60 10V170M100 10V170M200 10V170M240 10V170" stroke-opacity="0.07"/>
  </g>
  <circle cx="150" cy="92" r="84" fill="none" stroke="${accent}" stroke-opacity="0.55" stroke-width="1.4" stroke-dasharray="3 9" stroke-linecap="round"/>
  <g transform="translate(110 52) scale(3.3)" fill="#10224f" fill-opacity="0.85" stroke="#EAF0FF" stroke-width="0.9" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.2-7.5 9.5-4.3-1.3-7.5-4.9-7.5-9.5V6L12 3z" stroke="#EAF0FF"/>
  </g>
  <g transform="translate(110 52) scale(3.3)" fill="none" stroke="${accent}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${glyph}</g>
  <circle cx="64" cy="48" r="3" fill="${accent}"/><circle cx="232" cy="140" r="2.4" fill="#7FA2FF"/><circle cx="48" cy="130" r="2" fill="#7FA2FF" fill-opacity="0.6"/>
</svg>`;

const markSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="88" height="88" viewBox="0 0 24 24" ${stroke('#FFFFFF', 1.7)}>${ICONS.shield}</svg>`;

const jobs = {};
for (const [name, body] of Object.entries(ICONS)) jobs[`icon-${name}`] = { svg: iconSvg(body), w: 48, h: 48 };
jobs['visual-entry'] = {
  svg: visualSvg('#34D399', '<polyline points="8.6 12.2 11 14.6 15.6 9.4"/>'),
  w: 520,
  h: 360,
};
jobs['visual-exit'] = {
  svg: visualSvg('#FBBF24', '<line x1="8" y1="12" x2="16" y2="12"/><polyline points="12.8 8.8 16 12 12.8 15.2"/>'),
  w: 520,
  h: 360,
};
jobs['mark'] = { svg: markSvg, w: 88, h: 88 };

fs.mkdirSync(OUT, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'email-assets-'));
for (const [name, { svg, w, h }] of Object.entries(jobs)) {
  if (!process.env.FORCE && fs.existsSync(path.join(OUT, `${name}.png`))) continue; // FORCE=1 redoes everything
  const html = path.join(tmp, `${name}.html`);
  fs.writeFileSync(
    html,
    `<!doctype html><html><body style="margin:0;background:transparent;overflow:hidden">${svg}</body></html>`
  );
  const png = path.join(OUT, `${name}.png`);
  const r = spawnSync(
    browser,
    [
      '--headless=new',
      '--disable-gpu',
      '--hide-scrollbars',
      '--default-background-color=00000000',
      `--window-size=${w},${h}`,
      `--screenshot=${png}`,
      `file:///${html.replace(/\\/g, '/')}`,
    ],
    { encoding: 'utf8' }
  );
  if (r.status !== 0 || !fs.existsSync(png)) throw new Error(`Failed to render ${name}: ${r.stderr}`);
}
console.log(`Rendered ${Object.keys(jobs).length} PNGs to ${OUT}`);
