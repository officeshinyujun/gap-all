#!/usr/bin/env python3
"""Fix missing originalSource in transformed questions by looking up step5 data."""

import json
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent.parent
TQ_DIR = BASE_DIR / 'textbook' / 'transformed-questions' / 'success'
STEP5_FILE = BASE_DIR / 'textbook' / 'success_cards_moi' / '_step5_realquestions.json'

step5 = json.loads(STEP5_FILE.read_text('utf-8'))

# Build lookup: concept_name -> source_exam
source_map = {}
for unit_str, concepts in step5.items():
    for cn, entry in concepts.items():
        # step5 data: may be list (other units) or dict (unit 9, etc.)
        if isinstance(entry, list):
            q = entry[0] if entry else None
        else:
            q = entry
        if not q:
            continue
        qd = q.get('questionData', {})
        if not qd:
            qd = q  # fallback: entry itself is questionData
        src = qd.get('questionSource', '') or ''
        if src:
            source_map[cn] = src

for unit in range(1, 21):
    f = TQ_DIR / f'{unit}단원.json'
    if not f.exists():
        continue
    data = json.loads(f.read_text('utf-8'))
    changed = False
    for q in data.get('questions', []):
        if not q.get('originalSource') or q['originalSource'] == '?' or q['originalSource'] == 'unknown':
            cn = q['conceptName']
            if cn in source_map:
                q['originalSource'] = source_map[cn]
                changed = True
            else:
                # Also try matching via step5 key (step5 has full concept names)
                for step5_cn, src in source_map.items():
                    if cn in step5_cn or step5_cn in cn:
                        q['originalSource'] = src
                        changed = True
                        break
    if changed:
        f.write_text(json.dumps(data, ensure_ascii=False, indent=2), 'utf-8')
        print(f'Unit {unit}: updated')
