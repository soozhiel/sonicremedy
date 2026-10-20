#!/usr/bin/env python3
"""Versioned data build for the Sonic Remedy discovery engine (TABs 01/02/05/06).

Usage:  python3 scripts/build_data.py <master.xlsx> [data_dir]

Writes into data_dir (default data/):
  songs.json        TAB 01 + TAB 02 (via build_songs.py) plus `about` (scripts/about_lines.json)
  expressions.json  TAB 05 (via build_expressions.py)
  affinities.json   TAB 06 formula affinity table, each with its approval status
  meaning.json      TAB 06 per-song layer: review status, connection role, guardrail text and the
                    machine rule derived from it, plus the near-duplicate pairs with their source basis
  manifest.json     data version, sha256 of every file and of the Sheet export, validation results
Any validation problem aborts the build and nothing is written.
The Sheet is never modified; TAB 06 text is copied, never reinterpreted.
"""
import sys, os, re, json, hashlib, datetime
from collections import OrderedDict
from openpyxl import load_workbook

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import build_songs, build_expressions  # noqa: E402

ID_RE = re.compile(r'^SR-F(\d{2})-T(\d{2})$')
EXPECTED_PER_FORMULA = {1: 10, 2: 10, 3: 8, 4: 8, 5: 6, 6: 6, 7: 16, 8: 6}
# expected composition type per formula (TAB 02 'Composition type' + formula identity)
TYPE_BY_FORMULA = {7: {'spoken-sleep'}, 8: {'instrumental', 'instrumental-wordless'}}

# Near-duplicate pairs. Each basis quote must appear verbatim in the named TAB 02 field, so the
# reason for pairing stays traceable to the source. kind: 'version' = same lyrics/meaning in another
# treatment (suppressed unless a listening preference justifies it); 'related' = distinct compositions
# with a linked subject (kept apart only when a comparably relevant alternative exists).
PAIRS = OrderedDict([
    ('shay', {'ids': ['SR-F05-T02', 'SR-F05-T03'], 'kind': 'version', 'prefer': 'darker',
              'basis': [('SR-F05-T03', 'Verification status', 'Shared meaning artist-confirmed 2026-10-17 (= SR-F05-T02)'),
                        ('SR-F05-T03', 'Composition type', 'darker musical treatment of Shay (same lyrics)')]}),
    ('city-of-gold', {'ids': ['SR-F05-T04', 'SR-F05-T05'], 'kind': 'version', 'prefer': 'alien',
                      'basis': [('SR-F05-T05', 'Verification status', 'Shared meaning artist-confirmed 2026-10-17 (= SR-F05-T04)'),
                                ('SR-F05-T05', 'Composition type', "sung in the artist's extracelestial language with English")]}),
    ('bet', {'ids': ['SR-F02-T08', 'SR-F02-T09'], 'kind': 'related', 'prefer': None,
             'basis': [('SR-F02-T09', 'Central meaning', 'Answer song to Track 08')]}),
])
# Pairs reviewed and deliberately NOT treated as near-duplicates (kept out of PAIRS and out of the songs'
# `group`), with the reason. Recorded in manifest.json so the decision stays visible.
NOT_PAIRS = OrderedDict([
    ('progress', {'ids': ['SR-F07-T12', 'SR-F07-T13'],
                  'reason': 'Removed 2026-10-18 (user decision): similar themes do not make compositions duplicates. '
                            'The only source link is TAB 02 T13 "Overlaps thematically with T12 (title-based)"; '
                            'no composition-level basis (shared lyrics, recording or version) was found.'}),
])

# Per-track vocal profile. Values: spoken_narration | sung_lyrics | wordless_vocals | instrumental | unverified.
# Every value is derived only from source text (TAB 02 Composition type / Support type / Specific circumstances,
# TAB 03 Related theme, TAB 04 corrective action); the quoted source is stored with it. When the sources do
# not state how a track is voiced it is 'unverified' and listening-constraint requests exclude it.
VOCAL_VALUES = ('spoken_narration', 'sung_lyrics', 'wordless_vocals', 'instrumental', 'unverified')

