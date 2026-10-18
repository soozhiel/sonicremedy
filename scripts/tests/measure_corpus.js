#!/usr/bin/env node
// Fallback-rate measurement over the frozen Phase 2 corpus.
// Usage: node scripts/tests/measure_corpus.js [engineDir] [--json out.json]
// engineDir defaults to the repo root (discovery.js + data/). A result counts as a "fixed
// starting point" when the engine added it as last-resort padding (score 0, not the sleep default,
// or flagged fill === 'start').
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const jsonIdx = args.indexOf('--json');
const out = jsonIdx >= 0 ? args[jsonIdx + 1] : null;
const dir = path.resolve(args.filter((a, i) => i !== jsonIdx && i !== jsonIdx + 1)[0] || path.join(__dirname, '../..'));
const api = require(path.join(dir, 'discovery.js'));
const data = JSON.parse(fs.readFileSync(path.join(dir, 'data/songs.json'), 'utf8'));
let expr = null;
try { expr = JSON.parse(fs.readFileSync(path.join(dir, 'data/expressions.json'), 'utf8')); } catch (e) { /* baseline has none */ }
const eng = api.createEngine(data, expr);
const corpus = JSON.parse(fs.readFileSync(path.join(__dirname, 'corpus/phase2_corpus.json'), 'utf8'));
function isFixed(r, res) { return r.fill === 'start' || (!res.sleepDefault && r.score === 0); }
const rows = corpus.items.map(function (it) {
  const r = eng.recommend(it.text);
  const fixed = r.results.filter(function (x) { return isFixed(x, r); }).length;
  const real = r.results.length - fixed;
  return { id: it.id, theme: it.theme, heldout: it.heldout, text: it.text, status: r.status, n: r.results.length, real: real, fixed: fixed,
    ids: r.results.map(function (x) { return x.song.id + (isFixed(x, r) ? '*' : ''); }) };
});
function stats(rs) {
  const n = rs.length || 1;
  const pct = function (k) { return +(100 * rs.filter(k).length / n).toFixed(1); };
  return { n: rs.length,
    genericFallback: pct(function (r) { return r.n > 0 && r.real === 0; }),
    partiallyPadded: pct(function (r) { return r.real > 0 && r.fixed > 0; }),
    fewerThan3: pct(function (r) { return r.n < 3; }),
    empty: pct(function (r) { return r.status === 'empty'; }),
    full3Real: pct(function (r) { return r.real === 3; }) };
}
const main = rows.filter(function (r) { return !r.heldout; });
const report = { engineDir: dir, overall: stats(main), heldout: stats(rows.filter(function (r) { return r.heldout; })), all: stats(rows), perTheme: {} };
Array.from(new Set(main.map(function (r) { return r.theme; }))).forEach(function (t) { report.perTheme[t] = stats(main.filter(function (r) { return r.theme === t; })); });
if (out) fs.writeFileSync(out, JSON.stringify({ report: report, rows: rows }, null, 1));
console.log(JSON.stringify(report, null, 1));
