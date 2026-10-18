#!/usr/bin/env node
// Permanent regression tests from real visitors whose authentic sentences were once turned away
// with "Say a little more". Run on every change:  node scripts/tests/real_user_regressions.test.js
// Principle: a visitor never has to rewrite, simplify or dilute what they wrote for the engine.
const fs = require('fs');
const path = require('path');
const { createEngine } = require('../../discovery.js');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../../data/songs.json'), 'utf8'));
// the live site loads the TAB 05 expression library too; test what visitors get
const exprPath = path.join(__dirname, '../../data/expressions.json');
const expr = fs.existsSync(exprPath) ? JSON.parse(fs.readFileSync(exprPath, 'utf8')) : null;
const eng = createEngine(data, expr);

const REAL = [
  // 2026-10-18, visitor B (iOS): no results, repeated presses did nothing, extending it still failed
  "I've been thinking about the injustice in the world in general. I'd like to feel less congested.",
  // 2026-10-18, second real report
  "My chest feels tight. I'm cautious to why I feel that way."
];
const MEANINGFUL = ['I feel congested.', 'tired', 'sad', 'help', 'pizza', "what's the weather", 'je suis triste', '我很累'];
const MEANINGLESS = ['', '   ', ';;; !!', 'asdf ;;;', 'qwerty kkkk', '....'];
// Why-lines must never diagnose or refer to health (a tight chest is not read as a condition).
const HEALTH = /\b(chest|heart ?rate|anxiety|anxious|panic|depress\w*|disorder|symptom\w*|diagnos\w*|doctor|medic\w*|health|therap\w*|condition|illness|heal(s|ing)? you|cure\w*|treat(ment)?)\b/i;

let fail = 0;
function check(label, ok, info) { console.log((ok ? 'PASS ' : 'FAIL ') + label + (info ? '  ' + info : '')); if (!ok) fail++; }

REAL.forEach(function (s) {
  [s, s.replace(/'/g, '\u2019')].forEach(function (t) {
    const r = eng.recommend(t);
    const ids = r.results.map(function (x) { return x.song.id; });
    check('real-user accepted, 3 results: ' + JSON.stringify(t), r.status !== 'empty' && ids.length === 3 && new Set(ids).size === 3, r.status + ' ' + ids.join(','));
    check('  why-lines free of health/diagnosis', r.results.every(function (x) { return !HEALTH.test(x.song.why); }));
    // extending the text must also always work
    const r2 = eng.recommend(t + ' I do not really know how to explain it.');
    check('  extended text still accepted', r2.status !== 'empty' && r2.results.length >= 1, r2.status);
  });
});
MEANINGFUL.forEach(function (t) {
  const r = eng.recommend(t);
  check('meaningful accepted: ' + JSON.stringify(t), r.status !== 'empty' && r.results.length >= 1, r.status + ' ' + r.results.length);
});
MEANINGLESS.forEach(function (t) {
  const r = eng.recommend(t);
  check('meaningless gets the prompt: ' + JSON.stringify(t), r.status === 'empty' && r.results.length === 0, r.status);
});
data.songs.forEach(function (s) { if (HEALTH.test(s.why)) check('why-line health-free: ' + s.id, false, s.why); });
console.log(fail ? fail + ' FAILED' : 'all real-user regression checks pass');
process.exit(fail ? 1 : 0);