# Machine rules derived from TAB 06 col H (Inference guardrail). `cue` must appear in that song's H text,
# so if the Sheet guardrail is reworded the build stops and the rule is reviewed by a person.
GUARDRAILS = OrderedDict([
    ('SR-F01-T04', {'rule': 'requires_blaming_others', 'cue': 'require explicit blaming/judging pattern'}),
    ('SR-F01-T09', {'rule': 'injustice_not_disengage', 'cue': 'Do not assume concern about injustice'}),
    ('SR-F03-T01', {'rule': 'grief_not_regret', 'cue': 'Grief does not imply regret'}),
    ('SR-F03-T03', {'rule': 'isolation_not_grief', 'cue': 'Isolation is not identical to grief'}),
    ('SR-F03-T08', {'rule': 'heartbreak_not_rejection', 'cue': 'Heartbreak does not necessarily mean rejecting'}),
    ('SR-F05-T02', {'rule': 'version_pair', 'cue': 'Avoid duplicate recommendations'}),
    ('SR-F05-T03', {'rule': 'version_pair', 'cue': 'Avoid duplicate recommendations'}),
    ('SR-F05-T04', {'rule': 'version_pair', 'cue': 'Avoid duplicate recommendations'}),
    ('SR-F05-T05', {'rule': 'version_pair', 'cue': 'Avoid duplicate recommendations'}),
    ('SR-F07-T01', {'rule': 'not_generic_sleep', 'cue': 'Not a generic sleep'}),
    ('SR-F07-T07', {'rule': 'requires_caused_hurt', 'cue': 'Only recommend for trust-repair where visitor caused hurt'}),
    ('SR-F08-T03', {'rule': 'no_diagnosis_wording', 'cue': 'do not claim to diagnose'}),
    ('SR-F08-T06', {'rule': 'wordless_vocals', 'cue': 'Wordless vocal sounds'}),
])
F06_CUE = 'ARTIST-CONFIRMED FORMULA-LEVEL LISTENING AFFINITY'
GENERIC_H = 'Do not infer unstated causes, emotions or intentions.'
DESC_MAX, DESC_MAX_WORDS = 140, 25
# visible descriptions describe the composition only: no repetition of the visitor, no matching mechanism,
# no claims about what the visitor feels (user decision 2026-10-18)
DESC_BANNED = re.compile(r"\b(you said|you mentioned|you asked|you shared|you wrote|your words|your image|because you|you feel\w*|you're feeling|you are feeling|you seem|connects? (to|with)|connection (to|with)|possible connection|match\w*|close to a situation|nothing in the catalogue|related connection|another direction|open place to start)\b", re.I)
HEALTH = re.compile(r'\b(chest|anxiety|anxious|panic|depress\w*|disorder|symptom\w*|diagnos\w*|doctor|medic\w*|health|therap\w*|illness|cure\w*|treat(ment)?)\b', re.I)


def tab_rows(wb, prefix):
    ws = build_songs.tab(wb, prefix)
    return [list(r) for r in ws.iter_rows(values_only=True)]


def s(v):
    return '' if v is None else str(v).strip()


def sha(path):
    return hashlib.sha256(open(path, 'rb').read()).hexdigest()


