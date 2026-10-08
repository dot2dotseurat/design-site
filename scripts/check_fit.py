#!/usr/bin/env python3
"""Rate every item in data.json against fit-rules.json.

Each item carries a `specs` block of typed facts (see REQUIREMENTS.md). This script validates
the block, runs the gates for the item's `check_uses`, and writes `fit.level`, `fit.tag` and
`fit.checks` back into data.json. Hand-written `fit.notes` and `specs.care_flags` are kept.

  python3 scripts/check_fit.py           rewrite data.json
  python3 scripts/check_fit.py --check   exit 1 if data.json is out of date or a spec is invalid
  python3 scripts/check_fit.py --report  print every item's level and why
"""
import json, re, sys, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
RULES = json.loads((ROOT / 'fit-rules.json').read_text())
DATA_PATH = ROOT / 'data.json'
ORDER = {'good': 0, 'caution': 1, 'poor': 2}


def rank(*levels):
    return max(levels, key=lambda l: ORDER[l]) if levels else 'good'


def validate(item):
    errs = []
    s = item.get('specs')
    if not s:
        return [f"{item['id']}: missing specs"]
    E = RULES['enums']
    for u in s.get('check_uses', []):
        if u not in E['check_uses']: errs.append(f"{item['id']}: bad check_use {u}")
    if not s.get('check_uses'): errs.append(f"{item['id']}: check_uses is empty")
    ft = s.get('freeze_thaw', {})
    if ft.get('status', 'unknown') not in E['freeze_thaw']: errs.append(f"{item['id']}: bad freeze_thaw")
    if s.get('finish_class', 'unknown') not in E['finish_class']: errs.append(f"{item['id']}: bad finish_class")
    if s.get('porosity', 'unknown') not in E['porosity']: errs.append(f"{item['id']}: bad porosity")
    if s.get('sample', 'unknown') not in E['sample']: errs.append(f"{item['id']}: bad sample")
    if s.get('cleanable', 'unknown') not in E['cleanable']: errs.append(f"{item['id']}: bad cleanable")
    for r in s.get('rated_for', []):
        if r not in E['rated_for']: errs.append(f"{item['id']}: bad rated_for {r}")
    sl = s.get('slip')
    if sl is not None and not (isinstance(sl, dict) and len(sl) == 1 and next(iter(sl)) in ('dcof', 'dcof_lt', 'dcof_pass', 'r')):
        errs.append(f"{item['id']}: bad slip {sl}")
    return errs


def slip_result(slip):
    if not slip: return 'caution', 'no slip rating published', None
    if 'dcof' in slip:
        ok = slip['dcof'] >= RULES['dcof_min']
        return ('good' if ok else 'poor'), f"DCOF {slip['dcof']} {'clears' if ok else 'is under'} the {RULES['dcof_min']} line", (None if ok else f"DCOF under {RULES['dcof_min']}")
    if 'dcof_lt' in slip:
        return 'poor', f"DCOF is listed under {slip['dcof_lt']}", f"DCOF under {RULES['dcof_min']}"
    if 'dcof_pass' in slip:
        return 'good', 'listed as passing the DCOF wet-slip test (number not published)', None
    n = int(re.sub(r'\D', '', slip['r']) or 0)
    ok = n >= RULES['r_min']
    return ('good' if ok else 'caution'), f"{slip['r']} slip rating {'meets' if ok else 'is below'} R{RULES['r_min']}", None


