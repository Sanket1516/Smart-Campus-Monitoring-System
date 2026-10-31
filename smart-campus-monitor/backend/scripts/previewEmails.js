/**
 * Renders every email scenario to backend/email-previews/ (HTML + plain text + index.html).
 * Uses FIXTURE data only (no database, nothing is sent). Open index.html in a browser.
 *
 * Usage:  npm run email:preview
 */
const fs = require('fs');
const path = require('path');
const { buildContext } = require('../services/emailTemplates/context');
const { render } = require('../services/emailTemplates/render');
const { PNG_DIR } = require('../services/emailTemplates');
const { SCENARIOS } = require('../services/emailTemplates/fixtures');

const OUT = path.join(__dirname, '..', 'email-previews');
fs.mkdirSync(OUT, { recursive: true });

// Browsers cannot resolve cid: URLs, so previews inline the PNGs as data URIs.
const inlineCids = (html) =>
  html.replace(/cid:([\w-]+)@campus/g, (_m, name) => {
    const file = path.join(PNG_DIR, `${name}.png`);
    return fs.existsSync(file) ? `data:image/png;base64,${fs.readFileSync(file).toString('base64')}` : '';
  });

const rows = [];
for (const scenario of SCENARIOS) {
  const ctx = buildContext({ ...scenario.input, env: scenario.env || {} });
  const out = render(ctx);
  fs.writeFileSync(path.join(OUT, `${scenario.id}.html`), inlineCids(out.html));
  fs.writeFileSync(path.join(OUT, `${scenario.id}.txt`), out.text);
  rows.push(`<tr><td>${scenario.id}</td><td>${scenario.title}</td><td>${out.subject.replace(/</g, '&lt;')}</td><td><a href="${scenario.id}.html">html</a> · <a href="${scenario.id}.txt">text</a></td></tr>`);
}
fs.writeFileSync(
  path.join(OUT, 'index.html'),
  `<!doctype html><meta charset="utf-8"><title>Email previews</title><body style="font-family:sans-serif;padding:24px"><h1>Email previews (fixture data)</h1><table cellpadding="8" border="1" style="border-collapse:collapse">${rows.join('')}</table></body>`
);
console.log(`Rendered ${SCENARIOS.length} scenarios to ${OUT}`);