def build(xlsx, ddir):
    errs, checks = [], OrderedDict()

    def check(name, ok, detail=''):
        checks[name] = 'pass' if ok else 'FAIL'
        if not ok:
            errs.append(f'{name}: {detail}')

    wb = load_workbook(xlsx, read_only=True, data_only=True)
    songs = build_songs.build(xlsx, os.path.join(HERE, 'why_lines.json'))
    errs += build_songs.validate(songs)
    about = json.load(open(os.path.join(HERE, 'about_lines.json')))
    desc = json.load(open(os.path.join(HERE, 'description_lines.json')))
    t1 = {r['Song ID']: r for r in build_songs.rows(build_songs.tab(wb, 'TAB 01')) if ID_RE.match(r.get('Song ID', ''))}
    t2 = {r['Song ID']: r for r in build_songs.rows(build_songs.tab(wb, 'TAB 02')) if ID_RE.match(r.get('Song ID', ''))}

    # --- TAB 06: per-song table (header row 1) and formula affinity table (header 'Formula')
    raw6 = tab_rows(wb, 'TAB 06')
    head = [s(h) for h in raw6[0]]
    per = OrderedDict()
    aff_rows, i = [], 1
    while i < len(raw6):
        r = [s(c) for c in raw6[i]] + [''] * 16
        if ID_RE.match(r[0]):
            per[r[0]] = dict(zip(head, r))
        elif r[0] == 'Formula':
            ah = r
            j = i + 1
            while j < len(raw6) and raw6[j] and re.match(r'^\d{2}$', s(raw6[j][0])):
                aff_rows.append(dict(zip(ah, [s(c) for c in raw6[j]])))
                j += 1
            i = j
            continue
        i += 1

    ids = [x['id'] for x in songs]
    for name, src in (('TAB 01', set(t1)), ('TAB 02', set(t2)), ('TAB 06', set(per))):
        check(f'70 IDs match {name}', set(ids) == src and len(src) == 70, f'{len(src)} ids; diff {sorted(set(ids) ^ src)[:5]}')
    check('70 unique IDs', len(ids) == 70 and len(set(ids)) == 70, len(ids))
    counts = {}
    for x in songs:
        counts[x['formula']['number']] = counts.get(x['formula']['number'], 0) + 1
    check('songs per formula', counts == EXPECTED_PER_FORMULA, counts)

    # URLs: song pages must equal TAB 01; F07/F08 (no song pages) go to their formula page
    bad = []
    for x in songs:
        r = t1[x['id']]
        u, fu = r['Individual song-page URL'], r['Formula-page URL']
        if u.startswith('https://'):
            if x['url'] != u or x['urlType'] != 'song': bad.append(x['id'])
        elif x['url'] != fu.rstrip('/') and x['url'] != fu:
            bad.append(x['id'])
        if not re.match(r'^https://[a-z0-9-]+\.vercel\.app/?$', x['url']): bad.append(x['id'])
    check('URLs match TAB 01', not bad, bad)

    # composition types
    bad = []
    for x in songs:
        f = x['formula']['number']
        allowed = TYPE_BY_FORMULA.get(f, {'song'})
        if x['type'] not in allowed: bad.append((x['id'], x['type']))
        ct = (t2[x['id']].get('Composition type') or '').lower()
        if ct and x['type'] == 'song' and not ct.startswith('song'): bad.append((x['id'], ct))
    check('composition types consistent with TAB 02 and formula', not bad, bad)

    # artwork
    root = os.path.dirname(HERE)
    bad = [x['id'] for x in songs if not os.path.isfile(os.path.join(root, x['cover'])) or not t1[x['id']].get('Public cover-artwork path')]
    check('artwork file present for every song (and TAB 01 cover ref)', not bad, bad)

    # TAB 06 source columns must reproduce TAB 02 exactly
    bad = []
    for sid, r in per.items():
        a = t2[sid]
        pairs = [('Source central meaning (TAB 02 exact)', 'Central meaning'),
                 ('Source circumstances (TAB 02 exact)', 'Specific circumstances where it may resonate'),
                 ('Source current feeling / situation (TAB 02 exact)', 'Current feeling or situation (match mode A)'),
                 ('Source desired state / felt need (TAB 02 exact)', 'Desired state / felt need (match mode B)')]
        for c6, c2 in pairs:
            if r.get(c6, '') != (a.get(c2) or ''):
                bad.append((sid, c6))
    check('TAB 06 source columns == TAB 02 text', not bad, bad[:6])

    # near-duplicate pairs and their basis
    bad = []
    for g, p in PAIRS.items():
        for sid in p['ids']:
            if sid not in t2: bad.append((g, sid, 'missing'))
        a, b = p['ids']
        if a not in (t2[b].get('Related song IDs') or '') or b not in (t2[a].get('Related song IDs') or ''):
            bad.append((g, 'not cross-listed in TAB 02 Related song IDs'))
        for sid, field, quote in p['basis']:
            if quote not in (t2[sid].get(field) or ''): bad.append((g, sid, field, 'basis text not found'))
        grp = {x['group'] for x in songs if x['id'] in p['ids']}
        if grp != {g}: bad.append((g, 'songs.json group mismatch', grp))
    for g, p in NOT_PAIRS.items():
        grp = {x['group'] for x in songs if x['id'] in p['ids']}
        if grp != {None}: bad.append((g, 'removed pair still grouped in songs.json', grp))
    check('near-duplicate pairs valid with TAB 02 basis', not bad, bad)

    # guardrails
    bad = []
    for sid, g in GUARDRAILS.items():
        if g['cue'] not in per[sid].get('Inference guardrail / caution', ''): bad.append(sid)
    f06 = [sid for sid in per if sid.startswith('SR-F06')]
    if not all(F06_CUE in per[sid]['Inference guardrail / caution'] for sid in f06): bad.append('F06 affinity guardrail')
    other_specific = [sid for sid, r in per.items() if sid not in GUARDRAILS and sid not in f06
                      and not r.get('Inference guardrail / caution', '').startswith(GENERIC_H)]
    check('every specific TAB 06 guardrail has a reviewed machine rule', not bad and not other_specific, bad + other_specific)

    # affinities
    affs = OrderedDict()
    for r in aff_rows:
        n = int(r['Formula'])
        ev = r.get('Evidence and approval', '')
        status = 'artist-confirmed' if ev.lower().startswith('artist-confirmed') else 'proposed'
        affs[str(n)] = OrderedDict([('number', n), ('name', r['Formula name']), ('status', status),
                                    ('affinity', r['Underlying listening affinity']),
                                    ('current', r['Possible current experiences (not mandatory)']),
                                    ('desired', r['Possible desired experiences (not assumed)']),
                                    ('boundary', r['Inference / safety boundary']), ('evidence', ev)])
    check('8 formula affinities', sorted(affs) == [str(k) for k in range(1, 9)], sorted(affs))
    check('only F06 affinity artist-confirmed', [k for k, v in affs.items() if v['status'] == 'artist-confirmed'] == ['6'],
          [k for k, v in affs.items() if v['status'] == 'artist-confirmed'])
    names = {x['formula']['number']: x['formula']['name'] for x in songs}
    check('affinity formula names match TAB 01', all(names[v['number']] == v['name'] for v in affs.values()))

    # about lines
    bad = [sid for sid in ids if not about.get(sid) or HEALTH.search(about[sid])]
    check('about line for every song, health-free', not bad, bad)

    # public descriptions (one per song, independent of the visitor's input)
    check('description for every song', all(desc.get(i) for i in ids) and not set(desc) - set(ids) - {'_note'},
          [i for i in ids if not desc.get(i)] + sorted(set(desc) - set(ids) - {'_note'}))
    bad = {}
    types = {x['id']: x for x in songs}
    for i in ids:
        d = desc.get(i) or ''
        why = []
        if len(d) > DESC_MAX or len(d.split()) > DESC_MAX_WORDS: why.append('too long')
        if not re.match(r'^[A-Z].*[.]$', d) or re.search(r'[.!?;]\s+\S', d): why.append('not one sentence')
        if re.search(r'["\u201c\u201d\u2018\u2019\u00ab\u00bb]', d): why.append('quotation marks')
        if DESC_BANNED.search(d): why.append('banned phrase: ' + DESC_BANNED.search(d).group(0))
        if HEALTH.search(d) or re.search(r'\bheal\w*', d, re.I): why.append('health/treatment wording')
        t = types[i]['type'] if i in types else ''
        if t == 'spoken-sleep' and not d.startswith('A spoken'): why.append('F07 must say spoken sleep contemplation')
        if t in ('instrumental', 'instrumental-wordless') and (not re.search(r'\binstrumental\b', d) or re.search(r'\b(song|sung|lyric\w*|sing\w*)\b', d, re.I)): why.append('instrumental wording')
        if t == 'instrumental-wordless' and 'wordless' not in d: why.append('must mention wordless vocals')
        if t == 'instrumental' and not re.search(r'\bwithout words\b', d): why.append('must say without words')
        if i.startswith('SR-F06-') and not d.startswith('Sung in a channelled alien language'): why.append('F06 must say channelled alien language')
        if t == 'spoken-sleep' and re.search(r'\b(song|sung)\b', d): why.append('spoken track called a song')
        if why: bad[i] = why
    check('descriptions: one sentence, no quotes/visitor wording/mechanism/health, type-accurate', not bad, bad)

    # TAB 05
    try:
        expr = build_expressions.build(xlsx, None, site_ids=set(ids))
        check('TAB 05 links valid', True)
    except SystemExit as e:
        expr = None
        check('TAB 05 links valid', False, str(e))

    # --- vocal profiles (per track, from source text only)
    t3 = {}
    for r in build_songs.rows(build_songs.tab(wb, 'TAB 03')):
        if ID_RE.match(r.get('Song ID', '')): t3.setdefault(r['Song ID'], []).append(r)
    t4 = {}
    for r in build_songs.rows(build_songs.tab(wb, 'TAB 04')):
        if ID_RE.match(r.get('Song ID', '')): t4.setdefault(r['Song ID'], []).append(r)
    vocal = OrderedDict()
    for sid in ids:
        a = t2[sid]
        ct = s(a.get('Composition type'))
        flags, src = [], []
        if ct.lower().startswith('spoken'):
            flags.append('spoken_narration'); src.append(f'TAB 02 Composition type: "{ct}"')
        elif ct == 'Instrumental':
            flags.append('instrumental'); src.append(f'TAB 02 Composition type: "{ct}"')
        elif ct.lower().startswith('instrumental with wordless vocals'):
            flags.append('wordless_vocals'); src.append(f'TAB 02 Composition type: "{ct}"')
        elif ct.lower().startswith('song'):
            flags.append('sung_lyrics'); src.append(f'TAB 02 Composition type: "{ct}"')
        else:
            k = s(a.get('Support type'))
            m3 = [r for r in t3.get(sid, []) if re.search(r'\bsung\b', s(r.get('Related theme or situation')))]
            m4 = [r for r in t4.get(sid, []) if 'sung lyric version' in s(r.get('Recommended corrective action'))]
            if 'sung lyrics' in k:
                flags.append('sung_lyrics'); src.append('TAB 02 Support type: "sung lyrics are in a channelled alien language"')
                if m3: src.append(f'TAB 03 Related theme: "{s(m3[0].get("Related theme or situation"))}"')
            elif m4:
                flags.append('sung_lyrics'); src.append(f'TAB 04 Recommended corrective action: "{s(m4[0].get("Recommended corrective action"))}"')
        # scat / vocalese lines are wordless vocals alongside the sung lyrics
        sc = [(f, s(a.get(f))) for f in ('Composition type', 'Specific circumstances where it may resonate') if re.search(r'\bscat\b', s(a.get(f)))]
        if sc and 'wordless_vocals' not in flags:
            flags.append('wordless_vocals'); src.append(f'TAB 02 {sc[0][0]}: "...{re.search(r"[^;]*scat[^;]*", sc[0][1]).group(0).strip()}"')
        lyr = bool(s(t1[sid].get('Original lyrics Drive reference'))) and any(s(r.get('Verification status')).startswith('Verified') for r in t3.get(sid, []))
        if not flags:
            flags = ['unverified']
            src.append('TAB 02 Composition type blank; no source states how the track is voiced'
                       + (' (lyrics exist: TAB 01 lyrics document + verified TAB 03 excerpts; sung vs spoken delivery not stated)' if lyr else ''))
        vocal[sid] = OrderedDict([('vocal_profile', flags[0]), ('vocal_flags', flags), ('vocal_source', '; '.join(src)), ('lyrics_verified', lyr)])
    bad = [sid for sid in ids if sid not in vocal or vocal[sid]['vocal_profile'] not in VOCAL_VALUES
           or any(f not in VOCAL_VALUES for f in vocal[sid]['vocal_flags']) or not vocal[sid]['vocal_source']]
    check('every track has a vocal profile with a source', not bad, bad)
    TYPE_OK = {'spoken-sleep': {'spoken_narration'}, 'instrumental': {'instrumental'}, 'instrumental-wordless': {'wordless_vocals'},
               'song': {'sung_lyrics', 'unverified'}}
    bad = [(x['id'], x['type'], vocal[x['id']]['vocal_profile']) for x in songs if vocal[x['id']]['vocal_profile'] not in TYPE_OK.get(x['type'], set())]
    check('vocal profiles consistent with composition type', not bad, bad)

    if errs:
        return None, errs, checks

    for x in songs:
        x.update(vocal[x['id']])
        x['about'] = about[x['id']]
        x['description'] = desc[x['id']]
        # the song's own TAB 02 circumstances (without the formula-wide F06 association merged into m.situations)
        x['m']['circ'] = build_songs.split(t2[x['id']].get('Specific circumstances where it may resonate', ''))
        x['rule'] = GUARDRAILS.get(x['id'], {}).get('rule') or ('f06_affinity_only' if x['id'] in f06 else None)
    meaning = OrderedDict()
    for sid in ids:
        r = per[sid]
        meaning[sid] = OrderedDict([
            ('review', r.get('Review status', '')),
            ('role', r.get('Connection role', '')),
            ('formulaAffinity', r.get('Formula affinity (proposed)', '')),
            ('guardrail', r.get('Inference guardrail / caution', '')),
            ('rule', GUARDRAILS.get(sid, {}).get('rule') or ('f06_affinity_only' if sid in f06 else None)),
        ])
    pairs_out = OrderedDict((g, OrderedDict([('ids', p['ids']), ('kind', p['kind']), ('prefer', p['prefer']),
                                            ('basis', [{'id': a, 'field': f, 'text': q} for a, f, q in p['basis']])]))
                            for g, p in PAIRS.items())
    return {'songs': songs, 'expressions': expr, 'affinities': affs, 'meaning': meaning, 'pairs': pairs_out}, [], checks


