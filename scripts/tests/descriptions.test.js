// Result descriptions (user decision 2026-10-18): each result shows the song's own one-sentence description
// (scripts/description_lines.json, built into songs.json from TAB 02). It is the same whatever the visitor
// typed: it never quotes or repeats the input, never explains the matching and never says what the visitor feels.
// Run: node scripts/tests/descriptions.test.js
const fs = require('fs');
const path = require('path');
const { eng, data } = require('../load_engine.js')();
const songs = data.songs || data;
const lines = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'description_lines.json'), 'utf8'));
let pass = 0, fail = 0;
function ok(c, name) { if (c) pass++; else { fail++; console.log('FAIL ' + name); } }
const BANNED = /\b(you said|you mentioned|you asked|you shared|you wrote|your words|your image|because you|you feel\w*|you're feeling|you are feeling|you seem|connects? (to|with)|connection (to|with)|possible connection|match\w*|close to a situation|nothing in the catalogue|related connection|another direction|open place to start)\b/i;
const QUOTE = /["\u201c\u201d\u2018\u2019]/;

// ---- data
ok(songs.length === 70, '70 songs');
ok(songs.every(s => typeof s.description === 'string' && s.description.length > 20), 'every song has a description');
ok(songs.every(s => s.description === lines[s.id]), 'songs.json descriptions equal description_lines.json');
ok(songs.every(s => !BANNED.test(s.description) && !QUOTE.test(s.description)), 'no banned phrase or quotation mark in any description');
ok(songs.every(s => s.description.split(/\s+/).length <= 25), 'every description 25 words or fewer');
ok(songs.every(s => /^[A-Z].*\.$/.test(s.description) && !/[.!?;]\s+\S/.test(s.description)), 'every description is one sentence');
ok(songs.filter(s => s.type === 'spoken-sleep').every(s => /^A spoken/.test(s.description)), 'F07 described as spoken');
ok(songs.filter(s => /^SR-F08-T0[1-5]$/.test(s.id)).every(s => /instrumental/.test(s.description) && !/\b(song|sung|lyric)/i.test(s.description)), 'F08 T01-T05 instrumental, no lyrics implied');
ok(/wordless/.test(lines['SR-F08-T06']) && !/\b(song|sung|lyric)/i.test(lines['SR-F08-T06']), 'I Am Hope: wordless vocals');
ok(songs.filter(s => s.id.startsWith('SR-F06-')).every(s => /^Sung in an invented language/.test(s.description)), 'F06 sung in an invented language');
ok(lines['SR-F02-T10'] === "A song about allowing calm to feel natural again, even when you've become accustomed to chaos and defence.", "user's wording: Let It Be Okay");
ok(lines['SR-F05-T06'] === 'Imagining peace and space for yourself, like an eagle soaring above the trees.', "user's wording: Eagle");
ok(lines['SR-F04-T06'] === 'The bliss of an unobligated day, with the freedom to simply feel yourself.', "user's wording: I Can Feel Me");

// ---- engine output
const ngrams = (t, n) => { const w = t.toLowerCase().replace(/[^a-z' ]+/g, ' ').split(/\s+/).filter(Boolean); const o = []; for (let i = 0; i + n <= w.length; i++) o.push(w.slice(i, i + n).join(' ')); return o; };
const LONG = "I have been holding everything together at work for months. My manager keeps adding projects and I say yes every time.\n\n" +
  "At home it is the same. Everyone expects me to sort things out, and I never get an evening to myself.\n\n" +
  "Tonight I just want to switch off, but my head keeps going over tomorrow's meeting.";
const INPUTS = ["Have a lot on my mind don't know how to relax", 'tired', 'Heartbroken.', LONG, "I can't sleep.", 'I feel congested.',
  'I hurt someone and need to earn back trust.', 'Instrumental only, I need to concentrate.'];
for (const t of INPUTS) {
  const r = eng.recommend(t);
  ok(r.results.length === 3, 'three results: ' + t.slice(0, 40));
  ok(r.results.every(x => x.explanation === x.song.description), 'shown text is the song description: ' + t.slice(0, 40));
  ok(r.results.every(x => !BANNED.test(x.explanation) && !QUOTE.test(x.explanation)), 'no banned phrase / quotes: ' + t.slice(0, 40));
  const grams = ngrams(t, 4);
  ok(r.results.every(x => !grams.some(g => x.explanation.toLowerCase().includes(g))), 'no four-word run of the input repeated: ' + t.slice(0, 40));
}
// an input sharing words with a description: the description stays exactly the song's own
const share = eng.recommend('I keep imagining peace and space for myself, somewhere above the trees.');
const base = Object.fromEntries(songs.map(s => [s.id, s.description]));
ok(share.results.every(x => x.explanation === base[x.song.id]), 'input sharing words with a description: text unchanged');
ok(share.results.every(x => !/I keep imagining|for myself/i.test(x.explanation)), 'input sharing words: visitor phrasing not echoed');
// same song, different inputs (few words vs paragraphs): identical text
const seen = {};
for (const t of INPUTS.concat(['relax', 'calm', LONG + '\n\nAlso I just want some calm.'])) for (const x of eng.recommend(t).results) (seen[x.song.id] = seen[x.song.id] || new Set()).add(x.explanation);
ok(Object.values(seen).every(s => s.size === 1), 'a song shows the same description whatever the input');
// the user's sentence
const u = eng.recommend("Have a lot on my mind don't know how to relax");
ok(u.results.every(x => !/relax|lot on my mind/i.test(x.explanation)), "user's sentence: none of its words echoed");
// whole corpus
const corpus = JSON.parse(fs.readFileSync(path.join(__dirname, 'corpus', 'phase2_corpus.json'), 'utf8'));
const badC = [];
for (const it of corpus.items) for (const x of eng.recommend(it.text).results) if (x.explanation !== x.song.description || BANNED.test(x.explanation) || QUOTE.test(x.explanation)) badC.push(it.text);
ok(badC.length === 0, 'corpus (' + corpus.items.length + ' inputs): every shown text is the clean song description ' + badC.slice(0, 2).join(' | '));
// the UI no longer stores or renders per-search text
const src = fs.readFileSync(path.join(__dirname, '..', '..', 'discovery.js'), 'utf8');
ok(!/You said|You mentioned|You asked|Your words|quoteOf|possible connection/.test(src), 'discovery.js has no input-quoting template');
ok(!/why:\s*r\.results/.test(src) && /delete st\.why/.test(src), 'sessions no longer store per-search text; old stored text is dropped');
console.log((fail ? 'FAILED ' : '') + pass + '/' + (pass + fail) + ' description checks pass');
process.exit(fail ? 1 : 0);
