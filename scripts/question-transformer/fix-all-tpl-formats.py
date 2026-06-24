#!/usr/bin/env python3
"""Fix all stimulus_data to match proper TPL template formats."""

import json
import os
import sys
import time
import re
from pathlib import Path
from openai import OpenAI

BASE_DIR = Path(__file__).resolve().parent.parent.parent
TQ_DIR = BASE_DIR / 'textbook' / 'transformed-questions' / 'success'
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

FIX_PROMPT = """당신은 한국 수능(성공적인 직업생활 과목) 문항 포맷 전문가입니다.
아래 문항의 stimulus_data(자료)를 분석하여, 프론트엔드에서 렌더링 가능한 TPL 템플릿 형식으로 변환해주세요.

## 문제 정보
STEM: {stem}
CURRENT_STIMULUS: {stimulus}
OPTIONS: {options}
COMBO_BLOCK: {combo_block}

## 사용 가능한 TPL 템플릿
1. **TPL_PLAIN_TEXT**: 단순 텍스트 → stimulus_data를 {{"content": "텍스트"}} 형태로
2. **TPL_COMPARATIVE_MATRIX**: 비교 표 → {{"title": "...", "headers": ["col1","col2",...], "rows": [["r1c1","r1c2",...],...]}}
3. **TPL_FORMAL_DOCUMENT**: 공식 문서 → {{"doc_type": "...", "header_info": {{...}}, "paragraphs": ["...",...]}}
4. **TPL_CONVERSATIONAL_FLOW**: 대화문 → {{"participants": [{{"id":"A","name":"...","role":"..."}}], "messages": [{{"participant_id":"A","text":"...","timestamp":""}}]}}
5. **TPL_CASE_DIAGNOSTIC_FRAME**: 사례 진단 → {{"case_profile": {{"title":"...","field1":"..."}}, "narrative": "사례 설명", "check_items": [{{"id":1,"text":"...","answer":true/false}}]}}
6. **TPL_SEQUENTIAL_WORKFLOW**: 순서도 → {{"orientation":"수직","steps":[{{"id":1,"title":"...","description":"..."}}]}}
7. **TPL_INSTRUCTIONAL_SCENE**: 수업 장면 → {{"instructor":"...","canvas_content":"...","students":[{{"id":"...","comment":"..."}}]}}
8. **TPL_DIGITAL_FORUM_INTERFACE**: 게시판 → {{"forum_name":"...","main_post":{{"author":"...","content":"..."}}}}
9. **TPL_QUANTITATIVE_CHART**: 차트 → {{"chart_type":"bar/line/pie","axes":{{"x":"...","y":"..."}},"datasets":[{{"label":"...","values":[...]}}]}}
10. **TPL_PROMOTIONAL_CANVAS**: 광고문 → {{"slogan":"...","bullets":["...",...]}}

## 지시
1. CURRENT_STIMULUS의 내용을 분석하여 가장 적합한 TPL 템플릿을 선택하세요.
2. stimulus_data를 해당 템플릿 형식으로 완전히 변환하세요.
3. 내용은 원본에서 바꾸지 말고 구조만 변경하세요.
4. 선택한 템플릿명을 recommended_template에 설정하세요.
5. 콤보블록(보기)이 필요한 문제라면 combo_block도 함께 구성해주세요.

## 출력 형식 (JSON)
{{
  "stimulus_data": {{ ... }},
  "recommended_template": "TPL_...",
  "combo_block": null 또는 {{"title":"<보기>","items":[{{"key":"ㄱ","text":"..."}}]}},
  "question_stem": "발문 (combo_block 추가 시 보기 참조 문구 포함)",
}}
"""

KNOWN_TEMPLATES = [
    ['headers', 'rows'],
    ['doc_type', 'header_info', 'paragraphs'],
    ['participants', 'messages'],
    ['case_profile', 'narrative', 'check_items'],
    ['orientation', 'steps'],
    ['instructor', 'canvas_content', 'students'],
    ['forum_name', 'main_post'],
    ['chart_type', 'axes', 'datasets'],
    ['slogan', 'bullets'],
]


def has_valid_template(sd: dict) -> bool:
    if not sd or not isinstance(sd, dict):
        return True
    keys = list(sd.keys())
    if 'content' in keys:
        return True
    return any(all(k in keys for k in tk) for tk in KNOWN_TEMPLATES)


def fix_via_ai(unit: int, q: dict) -> dict | None:
    sq = q.get('sampleQuestion', {})
    rr = sq.get('render_ready', {})
    stem = rr.get('question_stem', '')
    sd = rr.get('stimulus_data', {})
    opts = rr.get('options_list', [])
    cb = sq.get('combo_block')

    prompt = FIX_PROMPT.format(
        stem=stem[:500],
        stimulus=json.dumps(sd, ensure_ascii=False)[:1500],
        options=json.dumps(opts, ensure_ascii=False)[:500],
        combo_block=json.dumps(cb, ensure_ascii=False)[:500] if cb else 'null',
    )

    for attempt in range(3):
        try:
            resp = client.chat.completions.create(
                model='gpt-4o-mini',
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

    for unit in range(1, 21):
        f = TQ_DIR / f'{unit}단원.json'
        if not f.exists(): continue
        data = json.loads(f.read_text('utf-8'))
        changed = False

        for q in data.get('questions', []):
            sq = q.get('sampleQuestion', {})
            rr = sq.get('render_ready', {})
            sd = rr.get('stimulus_data')
            if not sd or not isinstance(sd, dict):
                continue
            if has_valid_template(sd):
                continue

            print(f'Unit {unit}: fixing {q["conceptName"][:40]}...', end=' ', flush=True)
            result = fix_via_ai(unit, q)
            if result and 'stimulus_data' in result:
                rr['stimulus_data'] = result['stimulus_data']
                if result.get('recommended_template'):
                    if 'metadata' not in sq:
                        sq['metadata'] = {}
                    sq['metadata']['recommended_template'] = result['recommended_template']
                if result.get('combo_block'):
                    sq['combo_block'] = result['combo_block']
                if result.get('question_stem'):
                    rr['question_stem'] = result['question_stem']
                changed = True
                total_fixed += 1
                print('OK')
            else:
                print('FAIL')
            time.sleep(2)

        if changed:
            f.write_text(json.dumps(data, ensure_ascii=False, indent=2), 'utf-8')

    print(f'\nDone: {total_fixed} questions fixed')


if __name__ == '__main__':
    main()