def main():
    if len(sys.argv) < 2: raise SystemExit(__doc__)
    xlsx = sys.argv[1]
    ddir = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(HERE), 'data')
    out, errs, checks = build(xlsx, ddir)
    for k, v in checks.items(): print(f'{v:4} {k}')
    if errs:
        print('\nBUILD FAILED — nothing written:\n  ' + '\n  '.join(map(str, errs)))
        sys.exit(1)
    now = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H:%M:%SZ')
    src = 'SONIC REMEDY — MASTER SONG INDEX'
    files = OrderedDict()
    docs = OrderedDict([
        ('songs.json', OrderedDict([('schemaVersion', 4), ('generated', now[:10]), ('source', src), ('count', len(out['songs'])), ('songs', out['songs'])])),
        ('expressions.json', out['expressions']),
        ('affinities.json', OrderedDict([('schemaVersion', 1), ('generated', now), ('source', src + ' / TAB 06 formula affinity table'),
                                         ('note', 'Affinity is a listening connection, not a claim that every track shares the meaning.'),
                                         ('formulas', out['affinities'])])),
        ('meaning.json', OrderedDict([('schemaVersion', 1), ('generated', now), ('source', src + ' / TAB 06 — MEANING & CONNECTION INTELLIGENCE'),
                                      ('songs', out['meaning']), ('pairs', out['pairs'])])),
    ])
    for name, doc in docs.items():
        p = os.path.join(ddir, name)
        with open(p, 'w') as f:
            if name == 'songs.json': json.dump(doc, f, ensure_ascii=False, separators=(',', ':'))
            else: json.dump(doc, f, ensure_ascii=False, indent=1)
        json.load(open(p))
        files[name] = OrderedDict([('sha256', sha(p)), ('bytes', os.path.getsize(p))])
    digest = hashlib.sha256(''.join(v['sha256'] for v in files.values()).encode()).hexdigest()[:12]
    manifest = OrderedDict([('dataVersion', now[:10] + '-' + digest), ('generated', now), ('source', src),
                            ('sheetExport', OrderedDict([('file', os.path.basename(xlsx)), ('sha256', sha(xlsx))])),
                            ('tabs', ['TAB 01', 'TAB 02', 'TAB 05', 'TAB 06']), ('files', files), ('validation', checks),
                            ('affinityStatus', {k: v['status'] for k, v in out['affinities'].items()}),
                            ('pairs', {g: {'ids': p['ids'], 'kind': p['kind'], 'basis': p['basis']} for g, p in out['pairs'].items()}),
                            ('notNearDuplicates', {g: {'ids': p['ids'], 'reason': p['reason']} for g, p in NOT_PAIRS.items()}),
                            ('vocalProfiles', OrderedDict([('values', list(VOCAL_VALUES)),
                                ('counts', {v: sum(1 for x in out['songs'] if x['vocal_profile'] == v) for v in VOCAL_VALUES}),
                                ('mixed', [x['id'] for x in out['songs'] if len(x['vocal_flags']) > 1]),
                                ('note', 'Listening constraints use vocal_flags per track; unverified tracks are excluded from constrained requests.')]))])
    json.dump(manifest, open(os.path.join(ddir, 'manifest.json'), 'w'), ensure_ascii=False, indent=1)
    print(f"\nOK data {manifest['dataVersion']} -> {ddir}")


if __name__ == '__main__':
    main()
