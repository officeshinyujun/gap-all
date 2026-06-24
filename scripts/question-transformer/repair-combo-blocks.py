#!/usr/bin/env python3
"""Repair missing combo_block in transformed questions that reference <보기>."""

import json
import os
import sys
import time
from pathlib import Path
from openai import OpenAI

BASE_DIR = Path(__file__).resolve().parent.parent.parent
BACKEND_DIR = BASE_DIR / 'backend'

client = OpenAI(api_key=os.environ.get('OPENAI_API_KEY') or '')
if not client.api_key:
    env_path = BACKEND_DIR / '.env'
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line.startswith('OPENAI_API_KEY='):
                client.api_key = line.split('=', 1)[1].strip().strip('"').strip("'")
if not client.api_key:
    print("ERROR: OPENAI_API_KEY not found")
    sys.exit(1)

MODEL = 'gpt-4o-mini'
TQ_DIR = BASE_DIR / 'textbook' / 'transformed-questions' / 'success'

REPAIR_PROMPT = """당신은 한국 수능(성공적인 직업생활 과목) 문항 전문가입니다.
아래 기출 변형문제를 분석하여 <보기> 항목(ㄱ, ㄴ, ㄷ, ㄹ)을 추출하거나 새로 만들어주세요.

## 입력: 변형문제 데이터
STEM: {stem}
STIMULUS: {stimulus}
OPTIONS: {options}
COMBO_BLOCK: null

## 지시
1. 문제의 발문에 '<보기>에서 고른 것은?' 또는 유사 표현이 있으면, 보기에 해당하는 항목(ㄱ, ㄴ, ㄷ, ㄹ)을 찾거나 생성하세요.
2. 보기 항목은 자료(stimulus)의 내용을 바탕으로 논리적으로 구성하세요.
3. 이미 stem이나 stimulus에 보기 항목이 포함되어 있다면 이를 추출하세요.
4. 보기가 필요없는 문제(단순 5지선다)라면 null을 반환하세요.

## 출력 형식 (JSON)
{{
  "combo_block": {{
    "title": "<보기>",
    "items": [
      {{"key": "ㄱ", "text": "..."}},
      {{"key": "ㄴ", "text": "..."}},
      {{"key": "ㄷ", "text": "..."}},
      {{"key": "ㄹ", "text": "..."}}
    ]
  }}
}}

보기가 필요없으면: {{"combo_block": null}}
"""


def repair_combo_block(stem: str, stimulus, options) -> dict | None:
    stim_str = json.dumps(stimulus, ensure_ascii=False)[:1200] if stimulus else 'null'
    opts_str = json.dumps(options, ensure_ascii=False)[:800] if options else '[]'
    prompt = REPAIR_PROMPT.format(stem=stem, stimulus=stim_str, options=opts_str)

    for attempt in range(3):
        try:
            resp = client.chat.completions.create(
                model=MODEL,
                messages=[{'role': 'user', 'content': prompt}],
                temperature=0.3,
                response_format={'type': 'json_object'},
            )
            content = resp.choices[0].message.content
            return json.loads(content) if content else None
        except Exception as e:
            print(f'  retry {attempt+1}: {e}', file=sys.stderr)
            time.sleep(2 ** attempt)
    return None


def main():
    total_fixed = 0
    total_skipped = 0

    for unit in range(1, 21):
        f = TQ_DIR / f'{unit}단원.json'
        if not f.exists():
            continue

        data = json.loads(f.read_text('utf-8'))
        changed = False

        for q in data.get('questions', []):
            sq = q.get('sampleQuestion', {})
            stem = sq.get('render_ready', {}).get('question_stem', '')
            if '<보기>' not in stem:
                continue
            cb = sq.get('combo_block')
            if cb and cb != {}:
                continue  # already has combo_block

            stimulus = sq.get('render_ready', {}).get('stimulus_data')
            options = sq.get('render_ready', {}).get('options_list')

            print(f'Unit {unit}: {q["conceptName"][:40]}...', end=' ', flush=True)
            result = repair_combo_block(stem, stimulus, options)

            if result and result.get('combo_block'):
                sq['combo_block'] = result['combo_block']
                changed = True
                total_fixed += 1
                print('FIXED')
            else:
                total_skipped += 1
                print('SKIP (no combo needed)')

            time.sleep(1.5)

        if changed:
            f.write_text(json.dumps(data, ensure_ascii=False, indent=2), 'utf-8')
            print(f'  -> Unit {unit} saved')

    print(f'\nDone: {total_fixed} fixed, {total_skipped} skipped (no combo needed)')


if __name__ == '__main__':
    main()
