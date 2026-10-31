#!/usr/bin/env node
/**
 * Summarise pilot JSONL logs (server ADMS log and sidecar pilot log). Prints counts per
 * step, return-code histograms and latency percentiles. It reports only what is in the logs.
 *
 *   node tools/pilot/summarize.js pilot-adms.jsonl pilot-sidecar.jsonl
 */
const fs = require('fs');

const files = process.argv.slice(2);
if (!files.length) {
  console.error('usage: summarize.js <log.jsonl> [...]');
  process.exit(1);
}

const entries = files.flatMap((file) =>
  fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line, index) => {
      try {
        return { ...JSON.parse(line), _file: file };
      } catch (_error) {
        console.warn(`${file}:${index + 1} is not JSON, skipped`);
        return null;
      }
    })
    .filter(Boolean)
);

const pct = (values) => {
  if (!values.length) return '-';
  const s = [...values].sort((a, b) => a - b);
  const q = (p) => s[Math.min(s.length - 1, Math.floor(p * s.length))];
  return `n=${s.length} min=${s[0]} p50=${q(0.5)} p95=${q(0.95)} max=${s[s.length - 1]}`;
};

const byStep = {};
entries.forEach((entry) => {
  const key = entry.step || 'unknown';
  byStep[key] = byStep[key] || [];
  byStep[key].push(entry);
});

console.log(`Entries: ${entries.length} from ${files.length} file(s)`);
Object.entries(byStep).forEach(([step, rows]) => {
  const codes = {};
  rows.forEach((row) => {
    const code = row.result_code ?? row.ok ?? row.verify_outcome;
    if (code !== undefined) codes[String(code)] = (codes[String(code)] || 0) + 1;
  });
  const latencies = rows.map((r) => r.latency_ms ?? r.ack_latency_ms ?? r.delivery_latency_ms).filter((v) => typeof v === 'number');
  const terminals = Array.from(new Set(rows.map((r) => r.terminal_sn).filter(Boolean)));
  console.log(`\n[${step}] ${rows.length} event(s) terminals=${terminals.join(',') || '-'}`);
  if (Object.keys(codes).length) console.log(`  results: ${JSON.stringify(codes)}`);
  if (latencies.length) console.log(`  latency_ms: ${pct(latencies)}`);
  const sizes = rows.filter((r) => r.size_match).map((r) => r.size_match);
  if (sizes.length) console.log(`  Size= interpretation: ${JSON.stringify(sizes.reduce((a, s) => ({ ...a, [s]: (a[s] || 0) + 1 }), {}))}`);
  const dialects = rows.filter((r) => r.dialect).map((r) => `${r.terminal_sn}:${r.dialect}/${r.push_version || '?'}`);
  if (step === 'handshake' && dialects.length) console.log(`  dialect/pushver: ${Array.from(new Set(dialects)).join(', ')}`);
});
