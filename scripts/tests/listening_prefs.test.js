#!/usr/bin/env node
// Listening-preference constraints applied per track from the verified vocal profile (2026-10-18).
// Run: node scripts/tests/listening_prefs.test.js
const path = require('path'), fs = require('fs');
const ROOT = path.join(__dirname, '..', '..');
const { eng } = require(path.join(ROOT, 'scripts', 'load_engine.js'))(ROOT);
const songs = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'songs.json'))).songs;
const meaning = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'meaning.json')));
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'manifest.json')));
let pass = 0, fail = 0;
function ok(c, label, extra) { if (c) pass++; else { fail++; console.log('FAIL', label, extra === undefined ? '' : JSON.stringify(extra)); } }
const rec = t => eng.recommend(t);
const shown = r => r.results.map(x => x.song);
const flags = s => s.vocal_flags;
const prefs = r => Object.keys(r.frame.prefs).filter(k => r.frame.prefs[k]);
const VALUES = ['spoken_narration', 'sung_lyrics', 'wordless_vocals', 'instrumental', 'unverified'];

// data: every track has a value and a source
ok(songs.length === 70, '70 tracks');
ok(songs.every(s => VALUES.includes(s.vocal_profile) && s.vocal_flags.every(f => VALUES.includes(f)) && s.vocal_source), 'every track has a vocal profile + source');
ok(songs.filter(s => s.formula.number === 7).every(s => s.vocal_profile === 'spoken_narration'), 'F07 spoken narration');
ok(songs.filter(s => s.formula.number === 6).every(s => s.vocal_profile === 'sung_lyrics'), 'F06 sung lyrics (verified)');
ok(songs.find(s => s.id === 'SR-F08-T06').vocal_profile === 'wordless_vocals', 'I Am Hope wordless vocals');
ok(['SR-F05-T02', 'SR-F05-T03'].every(id => JSON.stringify(songs.find(s => s.id === id).vocal_flags) === '["sung_lyrics","wordless_vocals"]'), 'Shay / Shay Darkened mixed flags');
ok(manifest.vocalProfiles && manifest.vocalProfiles.counts && Object.values(manifest.vocalProfiles.counts).reduce((a, b) => a + b, 0) === 70, 'manifest vocal counts sum to 70');
// near-duplicates: progress pair removed, others kept
ok(!meaning.pairs.progress && meaning.pairs.shay && meaning.pairs['city-of-gold'] && meaning.pairs.bet, 'pairs: shay, city-of-gold, bet kept; progress removed');
ok(songs.filter(s => ['SR-F07-T12', 'SR-F07-T13'].includes(s.id)).every(s => !s.group), 'Spot The Changes / Keep Progressing not grouped');
ok(manifest.notNearDuplicates && manifest.notNearDuplicates.progress && /similar themes/.test(manifest.notNearDuplicates.progress.reason), 'manifest documents why progress is not a pair');

// 1. no spoken narration: spoken excluded, sung allowed, unverified excluded
const NO_SPOKEN = ['no talking please', 'something with no spoken narration', 'no voice-over please', "I don't want anyone talking", 'nothing spoken tonight'];
for (const t of NO_SPOKEN) {
  const r = rec(t);
  ok(prefs(r).includes('noSpoken') && !prefs(r).includes('noLyrics') && !prefs(r).includes('noVocals'), 'noSpoken only: ' + t, prefs(r));
  ok(shown(r).every(s => !flags(s).includes('spoken_narration') && !flags(s).includes('unverified')), 'no spoken / unverified shown: ' + t, shown(r).map(s => s.title));
}
let r = rec('no voice-over, I feel different from everyone');
ok(shown(r).some(s => s.formula.number === 6), 'F06 sung tracks eligible under no-narration', shown(r).map(s => s.title));
r = rec('I want to sleep, no talking');
ok(shown(r).every(s => s.type !== 'spoken-sleep'), 'sleep + no talking: no spoken episodes');

// 2. no lyrics / words: sung + spoken + unverified excluded; wordless + instrumental allowed
const NO_WORDS = ['something without words', 'no lyrics please', 'nothing with words, I need to focus', 'no words please', 'wordless music for reading'];
for (const t of NO_WORDS) {
  const r = rec(t);
  ok(prefs(r).includes('noLyrics') && !prefs(r).includes('noVocals'), 'noLyrics (not instrumental-only): ' + t, prefs(r));
  ok(shown(r).every(s => s.vocal_flags.every(f => f === 'instrumental' || f === 'wordless_vocals')), 'only instrumental / wordless shown: ' + t, shown(r).map(s => s.title));
}
r = rec('no words please, something hopeful');
ok(shown(r).some(s => s.id === 'SR-F08-T06'), 'I Am Hope (wordless vocals) eligible under no-words', shown(r).map(s => s.title));

// 3. instrumental only: only purely instrumental
const INSTR = ['instrumental only', 'just music, no vocals', 'purely instrumental please', 'something without words please, just instrumental', 'without a voice please'];
for (const t of INSTR) {
  const r = rec(t);
  ok(prefs(r).includes('noVocals'), 'noVocals: ' + t, prefs(r));
  ok(shown(r).every(s => JSON.stringify(s.vocal_flags) === '["instrumental"]'), 'only purely instrumental shown: ' + t, shown(r).map(s => s.title));
}
r = rec('instrumental only, something hopeful');
ok(!shown(r).some(s => s.id === 'SR-F08-T06'), 'I Am Hope excluded under instrumental-only');

// negations and non-requests
r = rec("I don't mind lyrics, something upbeat");
ok(!prefs(r).includes('noLyrics') && !prefs(r).includes('noVocals'), "I don't mind lyrics: no constraint", prefs(r));
ok(shown(r).some(s => flags(s).includes('sung_lyrics') || flags(s).includes('unverified')), "I don't mind lyrics: songs with words allowed", shown(r).map(s => s.title));
r = rec("no talking but I don't mind singing");
ok(prefs(r).includes('noSpoken') && !prefs(r).includes('noLyrics') && !prefs(r).includes('noVocals'), "no talking but don't mind singing", prefs(r));
r = rec("lyrics are fine, I just don't want anyone talking");
ok(prefs(r).includes('noSpoken') && !prefs(r).includes('noLyrics'), 'lyrics fine + no talking', prefs(r));
r = rec("vocals are fine, it doesn't have to be instrumental");
ok(!prefs(r).includes('noVocals'), 'vocals are fine / need not be instrumental', prefs(r));
r = rec("I don't mind the narration");
ok(!prefs(r).includes('noSpoken'), "I don't mind the narration", prefs(r));
r = rec('I have no words for how sad I am');
ok(!prefs(r).includes('noLyrics'), '"I have no words" is not a listening request', prefs(r));
r = rec('something with lyrics I can sing along to');
ok(shown(r).every(s => flags(s).includes('sung_lyrics') || (flags(s).includes('unverified') && s.lyrics_verified)), 'sing-along: tracks with lyrics only');
r = rec('I want to sleep');
ok(r.results.some(x => x.song.type === 'spoken-sleep'), 'unconstrained sleep request still gets the Sleep Sequence');

console.log(`${pass}/${pass + fail} listening-preference checks pass`);
process.exit(fail ? 1 : 0);
