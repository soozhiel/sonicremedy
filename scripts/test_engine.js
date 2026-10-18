// Run: node scripts/test_engine.js [--json out.json]
const fs = require('fs');
const path = require('path');
const { createEngine } = require('../discovery.js');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'songs.json'), 'utf8'));
// the live site loads the TAB 05 expression library too; test what visitors get
const exprPath = path.join(__dirname, '..', 'data', 'expressions.json');
const expr = fs.existsSync(exprPath) ? JSON.parse(fs.readFileSync(exprPath, 'utf8')) : null;
const eng = createEngine(data, expr);
const INPUTS = require('./test_inputs.json');
const rows = [];
for (const [cat, q, expect] of INPUTS) {
  const r = eng.recommend(q);
  const res = r.results.map(x => ({ id: x.song.id, title: x.song.title, formula: x.song.formula.name, why: x.song.why, score: +x.score.toFixed(2), concepts: x.detail.concepts }));
  let check = '';
  if (expect) {
    const ids = res.map(x => x.id);
    if (expect.startsWith('!')) check = ids.includes(expect.slice(1)) ? 'FAIL' : 'ok';
    else if (expect === 'F06') check = ids.length && ids.every(i => i.startsWith('SR-F06')) ? 'ok(all F06)' : ids[0] && ids[0].startsWith('SR-F06') ? 'ok(1st F06)' : 'MISS';
    else if (expect === 'NONE') check = r.status === 'empty' && !ids.length ? 'ok(prompt)' : 'FAIL';
    else if (expect === 'FALLBACK') check = r.status === 'fallback' && ids.length === 3 ? 'ok(fallback 3)' : 'FAIL';
    else if (expect === 'THREE') check = ids.length === 3 ? 'ok(3 results)' : 'FAIL';
    else if (expect === 'SR-F07-T01' && r.sleepDefault) check = ids.join(',') === 'SR-F07-T01,SR-F07-T02,SR-F07-T03' ? 'ok(Ep1-3)' : 'MISS';
    else check = ids[0] === expect ? 'ok(1st)' : ids.includes(expect) ? 'ok(top3)' : 'MISS';
  }
  rows.push({ cat, q, status: r.status, sleepDefault: !!r.sleepDefault, res, expect, check, concepts: Object.keys(r.query.concepts), pref: r.query.pref });
}
if (process.argv[2] === '--json') fs.writeFileSync(process.argv[3], JSON.stringify(rows, null, 1));
for (const r of rows) {
  console.log(`[${r.cat}] "${r.q}" -> ${r.status} ${r.check ? '{' + r.expect + ' ' + r.check + '}' : ''}  concepts=${r.concepts.join(',')} pref=${JSON.stringify(r.pref)}`);
  r.res.forEach((x, i) => console.log(`   ${i + 1}. ${x.id} ${x.title} (${x.formula}) ${x.score} [${x.concepts.join(',')}]`));
}
const checked = rows.filter(r => r.expect);
console.log(`\n${checked.filter(r => r.check.startsWith('ok')).length}/${checked.length} expectation checks pass; ${rows.length} inputs`);
process.exitCode = checked.every(r => r.check.startsWith('ok')) ? 0 : 1;
