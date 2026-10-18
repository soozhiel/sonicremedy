/* Sonic Remedy — meaning layer (Stage 2, semantic integration).
 * Deterministic, in-browser reading of what a visitor wrote, kept separate from song matching.
 * It separates what is happening, the visitor's response, what they explicitly want, polarity,
 * what they negated, uncertainty, who did what to whom (agency / role) and listening preferences
 * or constraints. Anything not stated stays unknown: nothing here invents a missing dimension.
 * This is rule-based pattern reading of the visitor's own words, not language understanding.
 * No network calls, no model, nothing stored.
 */
(function (root) {
  'use strict';

  // Each signal names a dimension of meaning, the wording that states it, and a neutral topic label
  // used in explanations ("what you said about <topic>"). Labels name topics, never feelings the
  // visitor did not use.
  var SIGNALS = [
    // what is happening (situation)
    { key: 'grief', dim: 'situation', topic: 'losing someone',
      re: /\b(griev\w*|grief|mourn\w*|bereave\w*|passed away|passed on|(has|had|just) passed|(my|our|her|his|their) \w+ (passed|died)|(she|he|they) (passed|died)|put (our|my|the) (dog|cat|pet) down|died|death of|funeral|buried|lost my (mum|mom|mother|dad|father|grandad|grandpa|grandfather|grandma|grandmother|nan|nana|brother|sister|son|daughter|wife|husband|partner|friend|best friend|baby|dog|cat))\b/ },
    { key: 'injustice', dim: 'situation', topic: 'injustice',
      re: /\b(injustice\w*|unjust|unfair\w*|inequalit\w*|oppress\w*|corrupt\w*|cruelty|the news|the war|wars|state of the world|the world is)\b/ },
    { key: 'heartbreak', dim: 'situation', topic: 'heartbreak',
      re: /\b(heartbr\w+|broke up|break ?up|broken up|my ex\b|dumped)\b/ },
    { key: 'physical', dim: 'situation', topic: 'the physical sensation you described',
      re: /\b(chest|heart (is |keeps |keep )?(racing|pounding|beating)|headache|stomach|shoulders|shaking|trembling|dizzy|nause\w*|breath\w*|jaw|throat)\b/ },
    { key: 'owe', dim: 'situation', topic: 'being told you owe',
      re: /\b(owe|owed|owing|debt|repay\w*|pay (them|it) back)\b/ },
    // what the visitor wants (explicit want)
    { key: 'play', dim: 'want', topic: 'play',
      re: /\b(to play|play more|playful\w*|just for fun|for fun|for the fun of it|without (it )?(being|having to be|needing to be) productive|without proving)\b/ },
    { key: 'decision', dim: 'want', topic: 'a decision',
      re: /\b(decid\w*|decision\w*|make a (choice|call)|choose between|which (way|option|path) to|should i|flip-?flop\w*|torn between|is (my|the) choice)\b/ },
    { key: 'disengage', dim: 'want', topic: 'stepping back',
      re: /\b(step back|switch off from|stop (following|reading|watching|thinking about)|take a break from|tired of thinking about|walk away|not my battle|pick (my|your) battles|can not fight every)\b/ },
    { key: 'repair', dim: 'want', topic: 'earning back trust',
      re: /\b(earn (back )?(their |his |her |my \w+ )?trust|win (back )?(their |his |her )?trust|rebuild (their |his |her )?trust|make it right|make amends|apologi[sz]\w*)\b/ },
    // response / positive state
    { key: 'pride', dim: 'positive', topic: 'something you are proud of',
      re: /\b(proud|accomplish\w*|i did it|nailed it|finished (the|my)|got the job|got promoted|promot(ed|ion)|passed (my|the) (exam|test))\b/ },
    { key: 'happy', dim: 'positive', topic: 'a good mood',
      re: /\b(happy|great mood|good mood|over the moon|elated|thrilled|content|life is going well|going well|doing well|good day|feel good|feeling good|grateful|thankful)\b/ }
  ];

  var ROLE = {
    // the visitor was hurt / let down by someone else
    betrayed: /\b(betrayed (me|my)|(he|she|they|someone|somebody|my \w+) (betrayed|cheated on|lied to|broke|hurt) (me|my)|i (was|have been|got|been) (betrayed|cheated on|lied to|hurt by)|cheated on me|lied to me|broke my trust|betrayed my trust|stabbed me in the back|backstab\w*)\b/,
    // the visitor caused the hurt
    caused: /\b(i (hurt|betrayed|cheated on|lied to|let down) (someone|somebody|him|her|them|my \w+)|i (was|have been) (cruel|horrible|mean|awful|nasty|unkind) to|i said something (cruel|awful|horrible|mean|hurtful)|i messed up|my fault|i (\w+ ){1,4}behind (their|his|her|my \w+) back|i broke (their|his|her|my \w+|someone) trust|earn (back )?(their |his |her )?trust|win (back )?(their |his |her )?trust|make it right|make amends|regret what i did)\b/,
    // someone blames the visitor
    blamed: /\b(((they|he|she|everyone|everybody|people|my \w+) (keep |keeps |always )?(blame|blames|blamed|blaming) me)|blam(ed|ing) me|i (am|was|got|get|keep getting) (being )?blamed|scapegoat\w*|accus\w* me|(say|says|saying|said) (it is|it was|i am|i was) (my fault|the reason)|lie(d|s)? about me|thrown under the bus)\b/,
    // the visitor blames / judges others
    blaming: /\b(i (keep |always |often |constantly |tend to )?(blame|blaming|judge|judging|criticis\w+|criticiz\w+) (others|everyone|everybody|people|them|him|her|my \w+)|i catch myself (blaming|judging|criticis\w+|criticiz\w+)|point(ing)? the finger)\b/,
    // talking about blame without being part of it
    describing: /\b(blame game|(people|everyone|they) (blame|judge) (each other|one another|others))\b/,
    // supporting someone else
    supporting: /\b(stay(ing)? strong for|(be|being|trying to be) strong for|be there for|support(ing)? (my|a|someone|them|him|her)|look(ing)? after (my|a) \w+|car(e|ing) for (my|a) \w+|my friend is struggling|someone i love is)\b/
  };

  var UNCERTAIN = [
    ['need', /\b(do not|dont) (really )?know what i (need|want)|not sure what i (need|want)|no idea what i (need|want)\b/],
    ['cause', /\b((do not|dont) (really )?know|not sure|no idea|cautious (about|to|as to)|wonder(ing)?) why\b/],
    ['choice', /\b(should i|whether to|not sure (if|whether)|is (my|the|this) (choice|decision) (even )?(mine|right))\b/],
    ['general', /\b(unsure|not sure|maybe|i guess|kind of|sort of)\b/]
  ];

  // listening preferences and constraints
  var PREF = {
    noSpoken: /\b((do not|dont) want (anyone|anybody|someone|somebody|a voice|people|any voice) (talking|speaking)|no (spoken|talking|voice|voices|speaking|narration|words|lyrics)|without (talking|a voice|words|lyrics|speaking|narration)|nothing spoken|wordless|instrumental|no one talking|just music)\b/,
    noLyrics: /\b(no (spoken )?(words|lyrics|singing|vocals)|without (words|lyrics|singing|vocals)|wordless|instrumental|just music)\b/,
    noVocals: /\b(no (vocals|voice|voices|singing)|without (vocals|a voice|any voice|singing)|purely instrumental|fully instrumental|only instrumental)\b/,
    wantSpoken: /\b(spoken|talk me through|guided|guide me|narrat\w*|a voice to|voice (to )?(talk|guide)|someone talking|meditation)\b/,
    wantLyrics: /\b(lyrics i can|sing along|singalong|something to sing|with (words|lyrics))\b/,
    notSleepy: /\b(not|nothing|no|without|never)\b(\s+\w+){0,4}\s+(sleep\w*|drows\w*|asleep)\b|\b(stay|keep me) awake\b/,
    alien: /\b(alien|extraterrestrial|extracelestial|otherworldly|another language|made-up language|other-?worldly)\b/,
    darker: /\b(dark|darker|moody|brooding)\b/
  };
  var NEG_BEFORE = /\b(not|never|no longer|no|without|nothing|isn not|am not)\s+(\w+\s+){0,2}$/;
  var STATE_NEG_OK = /\b(can|could|will|would) not\s+(\w+\s+)?$/;

  function interpret(text, lib) {
    var n = ' ' + lib.normalise(text) + ' ';
    var f = { explicit: [], inferred: [], situation: [], response: [], want: [], positive: [], negated: [],
      polarity: 'unknown', uncertainty: null, role: null, prefs: {}, metaphor: false, text: n.trim() };
    function add(list, item) { if (list.indexOf(item) < 0) list.push(item); }

    // signals, with negation scope limited to a few words before the matched phrase in the same clause
    lib.clauses(text).forEach(function (c) {
      var t = ' ' + c.text + ' ';
      SIGNALS.forEach(function (s) {
        var re = new RegExp(s.re.source, 'g'), m;
        while ((m = re.exec(t))) {
          var before = t.slice(Math.max(0, m.index - 30), m.index);
          var neg = NEG_BEFORE.test(before) && !STATE_NEG_OK.test(before) && s.key !== 'play' && s.key !== 'decision';
          if (neg) { add(f.negated, s.key); continue; }
          add(f[s.dim], s.key);
          if (!f.explicit.some(function (e) { return e.key === s.key; })) f.explicit.push({ key: s.key, dim: s.dim, topic: s.topic, words: m[0].trim() });
        }
      });
    });
    // a 'physical' word used for an emotion ("breathing room", "breathe again") is not a sensation
    if (/\b(breathing room|room to breathe|breathe again|space to breathe|breather)\b/.test(n)) {
      f.situation = f.situation.filter(function (k) { return k !== 'physical'; });
      f.explicit = f.explicit.filter(function (e) { return e.key !== 'physical'; });
    }

    // agency / role, most specific first
    if (ROLE.caused.test(n) && !ROLE.betrayed.test(n)) f.role = 'caused';
    else if (ROLE.betrayed.test(n)) f.role = 'betrayed';
    else if (ROLE.blamed.test(n)) f.role = 'blamed';
    else if (ROLE.blaming.test(n)) f.role = 'blaming';
    else if (ROLE.describing.test(n)) f.role = 'describing';
    else if (ROLE.supporting.test(n)) f.role = 'supporting';
    if (f.role) f.explicit.push({ key: 'role:' + f.role, dim: 'role', topic: null, words: (n.match(ROLE[f.role]) || [''])[0].trim() });

    for (var i = 0; i < UNCERTAIN.length; i++) {
      if (UNCERTAIN[i][1].test(n)) { f.uncertainty = UNCERTAIN[i][0]; break; }
    }
    if (!f.uncertainty && /\?/.test(text)) f.uncertainty = 'question';

    Object.keys(PREF).forEach(function (k) { if (PREF[k].test(n)) f.prefs[k] = true; });
    if (f.prefs.wantSpoken && (f.prefs.noSpoken || /\b(not|no|without|do not want)\b(\s+\w+){0,3}\s+(spoken|guided|meditation|voice)\b/.test(n))) delete f.prefs.wantSpoken;
    if (f.prefs.noVocals) { f.prefs.noSpoken = true; f.prefs.noLyrics = true; }
    // "I can't sleep" is a sleep problem, not a request to stay awake
    if (f.prefs.notSleepy && /\b(can|could|cannot|will) not (\w+ ){0,2}(sleep|fall asleep|get to sleep|stay asleep)\b/.test(n) && !/\b(not sleepy|not drowsy|stay awake|keep me awake|nothing (sleepy|that makes me (sleepy|drowsy)))\b/.test(n)) delete f.prefs.notSleepy;
    if (f.prefs.alien && /\b(feel|feels|felt|am|like) (an |a )?alien\b/.test(n)) delete f.prefs.alien;   // "I feel like an alien" is not a sound request

    // a metaphor with no other stated meaning stays ambiguous
    if (/\b(feel|feels|felt|am) like (a|an) \w+/.test(n)) f.metaphor = true;
    return f;
  }

  // Merges the concept reading (discovery.js) into the frame and settles polarity.
  // NEGATIVE_STATES: states that, when present and not negated, make the input not purely positive.
  var NEGATIVE_STATES = ['trapped', 'overwhelm', 'fog', 'controlLoss', 'selfDoubt', 'procrastination', 'burden', 'blamed',
    'envy', 'anger', 'frustration', 'rumination', 'defeat', 'depleted', 'disconnected', 'hesitant', 'betrayed', 'causedHurt',
    'guilt', 'routine', 'stagnant', 'sadness', 'sufferingAlone', 'different', 'home', 'discomfort'];
  function settle(f, concepts) {
    var neg = Object.keys(concepts).filter(function (k) { return NEGATIVE_STATES.indexOf(k) >= 0 && concepts[k].role !== 'desire'; });
    neg.forEach(function (k) { if (f.response.indexOf(k) < 0) f.response.push(k); });
    Object.keys(concepts).forEach(function (k) { if (concepts[k].role === 'desire' && f.want.indexOf(k) < 0) f.want.push(k); });
    var hasNeg = neg.length || f.situation.some(function (k) { return k !== 'physical'; }) || f.role === 'betrayed' || f.role === 'blamed' || f.role === 'caused';
    if (f.positive.length && !hasNeg) f.polarity = 'positive';
    else if (f.positive.length && hasNeg) f.polarity = 'mixed';
    else if (hasNeg) f.polarity = 'negative';
    else f.polarity = 'unknown';
    return f;
  }

  var api = { interpret: interpret, settle: settle, SIGNALS: SIGNALS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SonicRemedyMeaning = api;
})(typeof window !== 'undefined' ? window : this);
