// Semantic stage checks (TAB 06 meaning & connection rules). Run: node scripts/tests/semantic_meaning.test.js
// No language model is involved; the engine is deterministic rules over the TAB 01/02/05/06 data build.
const path = require('path'), fs = require('fs'), os = require('os'), cp = require('child_process');
const ROOT = path.join(__dirname, '..', '..');
const { eng } = require(path.join(ROOT, 'scripts', 'load_engine.js'))(ROOT);
let pass = 0, fail = 0;
function ok(cond, label) { if (cond) pass++; else { fail++; console.log('FAIL', label); } }
const ids = r => r.results.map(x => x.song.id);
const real = r => r.results.filter(x => !x.fill).map(x => x.song.id);
const rec = t => eng.recommend(t);

// ---- TAB 06 tests T01–T20 (guardrail-level expectations; T11 as corrected in the Sheet)
let r = rec("Injustice in the world; I'd like to feel less congested.");
ok(!ids(r).includes('SR-F01-T09'), 'T01 no Pick Your Battles for injustice concern without wish to disengage');
r = rec("My chest feels tight. I'm cautious about why.");
ok(!ids(r).includes('SR-F08-T03') || /tight|chest/i.test(r.results[0].explanation) === false, 'T02 no diagnosis claim');
ok(r.results.every(x => !/anxiety|panic|diagnos/i.test(x.explanation)), 'T02 explanation never names a condition');
r = rec("I'm grieving someone I love.");
ok(!real(r).some(id => /^SR-F03-T0[1458]$/.test(id) || id === 'SR-F03-T10'), 'T03 grief does not imply regret');
ok(!ids(r).includes('SR-F03-T07'), 'T03 Be the Light needs a supporting role');
r = rec("I'm proud of myself today.");
ok(r.status !== 'ok' || r.results[0].cls <= 2, 'T04 proud is not read as needing progress');
ok(r.results.every(x => !/progress|improv/i.test(x.explanation)), 'T04 no progress claim');
r = rec('Everyone has advice. Is my choice even mine?');
ok(real(r).includes('SR-F02-T01') || real(r).includes('SR-F07-T15'), 'T05 outside voices / own choice');
r = rec('I never feel I belong.');
ok(r.results.some(x => x.song.formula.number === 6), 'T06 F06 (artist-confirmed affinity) is considered for not belonging');
ok(r.results[0].song.formula.number === 6 || r.results[0].cls === 1, 'T06 another song leads only with a stronger (class-1) individual connection');
r = rec("I don't want to be angry anymore.");
ok(ids(r)[0] === 'SR-F07-T06', 'T07 Anger Free Living leads');
r = rec("I'm not angry. I need to make a decision.");
ok(!ids(r).includes('SR-F07-T06'), 'T08 negated anger excluded');
r = rec('Someone betrayed my trust.');
ok(!ids(r).includes('SR-F07-T07'), 'T09 betrayed visitor never gets Rebuild Trust');
r = rec('I hurt someone and need to earn back trust.');
ok(ids(r)[0] === 'SR-F07-T07', 'T10 caused hurt + repair -> Rebuild Trust');
r = rec("I want to play without proving it's productive.");
ok(ids(r)[0] === 'SR-F02-T05', 'T11 Find a Way to Play (F02) leads');
r = rec("I'm exhausted carrying everyone else's problems.");
ok(real(r).includes('SR-F01-T05') || real(r).includes('SR-F01-T02'), 'T12 carrying others');
r = rec("I'm happy, just curious about alien sounds.");
ok(ids(r).includes('SR-F05-T05') && !ids(r).includes('SR-F05-T04'), 'T13 alien version preferred, pair not doubled');
ok(r.results.every(x => !/isolat|alone|lonel/i.test(x.explanation)), 'T13 no invented isolation');
r = rec('I want quiet before bed, no spoken words.');
ok(r.results.every(x => x.song.type !== 'spoken-sleep'), 'T14 no spoken tracks');
r = rec('Calm feels strange now life is going well.');
ok(ids(r)[0] === 'SR-F02-T10', 'T15 Let It Be Okay leads');
r = rec('I feel like a radio between stations.');
ok(r.status !== 'ok', 'T16 metaphor alone is not a confident match');
r = rec("I'm ready for something new.");
ok(ids(r)[0] === 'SR-F08-T04', 'T17 I Am Ready leads');
r = rec('My family says love means I owe them forever.');
ok(ids(r)[0] === 'SR-F04-T01', 'T18 Born Without Expectations leads');
r = rec("I'm homesick and far from where I belong.");
ok(ids(r)[0] === 'SR-F06-T02', 'T19 Miss Home leads');
r = rec("I don't know what I need.");
ok(r.status !== 'ok', 'T20 uncertainty is not a confident match');

