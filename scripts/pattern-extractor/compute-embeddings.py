#!/usr/bin/env python3
"""
실제 기출문제 embedding 사전 계산

reads:  textbook/success_cards_moi/*.json + _step5_realquestions.json
writes: textbook/question-patterns/success/embeddings.json
"""

import json
import os
import sys
import time
from pathlib import Path
from openai import OpenAI

BASE_DIR = Path(__file__).resolve().parent.parent.parent
TEXTBOOK_DIR = BASE_DIR / 'textbook' / 'success_cards_moi'
OUTPUT_DIR = BASE_DIR / 'textbook' / 'question-patterns' / 'success'
BACKEND_DIR = BASE_DIR / 'backend'

client = OpenAI(
    api_key=os.environ.get('OPENAI_API_KEY') or ''
)

if not client.api_key:
    env_path = BACKEND_DIR / '.env'
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line.startswith('OPENAI_API_KEY='):
                key = line.split('=', 1)[1].strip().strip('"').strip("'")
                client.api_key = key
                break

if not client.api_key:
    print("ERROR: OPENAI_API_KEY not found")
    sys.exit(1)

MODEL = 'text-embedding-3-small'


def collect_all_questions():
    """Collect all real question texts from success_cards_moi and step5."""
    questions = []

    # 1. From unit JSONs (success_cards_moi/*.json)
    for f in sorted(TEXTBOOK_DIR.glob('[0-9]*단원.json')):
        data = json.loads(f.read_text('utf-8'))
        unit = data.get('unit', 0)
        for c in data.get('concepts', []):
            if not c.get('realQuestion') or not isinstance(c['realQuestion'], dict):
                continue
            qd = c['realQuestion'].get('questionData', {})
            if not qd:
                continue
            text = build_text(qd)
            if text:
                questions.append({
                    'id': f'unit_{unit}_{c.get("id", "")}',
                    'unit': unit,
                    'concept': c.get('name', ''),
                    'source': qd.get('metadata', {}).get('source_exam', qd.get('source_exam', '')),
                    'text': text,
                })

    # 2. From step5 (covers unit 9 which missing in unit JSON)
    step5_path = TEXTBOOK_DIR / '_step5_realquestions.json'
    if step5_path.exists():
        step5 = json.loads(step5_path.read_text('utf-8'))
        for unit_key, concepts in step5.items():
            unit = int(unit_key)
            for concept_name, item in concepts.items():
                qd = item.get('questionData', {})
                if not qd:
                    continue
                text = build_text(qd)
                if text:
                    # Deduplicate by checking if same text already exists
                    is_dup = any(q['text'] == text for q in questions)
                    if not is_dup:
                        meta = qd.get('metadata', {})
                        questions.append({
                            'id': f'step5_u{unit}_{concept_name[:30]}',
                            'unit': unit,
                            'concept': concept_name,
                            'source': meta.get('source_exam', qd.get('source_exam', '')),
                            'text': text,
                        })

    return questions


def build_text(qd: dict) -> str:
    """Build comparison text from question data."""
    rr = qd.get('render_ready', {})
    parts = [
        rr.get('question_stem', qd.get('stem', '')),
    ]
    sd = rr.get('stimulus_data', {})
    if sd:
        parts.append(json.dumps(sd, ensure_ascii=False))
    opts = rr.get('options_list', qd.get('options', []))
    if opts:
        parts.append(' '.join(str(o) for o in opts))
    box = qd.get('box_items', [])
    if box:
        parts.append(' '.join(str(b) for b in box))

    text = ' '.join(parts).strip()
    if len(text) < 20:
        return ''
    return text


def compute_embeddings(texts: list[str], batch_size: int = 20):
    """Compute embeddings in batches."""
    all_embeddings = []
    for i in range(0, len(texts), batch_size):
        batch = texts[i:i + batch_size]
        print(f'  Embedding batch {i // batch_size + 1}/{(len(texts) + batch_size - 1) // batch_size}...')
        for attempt in range(3):
            try:
                resp = client.embeddings.create(model=MODEL, input=batch)
                all_embeddings.extend([e.embedding for e in resp.data])
                break
            except Exception as e:
                print(f'  Retry {attempt + 1}: {e}')
                time.sleep(2 ** attempt)
        else:
            print(f'  Failed to embed batch {i // batch_size + 1}')
            return None
        time.sleep(0.5)
    return all_embeddings


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    print('Collecting all real questions...')
    questions = collect_all_questions()
    print(f'Collected {len(questions)} questions')

    texts = [q['text'] for q in questions]
    print(f'Computing embeddings ({MODEL})...')
    embeddings = compute_embeddings(texts)

    if not embeddings:
        print('Failed to compute embeddings')
        sys.exit(1)

    # Save
    output = {
        'model': MODEL,
        'totalQuestions': len(questions),
        'questions': [
            {
                'id': q['id'],
                'unit': q['unit'],
                'concept': q['concept'],
                'source': q['source'],
                'text': q['text'][:200],  # store preview only
                'embedding': emb,
            }
            for q, emb in zip(questions, embeddings)
        ],
    }

    out_path = OUTPUT_DIR / 'embeddings.json'
    out_path.write_text(json.dumps(output, ensure_ascii=False), 'utf-8')
    print(f'\nSaved {len(questions)} embeddings to {out_path}')
    print(f'File size: {out_path.stat().st_size / 1024 / 1024:.1f} MB')


if __name__ == '__main__':
    main()
