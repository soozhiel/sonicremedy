// Round 3 reasoning rules (2026-10-18): agency / responsibility, time and modality, clause polarity,
// negation, word sense on both sides, constructions, and the listening pathway. Probe sentences are
// written for the rules (not copied from the LIVE20 regression set).
// Run: node scripts/tests/reasoning_r3.test.js
const { eng } = require('../load_engine.js')();
const M = require('../../meaning.js');
let pass = 0, fail = 0;
function ok(c, name) { if (c) pass++; else { fail++; console.log('FAIL ' + name); } }
const R = t => eng.recommend(t);
const ids = r => r.results.map(x => x.song.id);
const has = (t, id) => ids(R(t)).indexOf(id) >= 0;
const TMNY = 'SR-F01-T05', MIRROR = 'SR-F01-T04', REBUILD = 'SR-F07-T07', ITNC = 'SR-F03-T01', WTTD = 'SR-F07-T01';

// responsibility: the visitor owning a wrong is not told it is someone else's mess (and the reverse stays)
['I yelled at my brother yesterday and it was my fault.', 'I lost my temper with my son and I want to apologise.'].forEach(t => {
  const r = R(t);
  ok(r.frame.responsibility === 'self', 'self-responsibility read: ' + t);
  ok(ids(r).indexOf(TMNY) < 0 && ids(r).indexOf(MIRROR) < 0, 'no other-responsible song: ' + t);
  ok(ids(r).indexOf(REBUILD) >= 0, 'Rebuild Trust offered: ' + t);
});
ok(has('My boss blames me for his own mistakes.', TMNY), 'blamed by someone else: Their Mess Not Yours stays');
// experiencer: a third person's experience is not the visitor's
{ const r = R('My sister is going through a divorce and I want to support her.');
  ok(r.frame.otherExperience.length === 1, 'third-person experience detected');
  ok(r.results[0].song.id === 'SR-F03-T07', 'supporting someone: Be the Light leads'); }
// time: an expected event is not life running out; stated regret still reaches the regret songs
ok(!has('I have a job interview next week and I am nervous.', ITNC), 'anticipation: no If Tomorrow Never Comes');
ok(!has('Tomorrow I start a new job.', ITNC), 'title word "tomorrow" is not evidence');
ok(has('I regret not telling my dad I loved him before he died.', ITNC), 'stated regret: If Tomorrow Never Comes allowed');
// polarity per item: a negative replay is not met by a song about replaying past wins
ok(!has('I keep replaying an embarrassing thing I said at dinner.', WTTD), 'negative replay: no Walk Through the Door');
ok(M.valence(' i feel like a failure ') === 'neg' && M.valence(' it feels like home ') === 'neutral', 'comparison "like" is not liking');
// coordinated negation
{ const r = R('I am not sad or anxious, I just need to focus on my essay.');
  ok(!r.query.concepts.sadness && !r.query.concepts.hesitant, 'coordinated negation drops both states');
  ok(r.results.every(x => x.song.type !== 'spoken-sleep'), 'focus: no spoken sleep contemplation');
  ok(r.results[0].song.type !== 'song' && r.results[0].detail.listen && r.results[0].detail.listen.cue === 'focus', 'focus: wordless lead by listening pathway'); }
// past tense and particle verbs
ok(!!R('I told my boss no and it felt great.').query.concepts.boundaries, 'reported refusal reads as a boundary');
ok(!!R('I said no to my sister today.').query.concepts.boundaries, '"said no" reads as "say no"');
ok(/let go it/.test(require('../../discovery.js').normalise("I can't let it go")), 'particle verb with pronoun object normalised');
ok(R("I can't let it go.").status !== 'ok', 'bare pronoun referent: notice shown');
// constructions
ok(!!R("My head won't switch off at night.").query.concepts.rumination, 'mind + negated stopping verb = rumination');
ok(!!R('What if people laugh at my song?').query.concepts.approval, 'feared judgement = approval');
ok(!!R('I keep putting off showing my poems to anyone.').query.concepts.hesitant, 'delayed sharing = hesitation');
ok(!!R("I'm the one who always looks after everyone at home.").query.concepts.burden, 'always the one doing it for everyone = burden');
ok(eng.recommend('I keep putting off sending it').query.raw.indexOf('spending') < 0, 'speller keeps words the rules read ("sending")');
// listening pathway
{ const r = R("I don't want anything upbeat, it's been a rough day.");
  ok(r.results.every(x => (x.song.experience || []).indexOf('energetic') < 0), 'nothing upbeat: no energetic track'); }
{ const r = R('Having the best weekend, I want to keep this mood going.');
  ok(r.frame.listening.savour === 'explicit' && r.results[0].detail.listen, 'savour cue explicit'); }
ok(R('I just want some peace and quiet.').results.every(x => x.song.type !== 'spoken-sleep'), 'quiet moment: no spoken contemplation');
ok(R('I want to dance around the living room.').results.every(x => x.song.type !== 'spoken-sleep'), 'dancing: no spoken contemplation');
ok(R('power cut tonight, sitting with candles').results.every(x => !x.detail.listen), '"tonight" is a time, not a sleep wish');
ok(R('It keeps me up at night that the world is so unfair.').results.filter(x => x.pathway === 'listening').every(x => x.cls >= 2), 'a listening-only fit is never shown as the song\'s own meaning');
// exploratory starts follow supported cues instead of one fixed trio
{ const a = ids(R('Had a beautiful morning walk by the river.')), b = ids(R("My dog died. I don't need cheering up."));
  ok(a.join() !== b.join(), 'positive and not-uplifting inputs get different exploratory sets');
  ok(R("My dog died. I don't need cheering up.").results.every(x => (x.song.experience || []).indexOf('energetic') < 0), 'grief + nothing uplifting: no energetic'); }
// documented mood word
ok(R('I feel a bit flat lately.').results.some(x => x.detail.mood === 'flat'), 'documented mood word matched (TAB 02 moods)');
console.log(`\n${pass}/${pass + fail} round-3 reasoning checks pass`);
process.exit(fail ? 1 : 0);