def rate(item):
    s = item['specs']
    checks = []

    def add(rule, level, detail, use=None, short=None):
        checks.append({'rule': rule, 'use': use, 'level': level, 'detail': detail, **({'short': short} if short else {})})

    for use in s['check_uses']:
        if use == 'deck':
            ft = s.get('freeze_thaw', {'status': 'unknown'})
            st = ft.get('status', 'unknown')
            src = f" ({ft['source']})" if ft.get('source') else ''
            if st == 'pass': add('Freeze/thaw', 'good', 'Passes freeze/thaw' + src, use)
            elif st == 'fail': add('Freeze/thaw', 'poor', 'Not freeze/thaw resistant' + src, use, 'not frost resistant')
            elif st == 'conflict': add('Freeze/thaw', 'caution', 'The vendor\'s listings disagree on freeze/thaw' + src, use)
            else: add('Freeze/thaw', 'caution', 'Freeze/thaw rating not published', use)
            if 'outdoor' not in s.get('rated_for', []) and st != 'pass':
                add('Rated for outdoor', 'caution', 'Not listed for outdoor use', use)
        if use in ('deck', 'floor'):
            lvl, detail, short = slip_result(s.get('slip'))
            add('Slip', lvl, detail, use, short)
            fc = s.get('finish_class', 'unknown')
            if fc in RULES['slip_safe_finishes']: add('Finish', 'good', f'{fc.capitalize()} finish', use)
            elif fc == 'unknown': add('Finish', 'caution', 'Finish not stated', use)
            else: add('Finish', 'caution', 'Mixed polished and matte pieces: the polished ones are slick when wet' if fc == 'mixed' else f'{fc.capitalize()} finish is slick when wet', use)
            por = s.get('porosity', 'unknown')
            if por in ('non-porous', 'seal-once'): add('Care', 'good', 'Non-porous' if por == 'non-porous' else 'One-time seal', use)
            elif por == 'seal-regular': add('Care', 'caution', 'Needs regular resealing', use)
            elif por == 'etches': add('Care', 'caution', 'Etches and stains from soap and cleaners', use)
            else: add('Care', 'caution', 'Porosity not stated', use)
            if 'floor' not in s.get('rated_for', []) and use == 'floor':
                add('Rated for floors', 'caution', 'Not listed for floor use', use)
        if use == 'wall':
            if 'wall' in s.get('rated_for', []): add('Rated for walls', 'good', 'Listed for walls', use)
            else: add('Rated for walls', 'caution', 'Not listed for wall use', use)
        if use == 'wallpaper':
            c = s.get('cleanable', 'unknown')
            if c in RULES['wallpaper_ok_cleanable']: add('Cleanable', 'good', f'{c.capitalize()}', use)
            elif c == 'damp-sponge': add('Cleanable', 'caution', 'Wipes with a damp sponge only', use)
            else: add('Cleanable', 'caution', 'Cleanability not stated', use)

    # every item
    if isinstance(item.get('price_sqft'), (int, float)) and item['price_sqft'] > 0: add('Price', 'good', 'Price published')
    else: add('Price', 'poor', 'No published price', None, 'no published price')
    lead = item.get('lead_wk')
    if lead is None: add('Ship time', 'caution', 'Ship time not published')
    elif lead < RULES['lead_good_below_wk']: add('Ship time', 'good', 'Ships in under %d weeks' % RULES['lead_good_below_wk'])
    elif lead > RULES['lead_poor_above_wk']: add('Ship time', 'poor', f'About {lead:g} weeks to ship', None, f'{lead:g}-week wait')
    else: add('Ship time', 'caution', f'About {lead:g} weeks to ship')
    mn = item.get('min_order_sqft') or 0
    fee = item.get('small_batch_fee')
    if mn >= RULES['min_order_poor_sqft']: add('Minimum order', 'poor', f'{mn:g} sq ft minimum order', None, f'{mn:g} sq ft minimum')
    elif mn >= RULES['min_order_care_sqft']: add('Minimum order', 'caution', f'{mn:g} sq ft minimum order')
    elif fee: add('Minimum order', 'caution', f"${fee['fee']} small-batch fee under {fee['below_sqft']} sq ft")
    else: add('Minimum order', 'good', 'No meaningful minimum')
    if item['kind'] != 'liner':
        sm = s.get('sample', 'unknown')
        if sm == 'sold': add('Sample', 'good', 'A sample is sold')
        elif sm == 'full-size-only': add('Sample', 'caution', 'Only a full-size sample is sold')
        elif sm == 'none': add('Sample', 'poor', 'No sample available', None, 'no sample')
        else: add('Sample', 'caution', 'Sample availability not stated')
    for f in s.get('care_flags', []): add('Judgment', 'caution', f)

    merged = {}
    for c in checks:
        k = (c['rule'], c['level'], c['detail'])
        if k in merged and c['use']:
            u = merged[k]['use']
            merged[k]['use'] = ', '.join(dict.fromkeys(((u + ', ') if u else '') .split(', ') [:-1] + [c['use']]))
        else:
            merged[k] = c
    checks = list(merged.values())

    level = rank(*[c['level'] for c in checks])
    tag = None
    if level == 'poor':
        short = next((c['short'] for c in checks if c['level'] == 'poor' and c.get('short')), None)
        use = next((c['use'] for c in checks if c['level'] == 'poor' and c['use']), None)
        tag = 'Poor fit' + (f' for {use}' if use and short in ('not frost resistant', f"DCOF under {RULES['dcof_min']}") else '') + (f': {short}' if short else '')
    return level, tag, checks


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else ''
    raw = DATA_PATH.read_text()
    data = json.loads(raw)
    errs = []
    for it in data['items']: errs += validate(it)
    if errs:
        print('\n'.join(errs)); sys.exit(1)
    for it in data['items']:
        level, tag, checks = rate(it)
        fit = it.setdefault('fit', {'notes': []})
        fit['level'] = level
        if tag: fit['tag'] = tag
        else: fit.pop('tag', None)
        fit['checks'] = checks
        if mode == '--report':
            print(f"{it['id']:4} {level:5} {tag or ''}")
            for c in checks:
                if c['level'] != 'good': print(f"       {c['level']:5} {c['rule']}: {c['detail']}")
    out = json.dumps(data, indent=1, ensure_ascii=True) + '\n'
    if mode == '--check':
        if out != raw:
            print('data.json is out of date: run python3 scripts/check_fit.py'); sys.exit(1)
        print('ok'); return
    if mode != '--report': DATA_PATH.write_text(out)


if __name__ == '__main__':
    main()
