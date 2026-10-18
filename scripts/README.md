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