// ---- agency / role distinctions
ok(!ids(rec('My business partner lied to me and took everything.')).includes('SR-F07-T07'), 'betrayed (lied to me) never Rebuild Trust');
ok(ids(rec("I broke my partner's trust.")).includes('SR-F07-T07'), 'having broken trust -> Rebuild Trust');
ok(!ids(rec('I keep blaming everyone for my problems.')).includes('SR-F01-T05'), 'engaging in blame: no Their Mess Not Yours');
ok(ids(rec('Everyone blames me for the divorce.')).includes('SR-F01-T05'), 'being blamed: Their Mess Not Yours');
r = rec('My dad passed away.');
ok(!real(r).some(id => /^SR-F03/.test(id)), 'grief without regret: no No Regret tracks');
r = rec('I regret quitting uni and it eats at me.');
ok(r.results[0].song.formula.number === 3, 'regret -> No Regret');
ok(!ids(rec('I care about the refugees but I need to step back.')).includes('SR-F07-T06'), 'disengage want is not anger');
// ---- listening constraints
for (const t of ['Music with no words to help me study.', "I want to fall asleep but I don't want anyone talking to me.", 'Something to sleep to, no spoken words.'])
  ok(rec(t).results.every(x => x.song.type !== 'spoken-sleep'), 'no spoken: ' + t);
ok(rec('I want something meditative but not sleepy.').results.every(x => x.song.type !== 'spoken-sleep'), 'not sleepy: no F07');
r = rec('I want to sleep');
ok(r.sleepDefault && ids(r).join() === 'SR-F07-T01,SR-F07-T02,SR-F07-T03', 'generic sleep default F07 Ep 1-3');
r = rec('Something to drift off to, wordless please.');
ok(r.results.every(x => /^instrumental/.test(x.song.type)), 'wordless sleep -> F08');
// ---- version pairs never doubled; same-formula triples need a reason
const PAIRS = [['SR-F05-T02', 'SR-F05-T03'], ['SR-F05-T04', 'SR-F05-T05']];
for (const t of ['I want to celebrate tonight', 'Shay', 'city of gold', 'something glittering to dance to', 'I feel joyful'])
  ok(!PAIRS.some(([a, b]) => ids(rec(t)).includes(a) && ids(rec(t)).includes(b)), 'no version pair doubled: ' + t);
