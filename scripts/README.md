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
  have their own evidence; exploratory "A place to start" songs are the last resort and are marked
  `fill: 'start'` (since 2026-10-25 no longer a fixed trio — see Diversity below).
- `tests/phase2_expressions.test.js` — the Phase 2 phrases (straight and curly apostrophes),
  edit-and-resubmit, negation, typos, slang, sleep default, Rebuild Trust exclusion, near-duplicates.
- `tests/corpus/phase2_corpus.json` + `tests/measure_corpus.js` — the frozen visitor-input corpus
  (432 inputs, 60 held out) and the fallback measurement:
  `node scripts/tests/measure_corpus.js [engineDir] [--json out.json]`

Run everything on every change:
`node scripts/test_engine.js && node scripts/tests/real_user_regressions.test.js && node scripts/tests/phase2_expressions.test.js`

## Semantic engine — near-duplicates and listening preferences (2026-10-18)

- Data build: `python3 scripts/build_data.py master.xlsx` writes songs / expressions / affinities /
  meaning / manifest and aborts (writing nothing) on any validation failure.
- **Near-duplicate pairs** (`meaning.json` → `pairs`, mirrored in `manifest.json`): Shay / Shay Darkened
  and City of Gold / City of Gold Alien (versions, artist-confirmed shared meaning) and the bet pair
  SR-F02-T08 / T09 (answer song; flagged as a partial basis: a lyric cross-reference, not a shared
  composition). The Formula 07 pair **Spot The Changes / Keep Progressing (SR-F07-T12 / T13) is not a
  near-duplicate**: similar themes do not make compositions duplicates, and the only source link is
  TAB 02's "Overlaps thematically with T12 (title-based)". It is recorded under `notNearDuplicates`
  in the manifest, and the build fails if either track is grouped again.
- **Vocal profile per track** (`songs.json`: `vocal_profile`, `vocal_flags`, `vocal_source`,
  `lyrics_verified`): spoken_narration | sung_lyrics | wordless_vocals | instrumental | unverified,
  derived only from source text (TAB 02 Composition type / Support type / circumstances, TAB 03,
  TAB 04) with the quote stored in `vocal_source`. Mixed tracks carry several flags (Shay: sung +
  scat). When no source states how a track is voiced it is `unverified`. The build checks every
  track has a value with a source and that it agrees with the composition type.
- **Three listening constraints**, applied per track (`discovery.js` `allowed()`):
  - no spoken narration / no talking / no voice-over → excludes spoken narration (sung tracks stay eligible);
  - no lyrics / no words / nothing with words / "something without words" → excludes sung and spoken words
    (wordless vocals and instrumentals stay eligible);
  - instrumental only / just music / no vocals → only purely instrumental tracks.
  Unverified tracks are excluded from all three. "I don't mind lyrics", "vocals are fine",
  "I don't mind the narration" lift the matching constraint; "I have no words" is not a request.
- Tests: `tests/listening_prefs.test.js`, `tests/semantic_meaning.test.js`
  (`SR_MASTER_XLSX=<export> ` enables the negative build test), `tests/dev/refine2_probes.js`.

Run everything on every change:
`node scripts/test_engine.js && node scripts/tests/real_user_regressions.test.js && node scripts/tests/phase2_expressions.test.js && node scripts/tests/semantic_meaning.test.js && node scripts/tests/listening_prefs.test.js`

## Result descriptions (2026-10-18)

- Each result shows the song's own one-sentence description (`scripts/description_lines.json` → `songs.json`
  `description`), grounded in TAB 02 Central meaning / Intended listening experience / Composition type.
  It is identical for every search: it never quotes or repeats the visitor's words, never explains the matching
  (TAB 06 still drives relevance and formula affinity behind the scenes) and never says what the visitor feels.
- The build fails unless every song has a description that is one sentence (25 words / 140 characters at most),
  free of quotation marks, visitor-referencing or mechanism wording ("you said", "matches", "connects to", …)
  and health/treatment words, and type-accurate (F07 "A spoken sleep contemplation…", F08 instrumental "without
  words", I Am Hope "wordless vocal sounds", F06 "Sung in a channelled alien language…").
- Sessions no longer store per-search text; a session saved before this change is shown with the current descriptions.
- Tests: `node scripts/tests/descriptions.test.js`.

## Diversity (2026-10-25)

- Cause of the repeated "I Am Clear / Be Honest With Yourself / I Can Feel Me" set: there was no caching; every input
  without song-level evidence (about 28% of the test inputs) got the same fixed fallback trio, and the same list
  filled empty alternative places.
- **Exploratory fill** (`exploreFill`): drawn from songs whose own TAB 02 meaning / circumstances / desired state are
  open-ended and positive (no narrow situation such as betrayal, guilt or blame; not Formula 06; one version of a pair),
  filtered by listening constraints and tone (spoken sleep only with a sleep cue, energetic songs only when the
  moment is lively, no celebratory songs for a low moment). One song per formula; formulas not already shown first,
  then songs not just shown; ties are rotated by a hash of the input, so the same text always gives the same songs.
  Exploratory places are class 4 and never presented as relevance claims.
- **Formula spread for supported songs**: an alternative from a formula not yet shown is preferred when it is the
  same class or better (a same-formula song still wins when it is clearly stronger, ×1.25); formula affinity alone
  (class 3) supports one track of a formula unless nothing else supported remains.
- **Title words are not evidence** (`W.T = 0`).
- **Session recency** (UI, `sessionStorage` `sonicRemedy.discovery.recent.v1`): the next *different* search in the tab
  passes the songs just shown as `recommend(text, { recent })`; they lose ties within a class (×0.8), never a
  direct first listen. Repeating the same text gives the same result.
- Tests: `node scripts/tests/diversity.test.js`.

## Exposure balance (eagle-balance, 2026-10-25)

- Cause of Eagle (and Be Ready For It All, Let It Be Okay, I Am My Own Energy Source) repeating: exploratory places
  gave every formula an equal share, so the only open song of a small formula (Be Ready For It All is F03's only one;
  Skies and Eagle are F05's only non-energetic ones) took a large share, and the strict "calm first for a low moment"
  key always chose the one calm song of its formula (Eagle in F05). Not a hash bias and not a Sheet error.
- **Fit before rotation**: a song whose own record (situations, expressions, meaning, desired state) carries a concept
  the visitor mentioned wins an exploratory place before any rotation.
- **Weighted rotation**: key = -ln(u) / w with u from the input hash (deterministic). A formula's share grows with
  k^0.75 (k = its open songs); calm-for-low and celebratory-for-lively tone (x1.5) only chooses *which* song of a
  formula, normalised within it; formula-level affinity raises the formula (x1.5 per concept, max 2).
- **Eligibility**: a record with a stated TAB 02 desired state (e.g. "inner steadiness", "momentum") and no narrow
  situation is open-ended too (adds F07 T09/T12/T13/T15, still sleep-cue only).
- **Session history** now covers the last three different searches (up to 9 songs).
- Test 7 in `diversity.test.js` checks the spread for low-moment inputs.

Run everything on every change:
`node scripts/test_engine.js && node scripts/tests/real_user_regressions.test.js && node scripts/tests/phase2_expressions.test.js && node scripts/tests/semantic_meaning.test.js && node scripts/tests/listening_prefs.test.js && node scripts/tests/descriptions.test.js && node scripts/tests/diversity.test.js`
