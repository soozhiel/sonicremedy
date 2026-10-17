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
    strength: /\b(strong|strength|powerless|weak|weakness|vulnerab\w*|depleted|fragile|resilien\w*|power(ful)?|capable|helpless)\b/,
    depleted: /\b(exhaust\w*|drained|burnout|depleted|worn out|no energy|running on empty|tired all the time|fatigu\w*)\b/,
    disconnected: /\b(disconnect\w*|lonely|loneliness|alone|isolat\w*|separat\w*|fragment\w*|torn( apart)?|cut off|numb|out of touch|lost touch|lost connection|do not feel like myself|not myself)\b/,
    connection: /\b(connect\w*|reconnect\w*|whole|wholeness|unity|oneness|belong\w*|source|grounded)\b/,
    newStart: /\b(new (beginning|start|chapter|job|role|city|country|relationship|project|thing|venture|business|path|direction)|fresh start|start(ing)? over|something new|starting out|about to (start|begin|launch|move)|launch\w*|threshold|next chapter|next step|first step|begin\w*)\b/,
    hesitant: /\b(hesita\w*|nervous|cold feet|scared|afraid|fear\w*|scar(e|es|ed|y)|frighten\w*|anxious|anxiety|worried|worry|holding (myself )?back|hold (myself )?back|not ready|reluctan\w*|second thoughts)\b/,
    readiness: /\b(ready|readiness|prepared|set to go|willing)\b/,
    celebration: /\b(celebrat\w*|excit\w*|joy\w*|party|dance|dancing|thrill\w*|happy|happiness|good news|win|won|achiev\w*|glitter\w*|buzz\w*|elated|delight\w*|passion\w*|fun)\b/,
    different: /\b((feel|am|being|so|too|always been|always felt|feeling) different|different from (everyone|others|other people|the rest)|living differently|see things differently|do not fit|never fit|not fit|fit in|do not belong|never belong|fitting in|weird|outsider|misfit|odd one out|strange|alien|nobody gets me|no one gets me|not like (other|everyone)|stand out|unusual|out of place)\b/,
    home: /\b(home\w*|homesick\w*|miss home|far away|abroad|moved (away|overseas|countries)|another country|expat|where i (come|came) from)\b/,
    heard: /\b(heard|unheard|listen\w*|ignored|no one listens|nobody listens|voice|understood|misunderstood)\b/,
    betrayed: /\b(betray\w*|cheated on|lied to me|lie(d)? about me|stabbed in the back|backstab\w*|can not trust (anyone|people|them)|trust issues|they hurt me|someone hurt me|was hurt by)\b/,
    causedHurt: /\b(i hurt (someone|him|her|them|my)|i messed up|my fault|i broke (their|his|her) trust|make it right|apologi[sz]\w*|win back|earn (back )?(their|his|her) trust|regret what i did|i let (them|him|her) down|i cheated|i lied)\b/,
    guilt: /\b(guilt\w*|undeserv\w*|do not deserve|ashamed|shame\w*|unworthy)\b/,
    gratitude: /\b(grateful|gratitude|thankful|thanks|thank you|appreciat\w*|take (it|things|everything) for granted|blessed)\b/,
    family: /\b(parent\w*|mum|mom|mother|dad|father|family|raised|upbringing|childhood|grew up|carers?|siblings?)\b/,
    expectations: /\b(expectation\w*|supposed to|should|pressure\w*|obligat\w*|owe|debt|duty|guilt trip\w*|demands?)\b/,
    love: /\b(love|loving|relationship\w*|partner|romance|romantic|boyfriend|girlfriend|husband|wife|dating|marriage)\b/,
    supportOther: /\b(support (someone|my|a friend|them|him|her)|be there for|someone i love|loved one|friend is struggling|help (a friend|my friend|them|him|her) through|under pressure)\b/,
    selfWorth: /\b(enough|worth\w*|not enough|inadequate|less than)\b/,
    regret: /\b(regret\w*|life is short|wast(e|ing) (my )?time|wast(e|ing) my life|tomorrow|running out of time|legacy|before it is too late|no regrets)\b/,
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
    sadness: /\b(sad|sadness|low|down|blue|heartbroken|grief|griev\w*|cry\w*|tears)\b/,
    work: /\b(work|job|boss|colleague\w*|office|workplace|manager|coworker\w*|career)\b/,
    sufferingAlone: /\b(suffer\w*|struggl\w* alone|no one to (help|turn to)|dark place|nobody cares|on my own)\b/,
    selfFirst: /\b(look after myself|take care of myself|self-care|put myself first|my own needs|neglect\w* myself)\b/,
    complainingOthers: /\b(drift into my lane|others stall|talk big|all talk)\b/
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
          var role = c.forced || (desire ? 'desire' : 'situation');
          var w = c.weight;
          if (negHere && !fear && !desire) {
            // "not hopeful", "no clarity": a missing positive state is a felt need.
            if (POSITIVE.has(k)) role = 'desire';
            else if (DROP_ON_NEG.has(k)) { w = 0; stems(m[0]).forEach(function (x) { dropped.add(x); }); } // "not angry": drop it
          } else {
            stems(m[0]).forEach(function (x) { kept.add(x); });
          }
          if (fear) role = 'situation';
          if (CONTEXT.has(k)) w *= 0.45;
          if (w <= 0) continue;
          var prev = q.concepts[k];
          if (!prev || prev.weight < w) q.concepts[k] = { weight: w, role: role, context: CONTEXT.has(k) };
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

  /* ---------------------------------------------------------------- engine */
  var EVIDENCE = { 'artist-confirmed': 1, 'artist-script': 1, 'source-supported': 1, 'artist-confirmed+ai-inferred': 1, 'ai-inferred': 0.95 };
  // A sleep request with no particular subject ("help me sleep", "I just want to switch off and
  // sleep") starts at the beginning of the Sleep Sequence: Episodes 1, 2, 3 (user decision 2026-10-18).
  var SLEEP_DEFAULT = ['SR-F07-T01', 'SR-F07-T02', 'SR-F07-T03'];
  var GENERIC_SLEEP = /\b((i )?(just |really |only )?(want|need|would like|would love|wanna) to (switch off|sleep|rest|relax|wind down|unwind|fall asleep|drift off|get some sleep)|help me (to )?(sleep|switch off|relax|wind down|unwind|fall asleep|drift off|rest)|something (to help me |for )?(sleep|sleeping|bed|bedtime)|(go to |get to |get some )?sleep\w*|asleep|bed(time)?|tonight|at night|insomnia|please|so tired|tired)\b/g;
  var CONF = { high: 1, 'medium-high': 0.97, medium: 0.94, 'low-medium': 0.9, low: 0.85 };
  // Channel weights. Lyrics/spoken-term bags are a light supporting signal only, so songs
  // without lyrics are not disadvantaged (no title-only penalty).
  var W = { S: 1.0, X: 1.0, M: 0.8, D: 0.7, F: 0.6, Mo: 0.45, I: 0.45, L: 0.25, T: 0.7 };

  function createEngine(data) {
    var songs = data.songs;
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
      return { song: s, tok: tok, con: con, phrases: phrases, notFor: notFor, mult: mult };
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
      Object.keys(q.concepts).forEach(function (c) {
        var qc = q.concepts[c], best = 0;
        for (var k in W) {
          if (k === 'L' || k === 'F' || !e.con[k].has(c)) continue;
          var w = W[k];
          if (k === 'D') w = qc.role === 'desire' ? 1.35 : 0.6;
          if ((k === 'S' || k === 'X') && qc.role === 'desire' && POSITIVE.has(c)) w *= 0.75;
          if (w > best) best = w;
        }
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

    function recommend(text, opts) {
      opts = opts || {};
      var raw = String(text || '').trim();
      var q = parseQuery(raw);
      var nConcepts = Object.keys(q.concepts).length;
      if (!raw || (q.n === 0 && nConcepts === 0)) return { status: 'empty', results: [], query: q };
      if (q.pref.sleep === 1) {
        var rest = parseQuery(normalise(raw).replace(GENERIC_SLEEP, ' '));
        var topical = Object.keys(rest.concepts).filter(function (c) { return !rest.concepts[c].context && c !== 'calm' && c !== 'sleep'; });
        if (!topical.length && rest.n <= 1) {
          return { status: 'ok', sleepDefault: true, query: q, results: SLEEP_DEFAULT.map(function (id) {
            return { song: byIdFn(id), score: 0, detail: { concepts: ['sleep'], state: 1, tokens: 0, phrase: 0 } };
          }).filter(function (r) { return r.song; }) };
        }
      }
      var scored = [];
      idx.forEach(function (e) {
        for (var i = 0; i < e.notFor.length; i++) if (e.notFor[i].test(q.raw)) return;
        var r = scoreSong(e, q);
        if (r.score > 0) scored.push({ e: e, score: r.score, detail: r.detail });
      });
      scored.sort(function (a, b) {
        return b.score - a.score || b.detail.phrase - a.detail.phrase || b.e.mult - a.e.mult || (a.e.song.id < b.e.song.id ? -1 : 1);
      });
      var top = scored.length ? scored[0].score : 0;
      var lead = scored[0] ? scored[0].detail : { state: 0, phrase: 0 };
      // confidence gate: never present weak overlaps as a match
      var status = 'ok';
      if (top < 4 || (lead.state === 0 && lead.phrase < 0.6)) status = 'weak';
      if (top < 2 || (lead.state === 0 && lead.phrase < 0.6 && top < 6)) status = 'none';
      // one or two words: only answer when the word clearly names a felt state in a song's record
      if (words(raw).length <= 2) status = (lead.phrase >= 0.75 || (lead.state >= 1 && top >= 5)) ? 'weak' : 'none';
      if (status === 'none') return { status: 'none', results: [], query: q };
      // pick three: relevance first; skip a near-duplicate when a similarly relevant alternative exists
      var picked = [], groups = {};
      for (var i = 0; i < scored.length && picked.length < 3; i++) {
        var c = scored[i], g = c.e.song.group;
        if (c.score < top * 0.3) break;
        if (picked.length && c.detail.state === 0 && c.detail.phrase < 0.6) continue;
        if (g && groups[g]) {
          var alt = scored.slice(i + 1).some(function (o) {
            return o.score >= c.score * 0.5 && !(o.e.song.group && groups[o.e.song.group]);
          });
          if (alt) continue;
        }
        picked.push(c);
        if (g) groups[g] = true;
      }
      // If the visitor named a listening preference (e.g. sleep), other tracks made for that
      // experience are honest companions even without a topical overlap.
      var prefKeys = Object.keys(q.pref).filter(function (k) { return q.pref[k] === 1; });
      if (picked.length && picked.length < 3 && prefKeys.length) {
        for (var j = 0; j < scored.length && picked.length < 3; j++) {
          var o = scored[j];
          if (picked.indexOf(o) >= 0) continue;
          var ex = o.e.song.experience || [];
          if (!prefKeys.some(function (k) { return ex.indexOf(k) >= 0; })) continue;
          if (o.e.song.group && groups[o.e.song.group]) continue;
          picked.push(o);
          if (o.e.song.group) groups[o.e.song.group] = true;
        }
      }
      return {
        debug: opts.debug ? scored.slice(0, 8).map(function (x) { return [x.e.song.id, x.e.song.title, +x.score.toFixed(2), JSON.stringify(x.detail)]; }) : undefined,
        status: status,
        results: picked.map(function (p) { return { song: p.e.song, score: p.score, detail: p.detail }; }),
        query: q
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
      loading = fetch('data/songs.json', { credentials: 'same-origin' })
        .then(function (r) { if (!r.ok) throw new Error('data ' + r.status); return r.json(); })
        .then(function (d) { engine = createEngine(d); return engine; });
      loading.catch(function () { loading = null; });
    }
    return loading;
  }

  function read() { try { return JSON.parse(sessionStorage.getItem(KEY) || 'null'); } catch (e) { return null; } }
  function write(v) { try { if (v) sessionStorage.setItem(KEY, JSON.stringify(v)); else sessionStorage.removeItem(KEY); } catch (e) { /* storage unavailable */ } }

  function syncButton() { submit.disabled = !textarea.value.trim(); }

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

  function renderPrimary(song) {
    var a = el('a', 'remedy-primary');
    link(a, song);
    var fig = el('div', 'remedy-primary-art'); fig.appendChild(cover(song, 600));
    var body = el('div', 'remedy-primary-body');
    body.appendChild(el('p', 'remedy-label', '01 / FIRST LISTEN'));
    body.appendChild(el('h3', 'remedy-title', song.title));
    body.appendChild(el('p', 'remedy-formula', formulaName(song)));
    body.appendChild(el('p', 'remedy-why', song.why));
    var l = el('span', 'remedy-listen'); l.innerHTML = 'LISTEN <span aria-hidden="true">↗</span>';
    body.appendChild(l);
    a.appendChild(fig); a.appendChild(body);
    return a;
  }
  function renderCard(song) {
    var li = el('li');
    var a = el('a', 'remedy-card');
    link(a, song);
    var art = el('div', 'remedy-card-art'); art.appendChild(cover(song, 600));
    var body = el('div', 'remedy-card-body');
    body.appendChild(el('h4', 'remedy-card-title', song.title));
    body.appendChild(el('p', 'remedy-formula', formulaName(song)));
    body.appendChild(el('p', 'remedy-card-why', song.why));
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
    primarySlot.appendChild(renderPrimary(songs[0]));
    songs.slice(1).forEach(function (s) { alsoList.appendChild(renderCard(s)); });
    alsoWrap.hidden = songs.length < 2;
    note.hidden = state.status !== 'weak';
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
    var text = textarea.value.trim();
    if (!text) { syncButton(); return; }
    hint.textContent = '';
    load().then(function (eng) {
      var r = eng.recommend(text);
      if (r.status === 'empty' || r.status === 'none' || !r.results.length) {
        hint.textContent = 'Say a little more: what is happening, or how you would like to feel.';
        write({ text: textarea.value, ids: [] });
        textarea.focus();
        return;
      }
      var state = { text: textarea.value, ids: r.results.map(function (x) { return x.song.id; }), status: r.status };
      write(state);
      showResults(state, true);
    }).catch(function () {
      hint.textContent = 'Discovery is unavailable right now. Please try again in a moment.';
    });
  }

  function restore() {
    var st = read();
    if (!st) { syncButton(); return; }
    if (typeof st.text === 'string' && textarea.value !== st.text) textarea.value = st.text;
    syncButton();
    if (st.ids && st.ids.length) {
      load().then(function () { showResults(st, false); }).catch(function () { showInput(); });
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
    if (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey)) { ev.preventDefault(); if (!submit.disabled) run(); }
  });
  form.addEventListener('submit', function (ev) { ev.preventDefault(); if (!submit.disabled) run(); });
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
