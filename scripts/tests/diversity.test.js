#!/usr/bin/env node
// Diversity rules (2026-10-25): when the words give no song-level evidence the engine must not return one fixed
// trio, exploratory places come from different formulas, recently shown songs give way to equal alternatives, and
// none of this may trade away relevance. Run:  node scripts/tests/diversity.test.js
const { eng } = require('../load_engine.js')();

let fail = 0;
function check(label, ok, info) { console.log((ok ? 'PASS ' : 'FAIL ') + label + (info ? '  ' + info : '')); if (!ok) fail++; }
const ids = (r) => r.results.map((x) => x.song.id);
const fnum = (x) => x.song.formula.number;

// 1. no fixed fallback trio: unrelated inputs must not all get the same songs in the same order
const VAGUE = ['pizza', "what's the weather", 'hello there', 'I went to the shops today', 'my cat is asleep on the couch',
  'it is raining again', 'Tuesday', 'I like blue', 'nothing much', 'just browsing', 'I had toast for breakfast', 'the bus was late'];
const runs = VAGUE.map((t) => eng.recommend(t));
const leads = new Set(runs.map((r) => ids(r)[0]));
const trios = new Set(runs.map((r) => ids(r).join(',')));
check('vague inputs do not share one fixed trio', trios.size === VAGUE.length, trios.size + ' distinct of ' + VAGUE.length);
check('vague inputs spread their first listen', leads.size >= 6, leads.size + ' distinct leads');
const counts = {}; runs.forEach((r) => ids(r).forEach((id) => { counts[id] = (counts[id] || 0) + 1; }));
const maxShare = Math.max.apply(null, Object.values(counts));
check('no song appears in more than half of the vague sets', maxShare <= VAGUE.length / 2, 'max ' + maxShare);

// 2. one formula per exploratory place, and exploratory places are labelled as such (class 4, never "direct")
runs.forEach((r, i) => {
  const fill = r.results.filter((x) => x.fill === 'start');
  const fs = new Set(fill.map(fnum));
  check('exploratory places use distinct formulas: "' + VAGUE[i] + '"', fs.size === fill.length && fill.every((x) => x.cls === 4));
});

// 3. determinism: same text, no history -> same result
VAGUE.concat(["I've been thinking about the injustice in the world in general. I'd like to feel less congested."]).forEach((t) => {
  check('deterministic: "' + t.slice(0, 40) + '"', ids(eng.recommend(t)).join() === ids(eng.recommend(t)).join());
});

// 4. recency: songs just shown give way when an equal alternative exists, and never displace stronger evidence
let avoided = 0, tried = 0;
VAGUE.forEach((t, i) => {
  const prev = ids(runs[(i + 1) % runs.length]);
  const r = eng.recommend(t, { recent: prev });
  tried++; if (!ids(r).some((id) => prev.indexOf(id) >= 0)) avoided++;
});
check('recent songs avoided in exploratory sets', avoided === tried, avoided + '/' + tried);
const strong = 'I regret what I said to her';
const base = eng.recommend(strong);
const withHist = eng.recommend(strong, { recent: ids(base) });
check('history never replaces a direct first listen', base.results[0].cls !== 1 || withHist.results[0].song.id === base.results[0].song.id,
  base.results[0].song.title + ' -> ' + withHist.results[0].song.title);
check('history never lowers the class of the first listen', withHist.results[0].cls === base.results[0].cls);

// 5. words shared with a title are not evidence
const titleOnly = ['City of Gold', 'Skies', 'Fools Gold', 'Eagle', 'Inchino'];
titleOnly.forEach((t) => {
  const r = eng.recommend('the ' + t.toLowerCase());
  const same = r.results.find((x) => x.song.title === t);
  check('title words alone do not make a match: "' + t + '"', !same || same.cls >= 3, same ? 'class ' + same.cls : 'not shown');
});

// 6. formula affinity alone supports one track of a formula while other supported songs remain
const aff = ['I feel different from everyone.', 'I feel like I\'m from another planet.', 'I never feel I belong.'];
aff.forEach((t) => {
  const r = eng.recommend(t);
  const byF = {}; r.results.filter((x) => x.cls === 3).forEach((x) => { byF[fnum(x)] = (byF[fnum(x)] || 0) + 1; });
  const others = r.results.filter((x) => x.cls <= 2).length;
  check('affinity-only tracks capped per formula: "' + t + '"', Object.values(byF).every((n) => n <= 1) || others === 0,
    r.results.map((x) => x.song.title + '(' + x.cls + ')').join(' / '));
});

// 7. exposure balance (eagle-balance 2026-10-25): for low moments without song-level evidence the starting places must
// spread across the open songs; the one calm song of a formula (Eagle, Let It Be Okay, I Am My Own Energy Source)
// and the only open song of a small formula (Be Ready For It All) must not take most of them.
{
  const A = ['rubbish', 'awful', 'grey', 'heavy', 'pointless', 'miserable'];
  const B = ['the weather', 'my commute', 'the news', 'the bins', 'my phone', 'the neighbours', 'the queue', 'the traffic', 'the noise', 'the paperwork'];
  const c = {}; let n = 0;
  A.forEach((a) => B.forEach((b) => eng.recommend('everything feels ' + a + ' today because of ' + b).results
    .filter((x) => x.fill === 'start').forEach((x) => { n++; c[x.song.title] = (c[x.song.title] || 0) + 1; })));
  const v = Object.values(c).sort((x, y) => x - y), med = v[v.length >> 1], max = v[v.length - 1];
  check('low-moment starting places spread across songs', max <= 3 * med, 'max ' + max + ', median ' + med + ', ' + v.length + ' songs');
  const single = ['Eagle', 'Let It Be Okay', 'I Am My Own Energy Source', 'Be Ready For It All'].reduce((t, k) => t + (c[k] || 0), 0);
  check('single open or calm songs of a formula do not dominate', single <= 0.3 * n, single + ' of ' + n);
}

console.log(fail ? fail + ' diversity check(s) failed' : 'all diversity checks pass');
process.exit(fail ? 1 : 0);
