/* Sonic Remedy — personal song discovery (Stage 2).
 * Deterministic, in-browser matching over data/songs.json (generated from the master Sheet by
 * scripts/build_songs.py). No network calls other than loading that file, no external AI.
 * The engine (createEngine) is pure and also runs under Node for testing (scripts/test_engine.js).
 */
(function (root) {
  'use strict';

  /* ------------------------------------------------------------------ text */
  var STOP = new Set(('a an the and or but so to of in on at for with by from as into onto than then ' +
    'i me my mine myself we us our you your yours yourself it its this that these those there here ' +
    'is am are was were be been being do does did doing have has had having will would can could ' +
    'should shall may might must just really very quite bit lot lots kind sort thing things stuff ' +
    'about what when where who whom how why which while all any some more most much many such only ' +
    'same too also again ever even still yet now today lately recently always get got getting go going ' +
    'gone like one ones something someone anything everything nothing way ok okay im ive id ill dont ' +
    'cant wont isnt arent wasnt werent didnt doesnt hasnt havent shouldnt wouldnt couldnt please ' +
    'want wanted wanting need needs needed wish feel feels feeling felt think make makes made know ' +
    'he she him her his they them their theirs it\'s let lets back off over up down out not no never ' +
    'anyone everyone someone anybody everybody somebody nobody whatever keep keeps kept').split(/\s+/));

  var IRREG = { felt: 'feel', lost: 'lose', kept: 'keep', thought: 'think', ran: 'run', went: 'go',
    began: 'begin', begun: 'begin', broke: 'break', broken: 'break', hurt: 'hurt', hurting: 'hurt',
    stuck: 'stuck', children: 'child', people: 'person', ideas: 'idea', lives: 'life', selves: 'self',
    better: 'better', worse: 'bad', best: 'best', stronger: 'strong', strength: 'strong',
    freedom: 'free', freely: 'free', clarity: 'clear', clearer: 'clear', clearly: 'clear',
    hopeful: 'hope', hopeless: 'hopeless', anger: 'angry', angrier: 'angry', angrily: 'angry',
    excitement: 'excit', exciting: 'excit', excited: 'excit', ready: 'ready', readiness: 'ready',
    connection: 'connect', connected: 'connect', disconnection: 'disconnect', disconnected: 'disconnect',
    gratitude: 'grateful', thankful: 'grateful', sleepy: 'sleep', asleep: 'sleep', slept: 'sleep',
    tired: 'tired', trapped: 'trap', trapping: 'trap', doubts: 'doubt', doubting: 'doubt' };

  function normalise(s) {
    return String(s || '').toLowerCase()
      .replace(/[\u2018\u2019\u02bc`]/g, "'").replace(/[\u201c\u201d]/g, '"')
      .replace(/[\u2013\u2014]/g, ' - ')
      .replace(/\bcan't\b|\bcannot\b|\bcant\b/g, 'can not')
      .replace(/\bwon't\b|\bwont\b/g, 'will not')
      .replace(/\b(\w+)n't\b/g, '$1 not')
      .replace(/\b(do|does|did|is|are|was|were|have|has|had|could|would|should)nt\b/g, '$1 not')
      .replace(/\bi'm\b|\bim\b/g, 'i am')
      .replace(/\bidk\b/g, 'i do not know').replace(/\bdunno\b/g, 'do not know').replace(/\brn\b/g, 'right now')
      .replace(/\b(pls|plz)\b/g, 'please').replace(/\bwanna\b/g, 'want to').replace(/\bgonna\b/g, 'going to')
      .replace(/\b(\w+)'ve\b/g, '$1 have').replace(/\b(\w+)'re\b/g, '$1 are')
      .replace(/\b(\w+)'ll\b/g, '$1 will').replace(/\b(\w+)'d\b/g, '$1 would')
      .replace(/\b(\w+)'s\b/g, '$1').replace(/'/g, '')
      .replace(/second[- ]guess/g, 'secondguess').replace(/self[- ]doubt/g, 'selfdoubt')
      .replace(/burn[- ]?out|burnt out|burned out/g, 'burnout')
      .replace(/\bhold(ing|s)? (everyone|everything|it all|things|the family|the team) together\b/g, 'holdingitalltogether');
  }

  function stem(w) {
    if (IRREG[w]) return IRREG[w];
    if (w.length <= 3) return w;
    var s = w;
    if (/ies$/.test(s) && s.length > 4) s = s.slice(0, -3) + 'y';
    else if (/(ss|us|is)$/.test(s)) { /* keep */ }
    else if (/(sses|xes|ches|shes)$/.test(s)) s = s.slice(0, -2);
    else if (/s$/.test(s)) s = s.slice(0, -1);
    if (/ingly$/.test(s) && s.length > 7) s = s.slice(0, -5);
    else if (/edly$/.test(s) && s.length > 6) s = s.slice(0, -4);
    if (/ing$/.test(s) && s.length > 5) s = s.slice(0, -3);
    else if (/ed$/.test(s) && s.length > 4) s = s.slice(0, -2);
    else if (/ness$/.test(s) && s.length > 6) s = s.slice(0, -4);
    else if (/ful$/.test(s) && s.length > 6) s = s.slice(0, -3);
    else if (/ly$/.test(s) && s.length > 5) s = s.slice(0, -2);
    else if (/ment$/.test(s) && s.length > 7) s = s.slice(0, -4);
    if (/([bdfgklmnprt])\1$/.test(s) && s.length > 3) s = s.slice(0, -1);
    if (/e$/.test(s) && s.length > 4) s = s.slice(0, -1);
    return IRREG[s] || s;
  }

  function words(s) { return normalise(s).match(/[a-z]+/g) || []; }
  function stems(s) {
    var out = [];
    words(s).forEach(function (w) { if (w.length > 2 && !STOP.has(w)) out.push(stem(w)); });
    return out;
  }

  /* -------------------------------------------------------------- concepts
   * Everyday language -> shared concepts. Applied to the visitor's words AND to each song's
   * intelligence fields, so "caged" meets "boxed in", "can't switch off" meets "racing mind".
   * Patterns run on normalised text (contractions expanded). Keep them literal and readable. */
  var CONCEPTS = {
    trapped: /\b(trap\w*|boxed in|box(ed)? me in|caged?|confin\w*|suffocat\w*|can not breathe|restrict\w*|controll(ed|ing)|micromanag\w*|tied down|chained|prison\w*|cornered|hemmed in|no room to move|no space|need space|walls closing)\b/,
    freedom: /\b(free|freedom|freer|liberat\w*|unchained|unrestrained|break(ing)? free|spacious\w*|open(ness)? space)\b/,
    overwhelm: /\b(overwhelm\w*|too much|overload\w*|cluttered|clutter|swamped|drowning|crowded|head is (too )?full|mind is full|so much going on|information overload|noise)\b/,
    fog: /\b(confus\w*|fog\w*|unclear|muddled|can not think( straight)?|head is a mess|scrambled|blurry|hazy|disorient\w*)\b/,
    clarity: /\b(clarity|clear(ly|er|ness)?|see clearly|perspective|see straight|lucid|make sense of)\b/,
    uncertain: /\b(uncertain\w*|unsure|not sure|do not know (what|where|which|if|how)|unknown|no idea what|unpredictab\w*|what comes next|what is next|no map|in limbo|up in the air|indecisi\w*|undecided)\b/,
    controlLoss: /\b(out of control|lost control|losing control|can not control|no control|loss of control|spiral\w*|falling apart|chaos|chaotic|everything is changing|control over)\b/,
    selfDoubt: /\b(secondguess\w*|selfdoubt|doubt\w*|imposter|impostor|do not believe in myself|insecur\w*|not good enough|not confident|lack confidence|no confidence|believe in myself|back myself|trust myself|trust my(self| own| gut| instinct))\b/,
    approval: /\b(approv\w*|validat\w*|permission|what (other )?people think|what others think|opinions?|judg\w*|likes|impress\w*|people pleas\w*)\b/,
    procrastination: /\b(procrastinat\w*|put(ting)? (it |things )?off|postpon\w*|never start\w*|can not start|do not start|delay\w*|someday|keep waiting|waiting for the (right|perfect)|avoid\w* (starting|it)|never get (around|round) to|not started|never finish\w*|haven not started)\b/,
    creative: /\b(creat\w*|ideas?|art|artist\w*|music|write|writing|paint\w*|project\w*|make things|making things|spark|inspir\w*|craft|design\w*|imagin\w*)\b/,
    perfection: /\b(perfect\w*|good enough|flawless|imperfect\w*|mistakes?|polish\w*)\b/,
    courage: /\b(courage\w*|brave\w*|bold\w*|go for it|all in|take the leap|leap|dare|daring|risk|put myself out there|share my (work|art|music)|show (my|people)|scared to (share|show|start))\b/,
    lettingGo: /\b(let(ting)? go|release|move on|moving on|holding on|hold on to|cling\w*|attach\w*|can not let go|drop it|set (it )?down|unlearn\w*)\b/,
    burden: /\b(carry\w*|burden\w*|weight|heavy|(everyone|everybody|someone|somebody) else(s)? (problems|mess|stuff|issues|drama)|other people(s)? (problems|mess|issues)|their problems|their mess|responsib\w*|rescu\w*|saviou?r|fix everyone|clean(ing)? up after|pick(ing)? up the pieces|load|absorb\w*|holdingitalltogether|do(ing)? everything|while (they|others) do nothing)\b/,
    notMine: /\b(not mine|is not mine|not my (problem|mess|burden|responsibility|job)|belongs to someone else|theirs to carry|(someone|somebody|everyone) else(s)? (mess|problems?|burden)|their mess|never (mine|yours) to carry|not yours to carry|every burden yours)\b/,
    boundaries: /\b(boundar\w*|say no|saying no|people pleas\w*|taken advantage|doormat|walk(ed)? all over|not my problem|in my lane|my lane)\b/,
    blameOthers: /\b(i (keep |always |often )?(blame|blaming|judge|judging|criticis\w*)|blam(e|ing) (others|everyone|everybody|other people|the world)|judging (others|people)|point(ing)? the finger|stop blaming|haters?)\b/,
    blamed: /\b(blaming me|blame me|blamed|scapegoat\w*|lie(d|s)? about me|lied about|accus\w*|gossip\w*|thrown under the bus)\b/,
    envy: /\b(envy|envious|jealous\w*|compar\w*|admire|resent (their|her|his) success)\b/,
    anger: /\b(angry|anger|furious|rage|raging|resent\w*|irritab\w*|irritated|snapp?\w*|mad at|livid|fuming|temper|argument|argu\w*|fight with)\b/,
    frustration: /\b(frustrat\w*|fed up|sick of|tired of|annoyed|over it|had enough)\b/,
    sleep: /\b(sleep\w*|insomnia|bed|bedtime|night\w*|awake|keep(s|ing)? me up|kept me up|wind down|drift off|fall asleep|can not switch off|switch off|rest)\b/,
    rumination: /\b(replay\w*|overthink\w*|over-think\w*|ruminat\w*|racing (thoughts|mind)|mind (is )?racing|mind races|thoughts race|thoughts racing|million thoughts|mind keeps|can not stop thinking|going over|loop\w*|on repeat|mind (will|would) not (stop|switch off|quiet)|switch off|thoughts (keep|will not))\b/,
    distraction: /\b(distract\w*|focus\w*|scattered|attention|scroll\w*|screens?|phone|jumping around|all over the place)\b/,
    hope: /\b(hope|hopeful\w*|hoping|optimis\w*|possibilit\w*|light at the end|better days|look(ing)? forward)\b/,
    defeat: /\b(defeat\w*|discourag\w*|give up|giving up|pointless|no point|hopeless\w*|deflat\w*|beaten|crushed|what is the point|can not see a way|nothing works|lost hope|given up)\b/,
    // 'power'/'powerful' removed (2026-10-18): "in my power", "power cut" are not about inner strength
    strength: /\b(strong|strength|powerless|weak|weakness|vulnerab\w*|depleted|fragile|resilien\w*|capable|helpless)\b/,
    depleted: /\b(exhaust\w*|drained|burnout|depleted|worn out|no energy|running on empty|tired all the time|fatigu\w*)\b/,
    disconnected: /\b(disconnect\w*|lonely|loneliness|alone|isolat\w*|separat\w*|fragment\w*|torn( apart)?|cut off|numb|out of touch|lost touch|lost connection|do not feel like myself|not myself)\b/,
    connection: /\b(connect\w*|reconnect\w*|whole|wholeness|unity|oneness|belonging|(i|we|you) (do not |never |really |truly )?belong|source|grounded)\b/,   // not 'belongs to someone else' / 'can a step belong'
    newStart: /\b(new (beginning|start|chapter|job|role|city|country|relationship|project|thing|venture|business|path|direction)|fresh start|start(ing)? over|something new|starting out|about to (start|begin|launch|move)|launch\w*|threshold|next chapter|next step|first step|begin\w*)\b/,
    hesitant: /\b(hesita\w*|nervous|cold feet|scared|afraid|fear\w*|scar(e|es|ed|y)|frighten\w*|anxious|anxiety|worried|worry|holding (myself )?back|hold (myself )?back|not ready|reluctan\w*|second thoughts)\b/,
    readiness: /\b(ready|readiness|prepared|set to go|willing)\b/,
    celebration: /\b(celebrat\w*|excit\w*|joy\w*|party|dance|dancing|thrill\w*|happy|happiness|good news|win|won|achiev\w*|glitter\w*|buzz\w*|elated|delight\w*|passion\w*|fun)\b/,
    different: /\b((feel|am|being|so|too|always been|always felt|feeling) different|different from (everyone|others|other people|the rest)|living differently|see things differently|do not fit|never fit|not fit|fit in|do not belong|never belong|(never|do not|rarely) (really )?feel (like )?i (fit|belong)|fitting in|weird|outsider|misfit|odd one out|strange|alien|nobody gets me|no one gets me|not like (other|everyone)|stand out|unusual|out of place)\b/,
    home: /\b(home|homes|homesick\w*|miss home|abroad|moved (away|overseas|countries)|another country|expat|where i (come|came) from)\b/,
    heard: /\b(heard|unheard|listen\w*|ignored|no one listens|nobody listens|voice|understood|misunderstood)\b/,
    betrayed: /\b(betray\w*|cheated on|lied to me|lie(d)? about me|stabbed in the back|backstab\w*|can not trust (anyone|people|them)|trust issues|they hurt me|someone hurt me|was hurt by)\b/,
    causedHurt: /\b(i hurt (someone|him|her|them|my)|i messed up|my fault|i broke (their|his|her|my \w+|someone) trust|make it right|apologi[sz]\w*|win back|earn (back )?(their|his|her) trust|regret what i did|i let (them|him|her) down|i cheated|i lied)\b/,
    guilt: /\b(guilt\w*|undeserv\w*|do not deserve|ashamed|shame\w*|unworthy)\b/,
    gratitude: /\b(grateful|gratitude|thankful|thanks|thank you|appreciat\w*|take (it|things|everything) for granted|blessed)\b/,
    family: /\b(parent\w*|mum|mom|mother|dad|father|family|raised|upbringing|childhood|grew up|carers?|siblings?)\b/,
    expectations: /\b(expectation\w*|supposed to|should|pressure\w*|obligat\w*|owe|debt|duty|guilt trip\w*|demands?)\b/,
    love: /\b(love|loving|relationship\w*|partner|romance|romantic|boyfriend|girlfriend|husband|wife|dating|marriage)\b/,
    supportOther: /\b(support (someone|my|a friend|them|him|her)|be there for|someone i love|loved one|friend is struggling|help (a friend|my friend|them|him|her) through|under pressure)\b/,
    selfWorth: /\b(enough|worth\w*|not enough|inadequate|less than)\b/,
    // 'tomorrow' removed (2026-10-18): "my interview is tomorrow" is not regret
    regret: /\b(regret\w*|life is short|wast(e|ing) (my )?time|wast(e|ing) my life|running out of time|legacy|before it is too late|no regrets)\b/,
    direction: /\b(path|direction|purpose|calling|career|what to do with my life|drift\w*|lost in life|which way|crossroads|meaning)\b/,
    routine: /\b(bor(ed|ing|edom)|routine|same (thing )?every day|every day is the same|monoton\w*|rut|repetiti\w*|groundhog|same old|mundane|dull)\b/,
    stagnant: /\b(stuck|stagnant|stagnat\w*|plateau\w*|progress\w*|momentum|going in circles|hamster wheel|treadmill|nothing (ever )?changes|standing still|not moving|getting nowhere|keep going|give up on)\b/,
    honesty: /\b(honest\w*|lying to myself|lie to myself|denial|pretend\w*|deep down|avoid\w*|kidding myself|fooling myself|truth)\b/,
    potential: /\b(potential|better version|best version|self-improvement|improve myself|who i could be|future self|become)\b/,
    advice: /\b(advice|advise|i know what i should do|know what to do|help everyone but|follow my own)\b/,
    patience: /\b(patien\w*|impatien\w*|slow|takes time|taking (so )?long|struggling with (something|a) new|learning curve)\b/,
    calm: /\b(calm\w*|peace\w*|quiet\w*|still\w*|relax\w*|sooth\w*|tranquil\w*|serene|gentle|unwind|breathe)\b/,
    complain: /\b(complain\w*|whin\w*|moan\w*|whing\w*|vent\w*)\b/,
    authentic: /\b(authentic\w*|real me|true self|fake|mask|be myself|being myself|genuine)\b/,
    improvise: /\b(control everything|need to understand|plan everything|over-?plan\w*|mystery|improvis\w*|go with the flow|spontan\w*|impromptu)\b/,
    meTime: /\b(time (to|for) myself|me time|alone time|day off|no obligations|holiday|vacation|a break|nothing to do|no deadlines|no calls)\b/,
    together: /\b(together|team\w*|partnership|as a couple|we can|work it out|make (this|it) work|hard times)\b/,
    discomfort: /\b(discomfort|uncomfortable|unease|uneasy|comfort zone)\b/,
    // 'low'/'down'/'blue' only as feelings (2026-10-18): "slow down", "set it down" are not sadness
    sadness: /\b(sad|sadness|feel(ing)? (so |really |a bit )?(low|down|blue)|heartbroken|grief|griev\w*|cry\w*|tears)\b/,
    work: /\b(work|job|boss|colleague\w*|office|workplace|manager|coworker\w*|career)\b/,
    sufferingAlone: /\b(suffer\w*|struggl\w* alone|no one to (help|turn to)|dark place|nobody cares|on my own)\b/,
    selfFirst: /\b(look after myself|take care of myself|self-care|put myself first|my own needs|neglect\w* myself)\b/,
    complainingOthers: /\b(drift into my lane|others stall|talk big|all talk)\b/,
    // added for the TAB 06 meaning layer: play / productivity and decisions (TAB 02 + TAB 06 F02/F05 affinity text)
    play: /\b(play|playing|playful\w*|just for fun|for fun|productive|productivity)\b/,
    decision: /\b(decid\w*|decision\w*|crossroads|torn between)\b/,
    // other people's voices over the visitor's own choices (TAB 06 T05; TAB 02 F02-T07 wording)
    outsideVoices: /\b((everyone|everybody|people|they) (has|have|gives?|tells?|keeps? telling|says?) (me )?(advice|what to do|their opinion)|everyone tells me|told what to do|who do i listen to|(is|are) (my|this|these) (choice|choices|decision|life) (even |really )?mine|play god|tell (my|your) fortune)\b/
  };
  var CONCEPT_KEYS = Object.keys(CONCEPTS);
  // Context concepts say where something is happening, not what it feels like; alone they are
  // not enough to claim a match, and they weigh less.
  var CONTEXT = new Set(['work', 'family', 'love', 'creative']);
  // Concepts that are simply absent when negated ("i am not angry"). Others keep their meaning
  // because the negation is part of the state itself ("i never fit in", "not good enough").
  var DROP_ON_NEG = new Set(['anger', 'sadness', 'overwhelm', 'fog', 'frustration', 'depleted', 'hesitant',
    'celebration', 'work', 'family', 'love', 'sleep', 'rumination', 'guilt', 'envy', 'routine', 'trapped',
    'disconnected', 'uncertain', 'controlLoss', 'defeat', 'betrayed', 'blamed', 'blameOthers', 'burden',
    'procrastination', 'stagnant', 'home', 'complain', 'advice']);
  // Concepts that describe a wanted state; when they appear in a desire clause they search the
  // songs' desired-state field first ("I want to feel free" -> I Am Free).
  var POSITIVE = new Set(['freedom', 'clarity', 'hope', 'strength', 'connection', 'readiness', 'calm',
    'celebration', 'gratitude', 'courage', 'authentic', 'meTime', 'together', 'potential', 'selfWorth']);

  function conceptsIn(text) {
    var n = ' ' + normalise(text) + ' ', out = [];
    for (var i = 0; i < CONCEPT_KEYS.length; i++) if (CONCEPTS[CONCEPT_KEYS[i]].test(n)) out.push(CONCEPT_KEYS[i]);
    return out;
  }

  /* --------------------------------------------------------- query parsing */
  var DESIRE_CUE = /\b(i want|i would like|i would love|i wish|i need|i am looking for|looking for|help me|i hope to|i long|longing|seeking|i am seeking|i crave|craving|to feel|to be able|i just want|i miss feeling|i used to feel|instead)\b/;
  var FEAR_CUE = /\b(do not want to (feel|be|stay|keep)|not want to (feel|be)|stop feeling|no longer want|tired of (feeling|being)|sick of (feeling|being)|afraid of (feeling|being)|without feeling)\b/;
  var PLAIN_NEG = /\b(not|never|no longer|isn not|am not|no)\b/;

  // Split into clauses on sentence marks and contrast words; text after a contrast word weighs more.
  function clauses(text) {
    var n = normalise(text);
    var parts = n.split(/[.!?;,\n]+/);
    var out = [];
    parts.forEach(function (p) {
      var segs = p.split(/\b(but|though|although|however|yet|instead of|rather than|instead)\b/);
      var w = 1, role = null;
      for (var i = 0; i < segs.length; i++) {
        var s = segs[i];
        if (!s || !s.trim()) continue;
        if (/^(but|though|although|however|yet)$/.test(s)) { w = 1.3; role = null; continue; }
        if (/^(instead of|rather than)$/.test(s)) { role = 'situation'; w = 0.9; continue; }
        if (s === 'instead') { role = 'desire'; w = 1.3; continue; }
        out.push({ text: s, weight: w, forced: role });
      }
    });
    return out;
  }

  // Visitor-side words that only carry a concept in particular constructions (2026-10-18). The song
  // records still use them; only the reading of the visitor's text is narrowed.
  function weakTrigger(k, word, before, role, clause) {
    word = word.trim();
    if (k === 'calm' && /^(quiet\w*|still\w*)$/.test(word) && role !== 'desire') return true;       // "it's so quiet since..."
    if (k === 'love' && word === 'partner' && /\b(business|work|project|lab|tennis|dance|study|training|sparring) $/.test(before)) return true;
    if (k === 'different' && /^(strange|weird|unusual|odd one out|stand out)$/.test(word) && !/\bi (feel|am|felt|was|always feel)( so| a bit| kind of| really| quite| like)? $/.test(before) && !/\bi am the $/.test(before) && !/^(weird|strange) one\b/.test(clause.slice(clause.indexOf(word)))) return true;
    if (k === 'honesty' && word === 'honestly') return true;                                        // an adverb, not a theme
    if (k === 'play' && /^(play|playing)$/.test(word) && (/\b(a|the|role|screen|foul|fair|power) $/.test(before) || /\bplay(ing)? (me|us|some|something|a song|music|anything)\b/.test(clause))) return true;   // "play me something" asks for music
    return false;
  }

  function parseQuery(text) {
    var q = { tokens: {}, concepts: {}, pref: {}, raw: normalise(text), n: 0 };
    var cl = clauses(text);
    cl.forEach(function (c) {
      var t = ' ' + c.text + ' ';
      var desire = c.forced === 'desire' || DESIRE_CUE.test(t);
      var fear = FEAR_CUE.test(t);
      // plain negation of a state ("i am not angry", "it is not about work") removes it,
      // unless the clause is a fear/desire construction ("i do not want to feel trapped").
      var plainNeg = !fear && !desire && PLAIN_NEG.test(t);
      var dropped = new Set(), kept = new Set();
      CONCEPT_KEYS.forEach(function (k) {
        var re = new RegExp(CONCEPTS[k].source, 'g'), m;
        while ((m = re.exec(t))) {
          if (m[0] === '') { re.lastIndex++; continue; }
          var before = t.slice(Math.max(0, m.index - 28), m.index);
          // "can not switch off" / "could not stop" describe the state itself, not its absence
          var negHere = /\b(not|never|no longer|no|without)\s+(\w+\s+)?$/.test(before) &&
            !/\b(can|could|will|would) not\s+(\w+\s+)?$/.test(before);
          var role = c.forced || (desire ? 'desire' : 'situation'), fromNeg = false;
          if (weakTrigger(k, m[0], before, role, t)) continue;
          var w = c.weight;
          if (negHere && !fear && !desire) {
            // "not hopeful", "no clarity": a missing positive state is a felt need.
            if (POSITIVE.has(k)) { role = 'desire'; fromNeg = true; }
            else if (DROP_ON_NEG.has(k)) { w = 0; stems(m[0]).forEach(function (x) { dropped.add(x); }); } // "not angry": drop it
          } else {
            stems(m[0]).forEach(function (x) { kept.add(x); });
          }
          if (fear) role = 'situation';
          if (CONTEXT.has(k)) w *= 0.45;
          if (w <= 0) continue;
          var prev = q.concepts[k];
          if (!prev || prev.weight < w) q.concepts[k] = { weight: w, role: role, context: CONTEXT.has(k), fromNeg: fromNeg && role === 'desire' };
        }
      });
      stems(c.text).forEach(function (s) {
        if (dropped.has(s) && !kept.has(s)) return;
        q.tokens[s] = Math.max(q.tokens[s] || 0, c.weight);
      });
      if (plainNeg) { /* tokens stay; concepts above already handle negation */ }
    });
    q.n = Object.keys(q.tokens).length;
    // listening-experience preferences (E)
    var r = q.raw;
    function pref(key, re, negRe) {
      if (negRe && negRe.test(r)) q.pref[key] = -1; else if (re.test(r)) q.pref[key] = 1;
    }
    pref('sleep', /\b(sleep\w*|insomnia|bed|bedtime|at night|tonight|awake|keep(s|ing)? me up|kept me up|wind down|drift off|switch off|lying in bed)\b/,
      /\b((do not want to|not trying to|not looking to|not here to) sleep|not sleepy|not tired|nothing (sleepy|for sleep))\b/);
    pref('instrumental', /\b(instrumental|no (words|lyrics|vocals|talking)|without (words|lyrics|vocals)|just music|wordless)\b/,
      /\b(not instrumental|with (words|lyrics))\b/);
    pref('spoken', /\b(spoken|talk me through|guided|guide me|meditation|voice to (listen|guide))\b/,
      /\b(no (talking|voice|speaking)|not (a )?meditation|do not want (a )?(voice|talking|meditation))\b/);
    pref('energetic', /\b(upbeat|energ(y|etic)|danc\w*|pump\w* up|hype|celebrat\w*|party|lift me)\b/,
      /\b(not (upbeat|energetic)|nothing (upbeat|energetic))\b/);
    pref('calm', /\b(calm\w*|sooth\w*|relax\w*|gentle|quiet|peaceful|slow down|unwind)\b/, null);
    return q;
  }

  /* ------------------------------------------------- expression library (TAB 05)
   * data/expressions.json is generated from TAB 05 — HUMAN EXPRESSION LIBRARY by
   * scripts/build_expressions.py. Each row maps how people actually say things (plain words,
   * slang, metaphors, negations, physical sensations) to TAB 02 songs, strongest first. Rows are
   * matched as phrases (word by word, allowing plural/tense variants) or, for phrases with two or
   * more content words, by all of those words appearing close together. A phrase that is
   * negated in the visitor's text ("I'm not tired") does not count, unless the row is itself a
   * negation ("I don't want to be angry anymore") or names a wanted state ("I don't feel ready"
   * still means readiness is the need). */
  var EXPR_CONF = { high: 1, medium: 0.85, 'low-medium': 0.7, low: 0.55 };
  var NEG_WORD = /^(not|never|no|without|nothing|nobody|none|neither|nor)$/;
  var EXPR_RANK = [1, 0.86, 0.74, 0.64, 0.56];
  function exprWords(s) { return normalise(s).replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean); }
  function buildExpressions(lib) {
    var out = [];
    ((lib && lib.expressions) || []).forEach(function (x) {
      if (!x.songs || !x.songs.length || !(x.conf in EXPR_CONF)) return;
      var keepsOnNeg = /negation/i.test(x.register || '') || /^hope/i.test(x.theme || '');
      x.phrases.forEach(function (p) {
        var w = exprWords(p);
        if (!w.length) return;
        var content = w.filter(function (t) { return t.length > 2 && !STOP.has(t); }).map(stem);
        out.push({ id: x.id, words: w, wstems: w.map(stem), content: Array.from(new Set(content)), songs: x.songs,
          conf: EXPR_CONF[x.conf], low: x.conf === 'low' || x.conf === 'low-medium',
          selfNeg: w.some(function (t) { return NEG_WORD.test(t); }), keepsOnNeg: keepsOnNeg });
      });
    });
    return out;
  }
  // Returns non-overlapping phrase hits in the visitor's text, longest/most specific first.
  function matchExpressions(lib, text) {
    if (!lib.length) return [];
    var qw = exprWords(text), qs = qw.map(stem), hits = [];
    function negatedAt(i) {
      for (var k = Math.max(0, i - 3); k < i; k++) if (NEG_WORD.test(qw[k])) {
        // "do not want to (feel|be) X" describes X as the situation, so it still counts
        if (/^(want|wanna)$/.test(qw[k + 1] || '') || /^(want)$/.test(qw[k + 2] || '')) return false;
        return true;
      }
      return false;
    }
    lib.forEach(function (e) {
      var n = e.words.length, found = null;
      // 1) phrase, word by word (stems allow plurals and tenses)
      for (var i = 0; i + n <= qw.length && !found; i++) {
        var ok = true;
        for (var j = 0; j < n && ok; j++) ok = qw[i + j] === e.words[j] || (qs[i + j] === e.wstems[j] && e.wstems[j].length > 3);
        if (ok) found = { start: i, end: i + n, exact: true };
      }
      // 2) two or more content words close together and in the same order ("my chest has been
      //    so tight"), none of them negated in the visitor's text
      if (!found && e.content.length >= 2 && !e.selfNeg) {
        var span = e.words.length + 3;
        for (var a = 0; a < qs.length && !found; a++) {
          if (qs[a] !== e.content[0]) continue;
          var next = 1, last = a, clean = true;
          for (var b = a + 1; b < Math.min(qs.length, a + span) && next < e.content.length; b++) {
            if (qs[b] === e.content[next]) { if (negatedAt(b)) clean = false; next++; last = b; }
          }
          if (next === e.content.length && clean) found = { start: a, end: last + 1, exact: false };
        }
      }
      if (!found) return;
      if (!e.selfNeg && !e.keepsOnNeg && negatedAt(found.start)) return;
      var spec = Math.min(4, Math.max(e.content.length, 1));
      hits.push({ e: e, start: found.start, end: found.end, len: found.end - found.start, exact: found.exact,
        strength: e.conf * (0.7 + 0.1 * spec) * (found.exact ? 1 : 0.85) });
    });
    hits.sort(function (x, y) { return y.len - x.len || y.strength - x.strength; });
    var taken = [], kept = [];
    hits.forEach(function (h) {
      for (var i = h.start; i < h.end; i++) if (taken[i]) return;   // a longer phrase already covers these words
      for (var k = h.start; k < h.end; k++) taken[k] = true;
      kept.push(h);
    });
    // one hit per library row (variants of the same row do not stack)
    var byRow = {};
    kept.forEach(function (h) { if (!byRow[h.e.id] || byRow[h.e.id].strength < h.strength) byRow[h.e.id] = h; });
    return Object.keys(byRow).map(function (k) { return byRow[k]; });
  }

  /* ------------------------------------------------------------ typo repair
   * Mistyped words ("overwelmed", "congestd", "wolrd") are corrected to the nearest word the
   * song records or TAB 05 use, by one edit (insert, delete, swap or change one letter), and only
   * when the typed word is unknown and the correction is unambiguous. */
  function edit1(a, b) {
    if (a === b) return false;
    var la = a.length, lb = b.length;
    if (Math.abs(la - lb) > 1) return false;
    var i = 0; while (i < la && i < lb && a[i] === b[i]) i++;
    if (la === lb) {
      if (a.slice(i + 1) === b.slice(i + 1)) return true;                      // substitution
      return a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);   // swap
    }
    return la > lb ? a.slice(i + 1) === b.slice(i) : a.slice(i) === b.slice(i + 1);         // delete / insert
  }
  function makeSpeller(vocab) {
    var byLen = {};
    vocab.forEach(function (w) { (byLen[w.length] = byLen[w.length] || []).push(w); });
    var cache = {};
    function fix(w) {
      if (w.length < 4 || vocab.has(w) || STOP.has(w)) return w;
      if (cache[w] !== undefined) return cache[w];
      var c = w.replace(/([a-z])\1{2,}/g, '$1$1');           // "rooom" -> "room"
      if (vocab.has(c)) return (cache[w] = c);
      var single = c.replace(/([a-z])\1/g, '$1');             // "ouut" -> "out"
      if (single !== c && vocab.has(single)) return (cache[w] = single);
      var found = [];
      [c.length - 1, c.length, c.length + 1].forEach(function (L) {
        (byLen[L] || []).forEach(function (v) { if (v[0] === c[0] && edit1(c, v)) found.push(v); });
      });
      cache[w] = (c.length >= 5 && found.length === 1) ? found[0] : w;
      return cache[w];
    }
    return function (text) {
      return String(text || '').replace(/[A-Za-z\u2019']+/g, function (tok) {
        var lower = tok.toLowerCase();
        if (/['\u2019]/.test(lower)) return tok;
        var f = fix(lower);
        return f === lower ? tok : f;
      });
    };
  }

  /* ---------------------------------------------------------------- engine */
  var EVIDENCE = { 'artist-confirmed': 1, 'artist-script': 1, 'source-supported': 1, 'artist-confirmed+ai-inferred': 1, 'ai-inferred': 0.95 };
  // A sleep request with no particular subject ("help me sleep", "I just want to switch off and
  // sleep") starts at the beginning of the Sleep Sequence: Episodes 1, 2, 3 (user decision 2026-10-18).
  var SLEEP_DEFAULT = ['SR-F07-T01', 'SR-F07-T02', 'SR-F07-T03'];
  // When nothing in the song records clearly matches, the visitor still gets three songs: these are
  // broad starting points whose verified meanings suit almost anyone (a clear head, an honest
  // check-in, feeling like yourself). They are framed as "A place to start", never as a match.
  var START_HERE = ['SR-F08-T03', 'SR-F07-T03', 'SR-F04-T06'];
  // Keyboard rows, to recognise mashed keys such as "asdf" or "qwer" as random characters.
  var ROWS = ['qwertyuiop', 'asdfghjkl', 'zxcvbnm'];
  var GENERIC_SLEEP = /\b((i )?(just |really |only )?(want|need|would like|would love|wanna) to (switch off|sleep|rest|relax|wind down|unwind|fall asleep|drift off|get some sleep)|help me (to )?(sleep|switch off|relax|wind down|unwind|fall asleep|drift off|rest)|something (to help me |for )?(sleep|sleeping|bed|bedtime)|(go to |get to |get some )?sleep\w*|asleep|bed(time)?|tonight|at night|insomnia|please|so tired|tired)\b/g;
  var CONF = { high: 1, 'medium-high': 0.97, medium: 0.94, 'low-medium': 0.9, low: 0.85 };
  // Channel weights. Lyrics/spoken-term bags are a light supporting signal only, so songs
  // without lyrics are not disadvantaged (no title-only penalty).
  var W = { S: 1.0, X: 1.0, M: 0.8, D: 0.7, F: 0.6, Mo: 0.45, I: 0.45, L: 0.25, T: 0.7 };

  // Near-duplicate pairs (data/meaning.json is the source; this mirrors it if that file is unavailable).
  var DEFAULT_PAIRS = { shay: { kind: 'version', prefer: 'darker' }, 'city-of-gold': { kind: 'version', prefer: 'alien' },
    bet: { kind: 'related', prefer: null }, progress: { kind: 'related', prefer: null } };
  function safeRequire(p) { try { return require(p); } catch (e) { return null; } }

  // extras (all optional): { affinities: data/affinities.json, pairs: meaning.json pairs, meaning: meaning module }
  function createEngine(data, exprData, extras) {
    var songs = data.songs;
    var EXPR = buildExpressions(exprData);
    var idx = songs.map(function (s) {
      var m = s.m;
      var ch = {
        S: [].concat(m.situations, m.patterns, m.questions).join(' ; '),
        X: m.expressions.join(' ; '),
        M: [m.meaning, m.intended].concat(m.themes).join(' ; '),
        D: m.desired.join(' ; '),
        Mo: m.moods.join(' ; '),
        I: m.intentions.join(' ; '),
        L: m.lyricTerms.concat(m.spokenTerms).join(' '),
        T: s.title,
        // formula-level state from the hub's own tiles ("DON'T FIT IN?") plus the formula name
        F: s.formula.name + ' ; ' + (s.formula.state || '')
      };
      var tok = {}, con = {};
      Object.keys(ch).forEach(function (k) {
        tok[k] = new Set(stems(ch[k]));
        con[k] = new Set(k === 'L' || k === 'T' ? [] : conceptsIn(ch[k]));
      });
      var phrases = [].concat(m.expressions, m.situations).map(function (p) {
        var st = Array.from(new Set(stems(p)));
        st.concepts = conceptsIn(p).filter(function (c) { return !CONTEXT.has(c); });
        return st;
      }).filter(function (p) { return p.length >= 1; });
      var notFor = (s.notFor || []).map(function (p) { return new RegExp('\\b' + normalise(p).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')); });
      var mult = (EVIDENCE[s.ev.situations] || 1) * (s.conf ? (CONF[s.conf] || 1) : 1);
      // concepts in the song's own meaning and circumstances (F06: without the formula-wide association)
      var ownCon = new Set(conceptsIn([m.meaning].concat(m.circ || []).join(' ; ')));
      return { song: s, tok: tok, con: con, phrases: phrases, notFor: notFor, mult: mult, ownCon: ownCon };
    });
    // inverse document frequencies over songs (any channel)
    var N = idx.length, dfT = {}, dfC = {};
    idx.forEach(function (e) {
      var seenT = new Set(), seenC = new Set();
      // formula-level text (F) is shared by every track of a formula, so it does not count
      // towards rarity; otherwise it would dilute the songs' own evidence
      Object.keys(e.tok).forEach(function (k) {
        if (k === 'F') return;
        e.tok[k].forEach(function (t) { seenT.add(t); }); e.con[k].forEach(function (c) { seenC.add(c); });
      });
      seenT.forEach(function (t) { dfT[t] = (dfT[t] || 0) + 1; });
      seenC.forEach(function (c) { dfC[c] = (dfC[c] || 0) + 1; });
    });
    function idfT(t) { return Math.log((N + 1) / ((dfT[t] || 0) + 1)) + 0.3; }
    function idfC(c) { return Math.log((N + 1) / ((dfC[c] || 0) + 1)) + 0.6; }
    // vocabulary for typo repair: words used by the song records and by TAB 05
    var VOCAB = new Set();
    songs.forEach(function (s) {
      var m = s.m;
      [].concat(m.situations, m.expressions, m.desired, m.moods, m.themes, m.patterns, m.intentions, [m.meaning, s.title])
        .forEach(function (t) { (normalise(t).match(/[a-z]+/g) || []).forEach(function (w) { VOCAB.add(w); }); });
    });
    EXPR.forEach(function (e) { e.words.forEach(function (w) { VOCAB.add(w); }); });
    var respell = makeSpeller(VOCAB);

    var SLEEP_WORDS = new Set(stems('sleep sleeping asleep bed bedtime night nights tonight awake lie lying rest insomnia'));
    function scoreSong(e, q) {
      var s = 0, why = { concepts: [], state: 0, tokens: 0, phrase: 0 };
      // When the visitor asks for sleep, sleep itself becomes a listening preference (E), so it
      // must not decide between sleep tracks; their specific subjects do.
      var sleepPref = q.pref.sleep === 1;
      var qt = Object.keys(q.tokens);
      // tokens: each query token counts once, in its best channel
      qt.forEach(function (t) {
        if (!dfT[t]) return;
        var best = 0;
        for (var k in W) if (k !== 'F' && e.tok[k].has(t) && W[k] > best) best = W[k];
        if (e.tok.F.has(t)) best += 0.35;
        if (sleepPref && SLEEP_WORDS.has(t)) best *= 0.12;
        if (best) { s += 0.55 * best * idfT(t) * q.tokens[t]; why.tokens++; }
      });
      // concepts: role-aware (A situation vs B desired state)
      why.own = 0; why.formulaOnly = [];
      Object.keys(q.concepts).forEach(function (c) {
        var qc = q.concepts[c], best = 0, bestK = null;
        for (var k in W) {
          if (k === 'L' || k === 'F' || !e.con[k].has(c)) continue;
          if (qc.inferred && k !== 'M') continue;
          var w = W[k];
          if (k === 'D') w = qc.role === 'desire' ? 1.35 : 0.6;
          if ((k === 'S' || k === 'X') && qc.role === 'desire' && POSITIVE.has(c)) w *= 0.75;
          if (w > best) { best = w; bestK = k; }
        }
        // only the formula's hub question carries this concept: a formula-level hint, not song evidence
        if (!best && e.con.F.has(c)) { if (!qc.context) why.formulaOnly.push(c); return; }
        if (best && !qc.context && !qc.inferred && (bestK === 'S' || bestK === 'X' || bestK === 'M' || (bestK === 'D' && qc.role === 'desire'))) why.own++;
        // the formula's own hub question ("SECOND-GUESSING?") adds a little on top
        if (e.con.F.has(c)) best += 0.35;
        if (sleepPref && c === 'sleep') { s += 0.15 * best * idfC(c); return; }
        if (best) { s += 1.25 * best * idfC(c) * qc.weight; why.concepts.push(c); if (!qc.context) why.state++; }
      });
      // phrase-level match against the song's own everyday expressions and situations
      var bestP = 0, secondP = 0;
      e.phrases.forEach(function (p) {
        var hit = 0, tot = 0, live = 0;
        p.forEach(function (t) {
          if (sleepPref && SLEEP_WORDS.has(t)) return;
          var w = idfT(t); tot += w; live++; if (q.tokens[t]) hit += w;
        });
        var f = tot ? hit / tot : 0;
        // a one-word phrase ("trapped", "hopeful") only counts when it carries a felt state the
        // visitor also expressed
        if (live === 1) {
          var shared = p.concepts.some(function (c) { return q.concepts[c] && !q.concepts[c].context; });
          f = shared ? f * 0.8 : 0;
        }
        if (f > bestP) { secondP = bestP; bestP = f; } else if (f > secondP) secondP = f;
      });
      var pb = (bestP >= 0.6 ? 6 * bestP * bestP : 1.5 * bestP * bestP) + (secondP >= 0.6 ? 2 * secondP * secondP : 0);
      s += pb; why.phrase = bestP;
      // breadth: several distinct concepts agreeing is stronger evidence than one
      if (why.concepts.length >= 2) s *= 1 + Math.min(0.3, 0.1 * (why.concepts.length - 1));
      // listening-experience preferences (E)
      var ex = e.song.experience || [];
      var pf = q.pref;
      if (pf.sleep === 1) s *= ex.indexOf('sleep') >= 0 ? 1.55 : 0.8;
      if (pf.sleep === -1 && ex.indexOf('sleep') >= 0) s *= 0.55;
      if (pf.instrumental === 1) s *= ex.indexOf('instrumental') >= 0 ? 1.6 : 0.75;
      if (pf.instrumental === -1 && ex.indexOf('instrumental') >= 0) s *= 0.6;
      if (pf.spoken === 1) s *= ex.indexOf('spoken') >= 0 ? 1.4 : 0.85;
      if (pf.spoken === -1 && ex.indexOf('spoken') >= 0) s *= 0.6;
      if (pf.energetic === 1) s *= ex.indexOf('energetic') >= 0 ? 1.45 : (ex.indexOf('sleep') >= 0 ? 0.6 : 0.95);
      if (pf.calm === 1 && ex.indexOf('calm') >= 0) s *= 1.15;
      return { score: s * e.mult, detail: why };
    }

    // Only empty or meaningless input (whitespace, punctuation, random characters) is turned away.
    // Unfamiliar but real words are accepted: low confidence never blocks a recommendation.
    function wordLike(w) {
      if (STOP.has(w) || dfT[stem(w)] || dfT[w]) return true;
      if (w.length === 1) return w === 'i' || w === 'a';
      if (!/[aeiouy]/.test(w)) return false;
      if (/([a-z])\1\1/.test(w)) return false;                  // aaa, kkkk
      if (/[bcdfghjklmnpqrstvwxz]{5,}/.test(w)) return false;     // long consonant runs
      if (w.length >= 3 && ROWS.some(function (r) { return r.indexOf(w) >= 0; })) return false;   // asdf, qwer, jkl
      return true;
    }
    function meaningful(raw) {
      if (/[^\u0000-\u024f\s\d\p{P}\p{S}]/u.test(raw) && /\p{L}/u.test(raw)) return true;   // other scripts
      if (Object.keys(conceptsIn(normalise(raw))).length) return true;
      return words(raw).some(wordLike);
    }

    /* ---------------------------------------------- meaning-aware selection (TAB 06)
     * After the song-specific evidence is scored (TAB 02 fields, TAB 05 phrasing), every candidate
     * gets a per-search strength class:
     *   1 direct            the song's own record matches what the visitor said
     *   2 contextual        a supported partial fit, or the listening experience they asked for
     *   3 formula affinity  a listening connection through the formula (TAB 06), not the song's story
     *   4 exploratory       an open place to start
     *   5 no defensible connection (or ruled out by a guardrail): never shown
     * Guardrails from TAB 06 (meaning.json / songs.json `rule`) and the visitor's listening
     * constraints are hard rules applied before ranking. */
    var M = (extras && extras.meaning) || (typeof module !== 'undefined' && module.exports ? safeRequire('./meaning.js') : root.SonicRemedyMeaning);
    var AFF = (extras && extras.affinities && extras.affinities.formulas) || null;
    var PAIRS = (extras && extras.pairs) || DEFAULT_PAIRS;
    var affConcepts = {};
    if (AFF) Object.keys(AFF).forEach(function (k) {
      var a = AFF[k];
      affConcepts[a.number] = conceptsIn([a.affinity, a.current, a.desired].join(' ; ')).filter(function (c) { return !CONTEXT.has(c) && c !== 'sleep'; });
    });

    function frameOf(raw, q) {
      if (!M) return null;
      var f = M.interpret(raw, { normalise: normalise, clauses: clauses });
      prune(q, f);
      return M.settle(f, q.concepts);
    }

    // Hard rules. Returns false when a song must not be shown for this input.
    function allowed(song, f, q, detail) {
      var ty = song.type, r = song.rule, p = f ? f.prefs : {};
      if (f) {
        if (p.noSpoken && ty === 'spoken-sleep') return false;
        if (p.noLyrics && ty === 'song') return false;
        if (p.noVocals && ty === 'instrumental-wordless') return false;
        if (p.notSleepy && ty === 'spoken-sleep') return false;
      }
      var has = function (k) { return !!(q.concepts[k] && q.concepts[k].weight > 0); };
      var role = f ? f.role : null;
      var sit = f ? f.situation : [];
      if (r === 'requires_caused_hurt' && !(role === 'caused' || (has('causedHurt') && role !== 'betrayed'))) return false;
      if (r === 'requires_blaming_others' && !(role === 'blaming' || (has('blameOthers') && role !== 'blamed' && role !== 'describing'))) return false;
      if (r === 'injustice_not_disengage' && sit.indexOf('injustice') >= 0 && f.want.indexOf('disengage') < 0 && !/\b(tired of|sick of|fed up)\b/.test(q.raw)) return false;
      if (r === 'grief_not_regret' && sit.indexOf('grief') >= 0 && !has('regret')) return false;
      if (r === 'isolation_not_grief' && (sit.indexOf('grief') >= 0 || has('sadness')) && !has('disconnected') && !has('sufferingAlone') && !has('trapped')) return false;
      // TAB 06 F03 boundary: "Grief does not automatically imply regret" — No Regret tracks are not offered for grief alone
      if (song.formula.number === 3 && sit.indexOf('grief') >= 0 && !has('regret') && song.id !== 'SR-F03-T07' && song.id !== 'SR-F03-T03') return false;
      if (r === 'not_generic_sleep' && f && f.polarity === 'positive') return false;   // TAB 06 T04: no invented need to progress
      // You Do You is about a relationship script; sadness or grief alone is not heartbreak (TAB 06 F03-T08)
      if (r === 'heartbreak_not_rejection' && sit.indexOf('heartbreak') < 0 && !has('love') && !/\b(relationship|romance|romantic|dating|self-love|be myself|true self|follow (my|your) heart)\b/.test(q.raw)) return false;
      if (r === 'not_generic_sleep' && detail && !detail.expr && detail.phrase < 0.6 && (detail.concepts || []).every(function (c) { return c === 'sleep' || c === 'calm'; })) return false;
      // agency (TAB 06 R08): the visitor who caused hurt is not told it is someone else's mess;
      // the person supporting someone (Be the Light) is not the person grieving
      if (song.id === 'SR-F01-T05' && role === 'caused') return false;
      // someone who says they blame others is not told the problem is the others' (Mirror Mirror fits; TAB 06 F01-T04)
      if ((song.id === 'SR-F01-T05' || song.id === 'SR-F02-T06') && role === 'blaming') return false;
      if (song.id === 'SR-F03-T07' && role !== 'supporting' && !has('supportOther')) return false;
      // a purely positive input is not turned into a problem to fix
      if (f && f.polarity === 'positive' && detail && !(detail.exprStrong)) {
        var pos = (detail.concepts || []).some(function (c) { return POSITIVE.has(c) || c === 'play' || c === 'gratitude'; });
        if (!pos && detail.phrase < 0.6 && !detail.prefCompanion) return false;
      }
      return true;
    }

    var F06_CORE = ['different', 'disconnected', 'heard', 'sufferingAlone'];
    function classOf(c) {
      var d = c.detail;
      if (c.fill) return 4;
      if (d.exprStrong || d.phrase >= 0.6 || (d.own >= 1 && c.score >= 6) || (d.own >= 2 && c.score >= 4.5)) return 1;
      if (d.own >= 1 || d.expr || d.prefCompanion || d.inferredFit) return 2;
      if (d.affinity) return 3;
      return 5;
    }

    var KIND = { 'spoken-sleep': 'a spoken bedtime contemplation about ', instrumental: 'an instrumental piece embodying ',
      'instrumental-wordless': 'an instrumental piece embodying ', song: '' };
    function aboutOf(song) { return (KIND[song.type] || '') + (song.about || song.m.meaning); }
    function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
    var TOPIC = { trapped: 'being boxed in', freedom: 'freedom', overwhelm: 'having too much going on', fog: 'things feeling unclear',
      clarity: 'clarity', uncertain: 'not knowing what comes next', controlLoss: 'things feeling out of control', selfDoubt: 'doubting yourself',
      approval: "other people's approval", procrastination: 'putting things off', creative: 'creating', perfection: 'perfection and mistakes',
      courage: 'taking a leap', lettingGo: 'letting go', burden: 'carrying weight and responsibility', notMine: "problems that aren't yours",
      boundaries: 'boundaries', blameOthers: 'blaming or judging others', blamed: 'being blamed', envy: 'comparison and envy', anger: 'anger',
      frustration: 'frustration', sleep: 'night-time and sleep', rumination: 'thoughts that keep going round', distraction: 'focus and distraction',
      hope: 'hope', defeat: 'feeling discouraged', strength: 'strength', depleted: 'exhaustion', disconnected: 'feeling disconnected',
      connection: 'connection and belonging', newStart: 'something new', hesitant: 'nerves and hesitation', readiness: 'being ready',
      celebration: 'joy and good news', different: 'feeling different or not fitting in', home: 'home and being far from it', heard: 'being heard',
      betrayed: 'being let down by someone you trusted', causedHurt: 'repairing hurt you caused', guilt: 'guilt', gratitude: 'gratitude',
      family: 'family', expectations: 'expectations and obligations', love: 'love', supportOther: 'supporting someone',
      selfWorth: 'being enough', regret: 'regret and time', direction: 'direction', routine: 'routine and sameness', stagnant: 'feeling stuck',
      honesty: 'honesty with yourself', potential: 'who you could become', advice: 'advice', patience: 'patience', calm: 'calm',
      complain: 'complaining', authentic: 'being yourself', improvise: 'control and going with the flow', meTime: 'time for yourself',
      together: 'getting through things together', discomfort: 'discomfort', sadness: 'sadness', work: 'work',
      sufferingAlone: 'struggling on your own', selfFirst: 'looking after yourself', complainingOthers: 'people who talk big',
      play: 'play', decision: 'a decision' };
    var WANT = { play: 'time to play', calm: 'some calm', sleep: 'rest', freedom: 'more freedom', clarity: 'more clarity', hope: 'more hope',
      strength: 'more strength', connection: 'more connection', readiness: 'to feel ready', courage: 'more courage', meTime: 'time for yourself',
      decision: 'to make a decision', lettingGo: 'to let go', newStart: 'something new', celebration: 'to celebrate' };
    var ROLE_TOPIC = { betrayed: 'someone breaking your trust', caused: 'repairing hurt you caused', blamed: 'being blamed',
      blaming: 'blaming or judging others', supporting: 'supporting someone' };

    function explain(c, cls, f, q, ctx) {
      var song = c.e.song, about = aboutOf(song), d = c.detail;
      if (ctx.sleepDefault) return 'You asked for something for sleep, so the Sleep Sequence starts at the beginning: ' + about + '.';
      if (cls === 4 && ctx.hasLead) return 'Another direction you could explore: ' + about + '.';
      if (cls === 4) {
        if (f && f.uncertainty === 'need') return "You said you're not sure what you need, so this is an open place to start: " + about + '.';
        if (f && f.metaphor) return "Your image could mean different things, so this is an open suggestion rather than a match: " + about + '.';
        return 'Nothing in the catalogue clearly matches your words, so this is an open place to start: ' + about + '.';
      }
      if (cls === 3 || d.confirmedAffinity) {
        var a = AFF && AFF[String(song.formula.number)];
        if (song.formula.number === 6 && a && a.status === 'artist-confirmed')
          return 'The artist made ' + song.formula.name + ' for listeners who feel different or outside the group; this track itself is about ' + about + '.';
        return 'A broader listening connection through ' + song.formula.name + '; this track itself is about ' + about + '.';
      }
      var desire = (d.concepts || []).filter(function (k) { return q.concepts[k] && q.concepts[k].role === 'desire' && !q.concepts[k].context; });
      var own = (d.concepts || []).filter(function (k) { return q.concepts[k] && !q.concepts[k].context && q.concepts[k].role !== 'desire'; })
        .sort(function (a, b) { return idfC(b) - idfC(a); });   // the most specific thing they said first
      var topic = null;
      if (f && f.role && ROLE_TOPIC[f.role] && (song.rule === 'requires_caused_hurt' || own.indexOf('betrayed') >= 0 || own.indexOf('blamed') >= 0 || own.indexOf('blameOthers') >= 0 || own.indexOf('supportOther') >= 0)) topic = ROLE_TOPIC[f.role];
      if (!topic && own.length) topic = (own[0] === 'sadness' && f && f.situation.indexOf('grief') >= 0) ? 'grief' :
        (own[0] === 'celebration' && q.concepts.celebration && q.concepts.celebration.inferred && f) ? (f.positive.indexOf('pride') >= 0 ? 'something you are proud of' : 'feeling good') : TOPIC[own[0]];
      var lead;
      if (f && f.uncertainty === 'need') lead = "You said you're not sure what you need";
      else if (d.prefCompanion === 'alien sounds') return 'You asked about alien sounds: this track is from ' + song.formula.name + ', and it is about ' + about + '.';
      else if (d.prefCompanion && cls === 2 && !own.length) lead = 'You asked for ' + d.prefCompanion;
      else if (topic) lead = 'You mentioned ' + topic;
      else if (desire.length && q.concepts[desire[0]].fromNeg && TOPIC[desire[0]]) lead = 'You mentioned ' + TOPIC[desire[0]];   // "not hopeful": a need we infer, not a stated want
      else if (desire.length && (WANT[desire[0]] || TOPIC[desire[0]])) lead = "You said you'd like " + (WANT[desire[0]] || TOPIC[desire[0]]);
      else if (d.exprPhrase) lead = (d.exprExact ? 'You said "' : 'Your words are close to "') + d.exprPhrase + '"';
      else if (d.prefCompanion) lead = 'You asked for ' + d.prefCompanion;
      else lead = 'Your words connect with this record';
      var tail = cls === 1 ? '; this song is about ' : '; a related connection rather than an exact match: ';
      if (song.type !== 'song') tail = cls === 1 ? '; this is ' : '; a related connection rather than an exact match: ';
      return lead + tail + about + '.';
    }

    // Who did what to whom decides which reading of a shared word stands (TAB 06 R08).
    function prune(q, f) {
      var del = function (k) { delete q.concepts[k]; };
      if (f.situation.indexOf('grief') >= 0 && f.role !== 'supporting') del('supportOther');
      if (f.role === 'betrayed') del('causedHurt');
      if (f.role === 'caused') del('betrayed');
      if (f.role === 'blamed') del('blameOthers');
      if (f.role === 'describing') { del('blameOthers'); del('blamed'); }
      // "curious about alien sounds" asks for a sound, not a feeling of alienation (TAB 06 T13)
      if (f.prefs.alien && !/\b(i (feel|am|always feel|felt) (so |really )?(different|alien|out of place|like an outsider)|(do not|never) (fit|belong))\b/.test(q.raw)) del('different');
      // a stated positive state ("proud", "over the moon") is read as something to celebrate: inferred, and labelled so
      if (f.positive.length && !q.concepts.celebration) {
        q.concepts.celebration = { weight: 0.8, role: 'situation', context: false, inferred: true };
        f.inferred.push({ key: 'celebration', from: f.positive.join(','), note: 'a positive state read as something to celebrate' });
      }
    }

    function recommend(text, opts) {
      opts = opts || {};
      var raw = String(text || '').trim();
      if (!raw || !meaningful(raw)) return { status: 'empty', results: [], query: parseQuery(raw) };
      raw = respell(raw);
      var q = parseQuery(raw);
      var f = frameOf(raw, q);
      var noSleepDefault = f && (f.prefs.noSpoken || f.prefs.notSleepy);
      if (f && f.prefs.notSleepy) q.pref.sleep = -1;
      if (q.pref.sleep === 1 && !noSleepDefault) {
        var rest = parseQuery(normalise(raw).replace(GENERIC_SLEEP, ' '));
        var topical = Object.keys(rest.concepts).filter(function (c) { return !rest.concepts[c].context && c !== 'calm' && c !== 'sleep'; });
        if (!topical.length && rest.n <= 1) {
          return { status: 'ok', sleepDefault: true, query: q, frame: f, results: SLEEP_DEFAULT.map(function (id) {
            var song = byIdFn(id);
            return song && { song: song, score: 0, cls: 2, basis: 'sleep default (user decision 2026-10-18)',
              explanation: explain({ e: { song: song }, detail: {} }, 2, f, q, { sleepDefault: true }),
              detail: { concepts: ['sleep'], state: 1, tokens: 0, phrase: 0 } };
          }).filter(Boolean) };
        }
      }
      // TAB 05 expression hits: a boost for each linked song, strongest link first
      var hits = matchExpressions(EXPR, raw), boost = {}, strongFor = {}, phraseFor = {}, exprLowOnly = true;
      hits.forEach(function (h) {
        if (!h.e.low) exprLowOnly = false;
        h.e.songs.forEach(function (id, i) {
          var b = 9 * h.strength * EXPR_RANK[Math.min(i, EXPR_RANK.length - 1)];
          boost[id] = boost[id] ? boost[id] + 0.6 * b : b;
          if (!h.e.low && i < 3) strongFor[id] = true;
          if (!phraseFor[id]) phraseFor[id] = { p: h.e.words.join(' '), exact: h.exact };
        });
      });
      // formula affinity (TAB 06): concepts the visitor stated that the formula's affinity names
      var stated = Object.keys(q.concepts).filter(function (c) { return !q.concepts[c].context && q.concepts[c].weight > 0; });
      var affScore = {};
      Object.keys(affConcepts).forEach(function (n) {
        var shared = affConcepts[n].filter(function (c) { return stated.indexOf(c) >= 0; });
        if (shared.length) affScore[n] = shared.length * (AFF[String(n)].status === 'artist-confirmed' ? 1 : 0.8);
      });
      var prefKeys = [];
      if (f && (f.prefs.noLyrics || f.prefs.noSpoken)) prefKeys.push('instrumental');
      var alienIds = f && f.prefs.alien ? idx.filter(function (x) { return x.song.formula.number === 6 || x.song.id === 'SR-F05-T05'; }).map(function (x) { return x.song.id; }) : [];
      var prefLabel = f && /\bspoken\b/.test(q.raw) && f.prefs.noSpoken ? 'something without spoken words' : f && f.prefs.noLyrics ? 'something without words' : f && f.prefs.noSpoken ? 'something without spoken words' : null;
      var cands = [];
      idx.forEach(function (e) {
        for (var i = 0; i < e.notFor.length; i++) if (e.notFor[i].test(q.raw)) return;   // e.g. Rebuild Trust for betrayal wording
        var r = scoreSong(e, q);
        var b = boost[e.song.id] || 0;
        if (b) { r.detail.base = { score: r.score, state: r.detail.state }; r.detail.expr = +b.toFixed(2); r.detail.state++; r.score += b * e.mult; }
        if (strongFor[e.song.id]) r.detail.exprStrong = true;
        if (phraseFor[e.song.id]) { r.detail.exprPhrase = phraseFor[e.song.id].p; r.detail.exprExact = phraseFor[e.song.id].exact; }
        var ex = e.song.experience || [];
        if (prefKeys.some(function (k) { return ex.indexOf(k) >= 0; }) && prefLabel) { r.detail.prefCompanion = prefLabel; r.score += 3; }
        if (alienIds.indexOf(e.song.id) >= 0) { r.detail.prefCompanion = 'alien sounds'; r.score += 3; }
        var a = affScore[e.song.formula.number];
        if (a) { r.detail.affinity = a; if (r.detail.own) r.score *= Math.min(1.2, 1 + 0.1 * a); }   // song evidence + formula affinity agree (R03)
        if (q.concepts.celebration && q.concepts.celebration.inferred && (r.detail.concepts || []).indexOf('celebration') >= 0) {
          r.detail.inferredFit = true;
          if (ex.indexOf('energetic') >= 0) r.score += 0.5;   // celebratory tracks first for a stated good mood
        }
        if (!allowed(e.song, f, q, r.detail)) return;
        var c = { e: e, score: r.score, detail: r.detail };
        c.cls = classOf(c);
        // F06 Alien Frequencies: the artist-confirmed affinity (feeling different, isolated, not fitting in) is a
        // formula-level listening connection. Unless the visitor's words meet this track's own meaning, it is
        // offered through that affinity (class 2: supported by the artist), never as the song's own story.
        if (e.song.rule === 'f06_affinity_only' && c.cls <= 2 && !r.detail.prefCompanion) {
          var mine = (r.detail.concepts || []).some(function (k) { return e.ownCon.has(k) && !q.concepts[k].context && F06_CORE.indexOf(k) < 0; });
          var core = stated.some(function (k) { return F06_CORE.indexOf(k) >= 0; });
          if (!mine && core) { c.cls = 1; r.detail.confirmedAffinity = true; }   // artist-confirmed entry point for a stated experience
          else if (!mine) c.cls = Math.max(c.cls, 3);
        }
        if (e.song.rule === 'heartbreak_not_rejection' && c.cls === 1 && !/\b(romance|romantic|fairy ?tale|the one|soulmate|love story|same relationship|pattern)\b/.test(q.raw)) c.cls = 2;
        if (c.cls === 3) c.score = a * 3 + r.score * 0.2;
        if (c.cls <= 4 && (r.score > 0 || c.cls === 3)) cands.push(c);
      });
      cands.sort(function (a, b) {
        return a.cls - b.cls || b.score - a.score || b.detail.phrase - a.detail.phrase || b.e.mult - a.e.mult || (a.e.song.id < b.e.song.id ? -1 : 1);
      });
      // optional re-rank hook (not wired in the site): may only reorder already-allowed candidates
      if (typeof opts.rerank === 'function') {
        var re = opts.rerank(cands.map(function (c) { return { id: c.e.song.id, cls: c.cls, score: c.score }; }), f);
        if (Array.isArray(re)) {
          var pos = {}; re.forEach(function (id, i) { pos[id] = i; });
          cands.sort(function (a, b) { return a.cls - b.cls || ((pos[a.e.song.id] == null ? 1e9 : pos[a.e.song.id]) - (pos[b.e.song.id] == null ? 1e9 : pos[b.e.song.id])); });
        }
      }
      // weak class-2 leads: a very low score or only low-confidence TAB 05 rows are not a match
      cands = cands.filter(function (c, i) { return !(c.cls === 2 && c.score < 1.2 && !c.detail.prefCompanion); });
      var top = cands.length ? cands[0].score : 0;
      // one lead + two meaningfully distinct alternatives
      var picked = [], deferred = [];
      function pairBlocked(c) {
        var g = c.e.song.group, p = g && PAIRS[g];
        if (!p) return false;
        var other = picked.some(function (x) { return x.e.song.group === g; });
        if (!other) return false;
        if (p.kind === 'version') return !(f && p.prefer && f.prefs[p.prefer]);
        return cands.some(function (o) { return picked.indexOf(o) < 0 && o !== c && o.e.song.group !== g && o.cls <= c.cls; });
      }
      for (var i = 0; i < cands.length && picked.length < 3; i++) {
        var c = cands[i];
        if (picked.length && c.cls === picked[0].cls && c.cls <= 2 && c.score < top * 0.3) continue;
        if (pairBlocked(c)) continue;
        var same = picked.filter(function (x) { return x.e.song.formula.number === c.e.song.formula.number; }).length;
        if (same) {
          var alt = cands.some(function (o) { return picked.indexOf(o) < 0 && o !== c && o.e.song.formula.number !== c.e.song.formula.number && o.cls <= c.cls && !pairBlocked(o); });
          var bestAlt = cands.filter(function (o) { return picked.indexOf(o) < 0 && o !== c && o.e.song.formula.number !== c.e.song.formula.number && o.cls <= c.cls && !pairBlocked(o); })[0];
          var clearlyBetter = same < 2 && bestAlt && c.cls === bestAlt.cls && c.score >= 1.25 * bestAlt.score;
          if (alt && !clearlyBetter && (same >= 2 || c.cls >= picked[0].cls)) { deferred.push(c); continue; }
        }
        picked.push(c);
      }
      for (var j = 0; j < deferred.length && picked.length < 3; j++) if (!pairBlocked(deferred[j]) && picked.indexOf(deferred[j]) < 0) picked.push(deferred[j]);
      // When the visitor said two different things ("the world is unfair and I'm tired of thinking
      // about it"), each TAB 05 expression they used keeps its strongest allowed song in the set.
      if (hits.length > 1 && picked.length) {
        var need = function (p) { return hits.some(function (h) { return h.e.songs.indexOf(p.e.song.id) >= 0 && picked.filter(function (x) { return h.e.songs.indexOf(x.e.song.id) >= 0; }).length === 1; }); };
        hits.slice().sort(function (x, y) { return y.strength - x.strength; }).forEach(function (h) {
          if (picked.some(function (p) { return h.e.songs.indexOf(p.e.song.id) >= 0; })) return;
          var cand = cands.filter(function (o) { return h.e.songs.indexOf(o.e.song.id) >= 0 && picked.indexOf(o) < 0 && !pairBlocked(o); })[0];
          if (!cand) return;
          if (picked.length < 3) { picked.push(cand); return; }
          for (var r = picked.length - 1; r > 0; r--) if (!need(picked[r])) { picked[r] = cand; break; }
        });
      }
      // exploratory starting points last, respecting the visitor's constraints and the guardrails
      if (picked.length < 3) {
        var starts = START_HERE.concat(['SR-F08-T02', 'SR-F08-T01', 'SR-F08-T06', 'SR-F08-T05']);
        for (var s = 0; s < starts.length && picked.length < 3; s++) {
          var id = starts[s];
          if (picked.some(function (p) { return p.e.song.id === id; })) continue;
          var e = idx.filter(function (x) { return x.song.id === id; })[0];
          var det = { concepts: [], state: 0, tokens: 0, phrase: 0 };
          if (!e || !allowed(e.song, f, q, null)) continue;
          picked.push({ e: e, score: 0, fill: 'start', cls: 4, detail: det });
        }
      }
      var lead = picked[0];
      var status = !lead || lead.cls >= 4 ? 'fallback' : lead.cls === 3 ? 'weak' : 'ok';
      if (status === 'ok' && lead.cls === 2 && picked.filter(function (p) { return !p.fill; }).length < 2) status = 'weak';
      if (lead && lead.cls === 2 && !lead.detail.prefCompanion && (lead.score < 4 || (exprLowOnly && lead.detail.expr && !lead.detail.own))) status = 'weak';
      if (status === 'ok' && f && (f.uncertainty === 'need' || (f.metaphor && !stated.length && !hits.length))) status = 'weak';
      if (status === 'ok' && words(raw).length <= 2 && !(lead.detail.phrase >= 0.75 || lead.detail.exprStrong)) status = 'weak';
      var results = picked.map(function (p) {
        var o = { song: p.e.song, score: p.score, detail: p.detail, cls: p.cls,
          basis: p.fill ? 'exploratory start' : p.cls === 3 ? 'formula affinity (' + (AFF ? AFF[String(p.e.song.formula.number)].status : '?') + ')' :
            [p.detail.exprStrong ? 'TAB 05 phrase' : p.detail.expr ? 'TAB 05 phrase (low)' : null, p.detail.phrase >= 0.6 ? 'TAB 02 phrase' : null,
              p.detail.own ? 'TAB 02 record' : null, p.detail.prefCompanion ? 'listening preference' : null].filter(Boolean).join(' + ') || 'TAB 02 related field',
          explanation: explain(p, p.cls, f, q, { hasLead: picked[0].cls < 4 }) };
        if (p.fill) o.fill = p.fill;
        return o;
      });
      return {
        debug: opts.debug ? cands.slice(0, 10).map(function (x) { return [x.e.song.id, x.e.song.title, x.cls, +x.score.toFixed(2), JSON.stringify(x.detail)]; }) : undefined,
        status: status,
        results: results,
        expressions: hits.map(function (h) { return h.e.id; }),
        query: q,
        frame: f
      };
    }

    function byIdFn(id) {
      for (var i = 0; i < songs.length; i++) if (songs[i].id === id) return songs[i];
      return null;
    }
    return { recommend: recommend, parseQuery: parseQuery, byId: byIdFn };
  }

  var api = { createEngine: createEngine, normalise: normalise, stems: stems, conceptsIn: conceptsIn };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
  root.SonicRemedyDiscovery = api;

  /* -------------------------------------------------------------------- UI */
  var KEY = 'sonicRemedy.discovery.v1';
  var section = document.getElementById('discovery');
  if (!section) return;
  var form = section.querySelector('.discovery-form');
  var textarea = section.querySelector('#discovery-text');
  var submit = section.querySelector('.discovery-submit');
  var hint = section.querySelector('.discovery-hint');
  var inputView = section.querySelector('[data-view="input"]');
  var resultsView = section.querySelector('[data-view="results"]');
  var resultsTitle = section.querySelector('#discovery-results-title');
  var note = section.querySelector('.discovery-note');
  var primarySlot = section.querySelector('.remedy-primary-slot');
  var alsoWrap = section.querySelector('.remedy-also');
  var alsoList = section.querySelector('.remedy-also-list');
  var reset = section.querySelector('.discovery-reset');
  var engine = null, loading = null;

  section.hidden = false;

  function load() {
    if (engine) return Promise.resolve(engine);
    if (!loading) {
      // the expression library (TAB 05) is optional: if it cannot load, matching still works
      // TAB 05 expressions and the TAB 06 affinity / pair data are optional: if they cannot load,
      // matching still works without them (guardrail rules travel inside songs.json)
      var opt = function (u) { return fetch(u, { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; }); };
      var lib = Promise.all([opt('data/expressions.json'), opt('data/affinities.json'), opt('data/meaning.json')]);
      loading = fetch('data/songs.json', { credentials: 'same-origin' })
        .then(function (r) { if (!r.ok) throw new Error('data ' + r.status); return r.json(); })
        .then(function (d) { return lib.then(function (x) {
          engine = createEngine(d, x[0], { affinities: x[1], pairs: x[2] && x[2].pairs, meaning: root.SonicRemedyMeaning || null });
          return engine;
        }); });
      loading.catch(function () { loading = null; });
    }
    return loading;
  }

  function read() { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function write(v) { try { if (v) sessionStorage.setItem(KEY, JSON.stringify(v)); else sessionStorage.removeItem(KEY); } catch (e) { /* storage unavailable */ } }

  // The button is never truly disabled: when the box is empty it is dimmed (aria-disabled) but a
  // press still explains what is needed, so it never looks actionable while silently doing nothing.
  var busy = false;
  var PROMPT = 'Say a little more: what is happening, or how you would like to feel.';
  function syncButton() { submit.setAttribute('aria-disabled', textarea.value.trim() ? 'false' : 'true'); }
  function say(msg) {
    // clear first so a repeated message is announced again and visibly refreshed
    hint.textContent = '';
    setTimeout(function () { hint.textContent = msg; }, 60);
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function cover(song, size) {
    var img = el('img', 'remedy-cover');
    img.src = song.cover; img.alt = song.title + ' cover artwork';
    img.width = size; img.height = size; img.loading = 'lazy'; img.decoding = 'async';
    return img;
  }
  function formulaName(song) { return song.formula.name; }
  // Recommendations open in a new tab so the results stay on the hub (user decision 2026-10-18).
  function link(a, song) {
    a.href = song.url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.setAttribute('aria-label', 'Listen to ' + song.title + ', ' + formulaName(song) +
      (song.urlType === 'formula' ? ', on the ' + formulaName(song) + ' formula page' : '') + ' (opens in a new tab)');
    var hint = el('span', 'discovery-label', '(opens in a new tab)');
    a.appendChild(hint);
  }

  // The line under each title explains this search's connection (per-search explanation); the
  // fixed description is only used if no explanation exists (e.g. a stored session from before).
  function renderPrimary(song, why) {
    var a = el('a', 'remedy-primary');
    link(a, song);
    var fig = el('div', 'remedy-primary-art'); fig.appendChild(cover(song, 600));
    var body = el('div', 'remedy-primary-body');
    body.appendChild(el('p', 'remedy-label', '01 / FIRST LISTEN'));
    body.appendChild(el('h3', 'remedy-title', song.title));
    body.appendChild(el('p', 'remedy-formula', formulaName(song)));
    body.appendChild(el('p', 'remedy-why', why || song.why));
    var l = el('span', 'remedy-listen'); l.innerHTML = 'LISTEN <span aria-hidden="true">↗</span>';
    body.appendChild(l);
    a.appendChild(fig); a.appendChild(body);
    return a;
  }
  function renderCard(song, why) {
    var li = el('li');
    var a = el('a', 'remedy-card');
    link(a, song);
    var art = el('div', 'remedy-card-art'); art.appendChild(cover(song, 600));
    var body = el('div', 'remedy-card-body');
    body.appendChild(el('h4', 'remedy-card-title', song.title));
    body.appendChild(el('p', 'remedy-formula', formulaName(song)));
    body.appendChild(el('p', 'remedy-card-why', why || song.why));
    var arrow = el('span', 'remedy-arrow', '↗'); arrow.setAttribute('aria-hidden', 'true');
    a.appendChild(art); a.appendChild(body); a.appendChild(arrow);
    li.appendChild(a);
    return li;
  }

  function showResults(state, focus) {
    var songs = state.ids.map(function (id) { return engine.byId(id); }).filter(Boolean);
    if (!songs.length) return showInput();
    primarySlot.innerHTML = '';
    alsoList.innerHTML = '';
    var why = state.why || [];
    primarySlot.appendChild(renderPrimary(songs[0], why[0]));
    songs.slice(1).forEach(function (s, i) { alsoList.appendChild(renderCard(s, why[i + 1])); });
    alsoWrap.hidden = songs.length < 2;
    note.hidden = state.status !== 'weak' && state.status !== 'fallback';
    inputView.hidden = true;
    resultsView.hidden = false;
    section.setAttribute('data-state', 'results');
    section.setAttribute('aria-labelledby', 'discovery-results-title');
    if (focus) {
      resultsTitle.focus({ preventScroll: true });
      var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      section.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    }
  }
  function showInput(focus) {
    resultsView.hidden = true;
    inputView.hidden = false;
    section.setAttribute('data-state', 'input');
    section.setAttribute('aria-labelledby', 'discovery-title');
    syncButton();
    if (focus) textarea.focus();
  }

  function run() {
    if (busy) return;
    var text = textarea.value.trim();
    syncButton();
    if (!text) { say(PROMPT); textarea.focus(); return; }
    hint.textContent = '';
    busy = true;
    form.setAttribute('aria-busy', 'true');
    load().then(function (eng) {
      var r = eng.recommend(text);
      if (r.status === 'empty' || !r.results.length) {
        say(PROMPT);
        write({ text: textarea.value, ids: [] });
        textarea.focus();
        return;
      }
      var state = { text: textarea.value, ids: r.results.map(function (x) { return x.song.id; }), status: r.status,
        why: r.results.map(function (x) { return x.explanation || ''; }) };
      write(state);
      showResults(state, true);
    }).catch(function () {
      say('Discovery is unavailable right now. Please try again in a moment.');
    }).then(function () {
      busy = false;
      form.removeAttribute('aria-busy');
    });
  }

  function restore() {
    var st = read();
    if (!st) { syncButton(); return; }
    if (typeof st.text === 'string' && textarea.value !== st.text) textarea.value = st.text;
    syncButton();
    if (st.ids && st.ids.length) {
      load().then(function (eng) {
        // a session stored before per-search explanations: rebuild them from the same text
        if (!st.why && typeof st.text === 'string') {
          var r = eng.recommend(st.text);
          if (r.results.map(function (x) { return x.song.id; }).join() === st.ids.join()) st.why = r.results.map(function (x) { return x.explanation || ''; });
        }
        showResults(st, false);
      }).catch(function () { showInput(); });
    } else {
      showInput();
    }
  }

  textarea.addEventListener('input', function () {
    syncButton();
    if (hint.textContent) hint.textContent = '';
    var st = read() || {};
    if (!st.ids || !st.ids.length) write(textarea.value ? { text: textarea.value, ids: [] } : null);
  });
  textarea.addEventListener('keydown', function (ev) {
    // Enter adds a new line (multiline); Ctrl/Cmd+Enter submits.
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); run(); }
  });
  form.addEventListener('submit', function (ev) { ev.preventDefault(); run(); });
  reset.addEventListener('click', function () {
    write(null);
    textarea.value = '';
    hint.textContent = '';
    primarySlot.innerHTML = ''; alsoList.innerHTML = '';
    showInput(true);
    section.scrollIntoView({ block: 'start' });
  });
  window.addEventListener('pageshow', function (ev) { if (ev.persisted) restore(); });
  restore();
  // warm the data so the first search is instant
  if ('requestIdleCallback' in window) requestIdleCallback(function () { load().catch(function () {}); });
  else setTimeout(function () { load().catch(function () {}); }, 1200);
})(typeof window !== 'undefined' ? window : this);
