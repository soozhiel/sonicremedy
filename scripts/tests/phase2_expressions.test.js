// Phase 2: TAB 05 — HUMAN EXPRESSION LIBRARY wired into discovery.js.
// Run: node scripts/tests/phase2_expressions.test.js   (exit code 1 on any failure)
'use strict';
const fs = require('fs');
const path = require('path');
const { createEngine } = require('../../discovery.js');
const root = path.join(__dirname, '..', '..');
const data = JSON.parse(fs.readFileSync(path.join(root, 'data', 'songs.json'), 'utf8'));
const expr = JSON.parse(fs.readFileSync(path.join(root, 'data', 'expressions.json'), 'utf8'));
// same engine as the site: songs + TAB 05 + TAB 06 affinities/pairs + meaning layer
const eng = require('../load_engine.js')().eng;
const byId = {}; data.songs.forEach(function (s) { byId[s.id] = s; });

let pass = 0, fail = 0;
function check(name, ok, info) {
  if (ok) pass++; else fail++;
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || info === undefined ? '' : '  -> ' + JSON.stringify(info)));
}
const ids = function (r) { return r.results.map(function (x) { return x.song.id; }); };
const curly = function (t) { return t.replace(/'/g, '\u2019'); };
const HEALTH = /\b(chest|heart ?rate|anxiety|anxious|panic|depress\w*|disorder|symptom\w*|diagnos\w*|doctor|medic\w*|health|therap\w*|condition|illness|cure\w*|treat(ment)?)\b/i;

// --- library integrity
check('expressions.json generated from TAB 05', /TAB 05/.test(expr.source) && expr.expressions.length === expr.count, expr.source);
expr.expressions.forEach(function (x) {
  x.songs.forEach(function (id) { if (!byId[id]) check(x.id + ' links a real song', false, id); });
});
check('every linked song exists in songs.json', expr.expressions.every(function (x) { return x.songs.every(function (id) { return byId[id]; }); }));
check('no TAB 05 row links Rebuild Trust to betrayal wording',
  expr.expressions.every(function (x) { return !(x.songs.indexOf('SR-F07-T07') >= 0 && /betray|cheat|lied|behind my back/.test(x.phrases.join(' '))); }));

// --- the brief's phrases: three songs, at least one real match, never the three fixed songs alone
const CASES = [
  ['I feel congested.', ['SR-F01-T01']],
  ["The world is unfair and I'm tired of thinking about it.", ['SR-F01-T09', 'SR-F07-T02']],
  ["I don't want to be angry anymore.", ['SR-F07-T06'], 'SR-F07-T06'],
  ['Everything is happening at once.', ['SR-F07-T09']],
  ['I want some breathing room.', ['SR-F08-T01']],
  ["I'm doing well but want to feel more inspired.", ['SR-F05-T06']],
  ["I don't know what I need.", ['SR-F05-T01', 'SR-F08-T03']],
  ["My chest feels tight. I'm cautious to why I feel that way.", ['SR-F08-T03']],
  // Expectation changed 2026-10-18 (semantic stage, TAB 06): SR-F01-T09 Pick Your Battles is no longer expected here.
  // TAB 06 guardrail for F01-T09: "Do not assume concern about injustice means visitor wants to disengage or pick battles";
  // this visitor states an injustice concern and a wish to feel less congested, not a wish to step back.
  ["I've been thinking about the injustice in the world in general. I'd like to feel less congested.", ['SR-F01-T01'], null, ['SR-F01-T09']],
];
const record = [];
CASES.forEach(function (c) {
  [c[0], curly(c[0])].forEach(function (t, k) {
    const r = eng.recommend(t);
    const got = ids(r);
    const label = (k ? '[curly] ' : '[straight] ') + JSON.stringify(t);
    check(label + ' -> 3 songs', r.results.length === 3, got);
    check(label + ' -> real match (not fallback)', r.status !== 'fallback' && r.status !== 'empty', r.status);
    check(label + ' -> includes ' + c[1].join(', '), c[1].every(function (id) { return got.indexOf(id) >= 0; }), got);
    if (c[2]) check(label + ' -> leads with ' + c[2], got[0] === c[2], got);
    if (c[3]) check(label + ' -> excludes ' + c[3].join(', '), c[3].every(function (id) { return got.indexOf(id) < 0; }), got);
    check(label + ' -> no Rebuild Trust', got.indexOf('SR-F07-T07') < 0, got);
    if (!k) record.push({ input: t, status: r.status, songs: r.results.map(function (x) { return { id: x.song.id, title: x.song.title, fill: x.fill || null, why: x.song.why }; }) });
  });
  check('straight == curly apostrophes: ' + JSON.stringify(c[0]), ids(eng.recommend(c[0])).join() === ids(eng.recommend(curly(c[0]))).join());
});

// --- physical sensation: framed by the visitor's words, no reading into it
const chest = eng.recommend("My chest feels tight. I'm cautious to why I feel that way.");
check('chest: all three are real matches (no padding)', chest.results.every(function (x) { return !x.fill; }), chest.results.map(function (x) { return x.fill; }));
check('chest: why-lines free of health/diagnosis wording', chest.results.every(function (x) { return !HEALTH.test(x.song.why); }));
const chestOnly = eng.recommend('My chest feels tight.');
check('chest alone: low-confidence link is framed "A place to start" (weak), still 3 songs', chestOnly.status === 'weak' && chestOnly.results.length === 3, chestOnly.status);
const heart = eng.recommend('My heart is racing.');
check('heart racing (deliberately unlinked): fixed starting points only, labelled', heart.status === 'fallback' && heart.results.every(function (x) { return x.fill === 'start'; }), heart.status);

// --- edit-and-resubmit on the same engine: each submission stands alone
const a1 = ids(eng.recommend('I feel congested.'));
const a2 = ids(eng.recommend("I don't want to be angry anymore."));
const a3 = ids(eng.recommend('I feel congested.'));
check('edit and resubmit: new text gives new songs', a1.join() !== a2.join(), [a1, a2]);
check('edit and resubmit: same text gives the same songs again', a1.join() === a3.join(), [a1, a3]);
const b1 = ids(eng.recommend('I feel congested.'));
const b2 = ids(eng.recommend('I feel congested. I want some breathing room.'));
check('edit by adding words: result updates and still 3', b2.length === 3 && b2.indexOf('SR-F08-T01') >= 0, [b1, b2]);

// --- negation, slang, typos, metaphors
check('negation: "I\'m not tired" does not match the "tired" row', (eng.recommend("I'm not tired").expressions || []).indexOf('EXP-039') < 0);
check('negation: "I\'m not angry, just really tired of being the strong one" avoids Anger Free Living',
  ids(eng.recommend("I'm not angry, just really tired of being the strong one")).indexOf('SR-F07-T06') < 0);
check('slang: "idk what i need" == "I don\'t know what I need"', ids(eng.recommend('idk what i need')).join() === ids(eng.recommend("I don't know what I need.")).join());
check('typo: "the wolrd is unfair" == "the world is unfair"', ids(eng.recommend('the wolrd is unfair')).join() === ids(eng.recommend('the world is unfair')).join());
check('typo: "i want some breathing rooom" == "I want some breathing room"', ids(eng.recommend('i want some breathing rooom')).join() === ids(eng.recommend('I want some breathing room')).join());
check('metaphor: "I feel like I\'m drowning" gets 3 real songs', (function () { const r = eng.recommend("I feel like I'm drowning"); return r.results.length === 3 && r.status !== 'fallback'; })());

// --- Phase 1 behaviour kept
const sl = eng.recommend('help me sleep');
check('sleep default: Episodes 1, 2, 3', ids(sl).join() === 'SR-F07-T01,SR-F07-T02,SR-F07-T03', ids(sl));
check('feeling different: Alien Frequencies (F06) lead', ids(eng.recommend('I feel different from everyone'))[0].indexOf('SR-F06') === 0);
['my partner cheated on me', 'I was betrayed by my best friend', "I've been betrayed and can't trust anyone"].forEach(function (t) {
  check('betrayal never shows Rebuild Trust: ' + JSON.stringify(t), ids(eng.recommend(t)).indexOf('SR-F07-T07') < 0, ids(eng.recommend(t)));
});
['', '   ', 'asdf ;;;', ';;; !!'].forEach(function (t) { check('empty/gibberish still prompts: ' + JSON.stringify(t), eng.recommend(t).status === 'empty'); });
const longText = Array(60).fill('I feel congested and the world is unfair.').join(' ');
check('no length limit: very long text still answers with 3', eng.recommend(longText).results.length === 3);
const noLib = createEngine(data);
check('engine still works without expressions.json', noLib.recommend('I feel congested.').results.length === 3);
// near-duplicate suppression: never two of the same group when an alternative exists
['I feel congested.', "I'm doing well but want to feel more inspired.", 'I want to keep progressing'].forEach(function (t) {
  const g = eng.recommend(t).results.map(function (x) { return x.song.group; }).filter(Boolean);
  check('near-duplicates suppressed: ' + JSON.stringify(t), new Set(g).size === g.length, g);
});

if (process.argv.indexOf('--record') >= 0) fs.writeFileSync(process.argv[process.argv.indexOf('--record') + 1], JSON.stringify(record, null, 1));
console.log('\n' + pass + '/' + (pass + fail) + ' phase 2 checks pass');
if (fail) process.exit(1);
