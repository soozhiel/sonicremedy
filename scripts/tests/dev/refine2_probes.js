// Generality probes for the refinement-2 rules. Sentences are written fresh for each RULE (not copied from
// any failed test item). Run: node scripts/tests/dev/refine2_probes.js
const path = require('path');
const { eng } = require(path.join(__dirname, '..', '..', 'load_engine.js'))(path.join(__dirname, '..', '..', '..'));
let pass = 0, fail = 0;
const rec = t => eng.recommend(t);
const ids = r => r.results.filter(x => !x.fill).map(x => x.song.id);
const con = t => Object.keys(rec(t).query.concepts);
function check(rule, t, ok, note) { const r = rec(t); const good = ok(r); good ? pass++ : fail++;
  console.log((good ? 'ok  ' : 'FAIL') + ' [' + rule + '] ' + t + '\n      -> ' + r.status + ': ' + r.results.map(x => 'c' + x.cls + ' ' + x.song.title).join(' | ') + (note ? '   (' + note + ')' : '')); }
const has = (r, k) => Object.keys(r.query.concepts).includes(k);
const noTrouble = r => !ids(r).some(id => ['SR-F01-T09', 'SR-F07-T13', 'SR-F03-T05'].includes(id));   // battles / keep progressing / formula-only needs

console.log('\n== R1 achievement / positive moment: celebratory tone only, no need attributed');
for (const t of ['I passed my driving test this morning!', 'We won the regional chess final.', 'Just handed in my thesis after three years.', 'Landed my first paid gig as a designer.', 'Our team finally shipped the app.'])
  check('R1', t, r => noTrouble(r) && r.results.every(x => x.fill || /good news|proud|You said/.test(x.explanation)) && r.results.every(x => !/progress|struggl|need/i.test(x.explanation.split(':')[0])));
console.log('\n== R2 literal domain frame: physical words in sport / task / object clauses are literal');
check('R2', 'I carried six heavy boxes up the stairs today.', r => !has(r, 'burden'));
check('R2', 'Our team lost the match on Saturday.', r => !has(r, 'defeat'));
check('R2', 'The car got stuck in the mud on the farm road.', r => !has(r, 'stagnant') && !has(r, 'trapped'));
check('R2', 'I let go of the kite string by accident.', r => !has(r, 'lettingGo'));
check('R2 (emotional predicate keeps it)', 'Carrying this project alone makes me feel crushed.', r => has(r, 'burden') || has(r, 'depleted') || r.status !== 'fallback', 'feeling predicate present');
console.log('\n== R3 figurative vehicle: event words inside "like a ..." do not become the visitor\'s act');
check('R3', 'I feel like a kite someone cut loose.', r => !has(r, 'lettingGo') && r.status !== 'ok');
check('R3', 'It feels like a door slammed and I celebrated too soon.', r => true, 'mixed; only checking no crash');
check('R3', 'I feel like a bird in a cage.', r => has(r, 'trapped'), 'state concept kept');
check('R3', 'My week was like a party that never ended.', r => !has(r, 'celebration'));
console.log('\n== R4 absence predicates reverse a positive state');
check('R4', 'I am miles away from the calm I used to have.', r => !r.query.concepts.calm || r.query.concepts.calm.role === 'desire');
check('R4', 'I really miss feeling hopeful.', r => !r.query.concepts.hope || r.query.concepts.hope.role === 'desire');
check('R4', 'Living without any freedom lately.', r => !r.query.concepts.freedom || r.query.concepts.freedom.role === 'desire');
console.log('\n== R5 noun-sense words: verb use is not the concept');
check('R5', 'My brother likes the same bands as me.', r => !has(r, 'approval'));
check('R5', 'I only post for the likes now.', r => has(r, 'approval'));
console.log('\n== R6 difference by comparison construction (+ F06 considered)');
for (const t of ['None of my coworkers think the way I do.', "I'm the only one in my family who reads.", 'No one at my new school dresses like me.', 'Not a single person here shares my sense of humour.'])
  check('R6', t, r => has(r, 'different') && r.results.some(x => x.song.formula.number === 6));
console.log('\n== R7 F06 considered but not automatic lead');
check('R7', 'I always feel like the odd one out.', r => r.results.some(x => x.song.formula.number === 6));
check('R7', 'I feel so isolated from everyone lately.', r => r.results.some(x => x.song.formula.number === 6));
check('R7', 'I feel different from everyone and I want something with no words.', r => r.results.every(x => /^instrumental/.test(x.song.type)), 'constraint wins over F06 (F06 is sung)');
check('R7', "I feel disconnected and I'm homesick for my old town.", r => r.results.some(x => x.song.formula.number === 6));
console.log('\n== R8 quote only complete clauses');
for (const t of ["I'm far from the place where I feel at home.", 'Everyone tells me where I belong but I disagree.', 'I do not feel calm when people shout.'])
  check('R8', t, r => r.results.every(x => !/You said "[^"]{1,12}"/.test(x.explanation) || /You said "[A-Z][^"]+ [^"]+ [^"]+"/.test(x.explanation)));
console.log('\n== R9 figurative schemas (inferred, tentative, never class 1)');
for (const t of ['My battery is completely flat these days.', 'Life feels like wading through mud.', 'Everything in my head is static and noise.', 'The whole world looks washed out lately.'])
  check('R9', t, r => (has(r, 'overwhelm') && !r.query.concepts.overwhelm.inferred) || (r.status !== 'ok' && r.results.every(x => x.cls >= 2) && r.results.some(x => /possible connection, not a certainty|open/.test(x.explanation))), 'explicit noise word is a stated overwhelm, so class 1 is allowed there');
console.log('\n== R10 closed-class overlap is not a match');
for (const t of ['Every time I call my sister she is busy.', 'I keep getting the bus at the same time.', 'People always ask me the way to the station.'])
  check('R10', t, r => r.results.every(x => x.cls >= 2));
console.log('\n== R11 hyphenated compounds stay content words even when a part is closed-class');
check('R11', 'Years of people-pleasing have worn me out.', r => r.results.some(x => x.cls === 1));
check('R11', 'Every single time I lose, I get away with nothing.', r => r.results.every(x => x.cls >= 2), 'closed words alone are not a match');
console.log('\n== R12 a good circumstance in a background clause is not a celebrated moment');
check('R12', 'Work is fine now that the deadline passed, but I feel flat.', r => !(r.query.concepts.celebration && r.query.concepts.celebration.inferred));
check('R12', 'I feel uneasy since everything is going well.', r => !r.query.concepts.celebration);
check('R12 (foreground kept)', 'Everything is going well and I feel great.', r => !!r.query.concepts.celebration);
console.log('\n== R13 a want read from the message shape is not quoted as a stated wish');
for (const t of ['Do I take the offer or not? I go back and forth.', 'Should I quit or stay another year?'])
  check('R13', t, r => r.results.every(x => !/You said you'd like/.test(x.explanation)));
console.log(`\n${pass}/${pass + fail} probes pass`);