// ---- explanations: no treatment / outcome claims (the visitor's own quoted words are excluded from the check)
const INPUTS = JSON.parse(fs.readFileSync(path.join(__dirname, 'corpus', 'phase2_corpus.json'), 'utf8')).items.map(i => i.text);
const CLAIM = /\b(heal\w*|treat\w*|cure\w*|therap\w*|fix\w*|recover\w*|help you|will make you|guarantee\w*|medical|medicine|diagnos\w*|symptom\w*)\b/i;
let bad = [];
for (const t of INPUTS) for (const x of rec(t).results) if (CLAIM.test(x.explanation.replace(/"[^"]*"/g, ''))) bad.push(t + ' -> ' + x.explanation);
ok(bad.length === 0, 'no treatment/outcome wording in explanations (' + bad.slice(0, 3).join(' | ') + ')');
// ---- music matching only: no wellbeing labels or flags in any result object
const BANNED_KEYS = /^(risk|danger|crisis|safety|emergency|distress|care|helpline|alert|flag|severity|urgent)/i;
function scanKeys(o, p) { if (!o || typeof o !== 'object') return []; return Object.keys(o).flatMap(k => (BANNED_KEYS.test(k) ? [p + k] : []).concat(scanKeys(o[k], p + k + '.'))); }
let keys = [];
for (const t of ["I can't breathe", 'so done with everything', "I have a crushing pain in my chest and I'm struggling to breathe.", 'Sometimes I think everyone would be better off without me.'].concat(INPUTS.slice(0, 120))) {
  const res = rec(t); keys = keys.concat(scanKeys({ status: res.status, frame: res.frame, results: res.results.map(x => ({ cls: x.cls, basis: x.basis, detail: x.detail })) }, ''));
  ok(['ok', 'weak', 'fallback'].includes(res.status), 'only music-matching statuses: ' + t);
}
ok(keys.length === 0, 'no wellbeing/risk keys in results (' + keys.slice(0, 5).join(',') + ')');
// ---- unwired re-rank hook: absent by default, honoured only when explicitly passed
r = rec('I feel trapped');
const r2 = eng.recommend('I feel trapped', { rerank: list => list.slice().reverse() });
ok(Array.isArray(r2.results) && r2.results.length === 3, 're-rank hook is optional and callable');
// ---- data build fails on a corrupted export (negative validation)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'srbuild-'));
const src = process.env.SR_MASTER_XLSX;
// ---- refinement 2 (2026-10-18): general scope / construction / quoting rules ----
const C = t => rec(t).query.concepts;
r = rec('Today I finally finished the marathon I trained a year for.');
ok(!ids(r).includes('SR-F01-T09'), 'R2 marathon achievement is not "pick your battles"');
ok(r.results.every(x => !/progress|struggl/i.test(x.explanation)), 'R2 achievement: no need for progress attributed');
ok(!C('Nobody in my class talks like me or likes what I like.').approval, 'R2 verb "likes" is not approval');
ok(!!C('Nobody in my class talks like me or likes what I like.').different, 'R2 comparison construction reads as difference');
ok(rec('Nobody in my class talks like me or likes what I like.').results.some(x => x.song.formula.number === 6), 'R2 F06 considered for difference construction');
ok(!C('I feel like a balloon someone let go of.').lettingGo, 'R2 event inside a simile vehicle is not the visitor letting go');
ok(!C('I lifted the heavy boxes at work.').burden, 'R2 literal physical weight in a task frame is not burden');
r = rec("I'm homesick and far from where I belong.");
ok(r.results.every(x => x.explanation === x.song.description), 'R2 description is the song\'s own (no quote of the visitor)');
ok(!C('The whole world looks washed out lately.').connection, 'R2 "the whole X" is a quantity modifier, not wholeness');
r = rec('Lately it feels like my candle is burning at both ends.');
ok(!!C('Lately it feels like my candle is burning at both ends.').depleted && r.results.every(x => x.cls >= 2) && r.status !== 'ok', 'R2 figurative schema is tentative (never class 1, not ok status)');
r = rec('I moved to a new country last year and even though it\'s great here I still feel like I don\'t belong.');
ok(r.results.some(x => x.song.formula.number === 6), 'R2 F06 considered for not belonging after a move');
ok(r.results.every(x => !/"/.test(x.explanation)), 'R2 descriptions contain no quotation');
r = rec('It keeps me up that people with power get away with hurting others.');
ok(r.results.every(x => !/^Your words connect with this record/.test(x.explanation) && x.cls !== 5), 'R2 no unexplainable class-2 match');

if (src && fs.existsSync(src)) {
  const bad = path.join(tmp, 'bad.xlsx');
  cp.execFileSync('python3', ['-c', `
import openpyxl,sys
wb=openpyxl.load_workbook(sys.argv[1]); ws=[w for w in wb.worksheets if w.title.startswith('TAB 01')][0]
for row in ws.iter_rows():
    for c in row:
        if isinstance(c.value,str) and c.value.startswith('https://') and 'sonicremedy' not in c.value.lower(): c.value=c.value+'-broken'; raise SystemExit(wb.save(sys.argv[2]))
`, src, bad]);
  let failed = false;
  try { cp.execFileSync('python3', [path.join(ROOT, 'scripts', 'build_data.py'), bad, path.join(tmp, 'out')], { stdio: 'pipe' }); } catch (e) { failed = true; }
  ok(failed && !fs.existsSync(path.join(tmp, 'out', 'songs.json')), 'build_data aborts on a corrupted URL and writes nothing');
} else console.log('(skipped negative build test: set SR_MASTER_XLSX to a Sheet export)');
console.log(`${pass}/${pass + fail} semantic checks pass`);
process.exit(fail ? 1 : 0);
