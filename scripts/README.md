# Discovery data and tests (Stage 2)

- `build_songs.py` — generates `data/songs.json` from the master Sheet export
  (`SONIC REMEDY — MASTER SONG INDEX`, File > Download > Microsoft Excel):
  `python3 scripts/build_songs.py master.xlsx data/songs.json`
  Public fields only: no Drive links, source references, working notes, Episodes 17–20
  or raw lyric / spoken-script text (those become an unordered word bag used for matching only).
  Evidence per field is kept in `ev` (artist-confirmed | artist-script | source-supported | ai-inferred)
  and `conf` (sheet confidence).
- `why_lines.json` — the short public why-lines, one per song, authored from TAB 02 meanings,
  each labelled with the evidence behind it.
- `test_engine.js` + `test_inputs.json` — run the in-browser engine under Node:
  `node scripts/test_engine.js`
- Covers live in `assets/covers/<song-id>.webp` (600px, from the public covers on the
  formula sites / song pages; all 70 are the original square artwork).
- `tests/real_user_regressions.test.js` — permanent checks built from real visitors' sentences
  that were once turned away (both straight ' and curly ’ apostrophes). Every meaningful input
  must be accepted with recommendations; only empty or meaningless input gets the prompt; why-lines
  never diagnose or refer to health. Run on every change (exits non-zero on failure):
  `node scripts/tests/real_user_regressions.test.js && node scripts/test_engine.js`

## Phase 2 — human expression library (TAB 05)

- The Sheet stays the source. `TAB 05 — HUMAN EXPRESSION LIBRARY` lists how people actually say
  things (plain words, slang, metaphors, negations, physical sensations, positive states), each
  linked to TAB 02 song IDs with the TAB 02 text that supports the link, a confidence level and
  its source (documented usage with URL, or AI-generated example).
- `build_expressions.py` — generates `data/expressions.json` from the same Sheet export:
  `python3 scripts/build_expressions.py master.xlsx data/expressions.json data/songs.json`
  Every linked ID is checked against TAB 02 and `songs.json`; linked rows must carry a match basis.
  Rows marked "(none — no honest fit)" are kept in the Sheet but carry no songs.
- `discovery.js` loads `data/expressions.json` next to `songs.json` (if it fails to load, matching
  still works without it). Phrases match word by word (plurals/tenses allowed) or, for multi-word
  phrases, by their content words appearing close together in order; a negated phrase
  ("I'm not tired") does not count unless the row itself is a negation. Mistyped words are
  corrected to known words by one edit when unambiguous; common shorthand (idk, dunno, rn, wanna)
  is expanded.
- Any real match returns three songs: remaining slots are filled with the next-best songs that
  have their own evidence; the fixed "A place to start" songs are the last resort and are marked
  `fill: 'start'`.
- `tests/phase2_expressions.test.js` — the Phase 2 phrases (straight and curly apostrophes),
  edit-and-resubmit, negation, typos, slang, sleep default, Rebuild Trust exclusion, near-duplicates.
- `tests/corpus/phase2_corpus.json` + `tests/measure_corpus.js` — the frozen visitor-input corpus
  (432 inputs, 60 held out) and the fallback measurement:
  `node scripts/tests/measure_corpus.js [engineDir] [--json out.json]`

Run everything on every change:
`node scripts/test_engine.js && node scripts/tests/real_user_regressions.test.js && node scripts/tests/phase2_expressions.test.js`
