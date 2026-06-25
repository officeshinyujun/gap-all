#!/usr/bin/env python3
"""Update only frequency field in unit JSON files using step3 redistribution."""
import json, re
from pathlib import Path
from collections import defaultdict

BASE = Path(__file__).resolve().parent.parent.parent / 'textbook' / 'success_cards_moi'
YEAR_WEIGHTS = {2027: 1.5, 2026: 1.5, 2025: 1.5, 2024: 1.3, 2023: 1.1, 2022: 1.0, 2021: 0.8}

extracted = json.loads((BASE / '_step2_extracted.json').read_text())

# Step 1: Run redistribution
uc = defaultdict(dict)
for item in extracted:
    if "error" in item: continue
    u = item.get("unit", 0)
    for c in item.get("primary_concepts", []) + item.get("secondary_concepts", []):
        if c not in uc[u]: uc[u][c] = {"count": 0.0}

for item in extracted:
    if "error" in item: continue
    u = item.get("unit", 0)
    src = item.get("source_exam", "")
    yr = next((y for y in YEAR_WEIGHTS if str(y) in src), None)
    w = YEAR_WEIGHTS.get(yr, 1.0)
    prim = [c for c in item.get("primary_concepts", []) if c in uc[u]]
    sec = [c for c in item.get("secondary_concepts", []) if c in uc[u]]
    for c in prim: uc[u][c]["count"] += w / max(len(prim), 1)
    for c in sec: uc[u][c]["count"] += (w * 0.5) / max(len(sec), 1)

# Normalize: map step3 concept names to card concept names by keyword overlap
def extract_kw(name):
    return set(re.sub(r'[^가-힣0-9a-zA-Z]', ' ', name).split())

for unit in range(1, 21):
    f = BASE / f'{unit}단원.json'
    if not f.exists(): continue
    data = json.loads(f.read_text())
    step3 = uc.get(unit, {})
    changed = False

    for c in data.get('concepts', []):
        cn = c['name']
        c_kw = extract_kw(cn)
        best_score, best_count = 0, 0
        for s3_name, s3_data in step3.items():
            s3_kw = extract_kw(s3_name)
            overlap = c_kw & s3_kw
            score = len(overlap) / max(len(c_kw | s3_kw), 1)
            if score > best_score and score >= 0.15:
                best_score = score
                best_count = s3_data["count"]

        if best_count > 0:
            new_freq = round(best_count, 1)
            if c['frequency'] != new_freq:
                c['frequency'] = new_freq
                changed = True

    if changed:
        # Re-sort by frequency
        data['concepts'].sort(key=lambda x: -x['frequency'])
        for i, c in enumerate(data['concepts']):
            c['rank'] = i + 1
        f.write_text(json.dumps(data, ensure_ascii=False, indent=2), 'utf-8')
        print(f"Unit {unit}: updated")

print("Done")
PYEOF