#!/usr/bin/env python3
"""
실제 기출문제 → 저작권 안전 변형문제 배치 생성 스크립트

reads:  textbook/success_cards_moi/{unit}단원.json
        textbook/question-patterns/success/{unit}단원.json
writes: textbook/transformed-questions/success/{unit}단원.json
"""

import json
import os
import sys
import time
from pathlib import Path
from openai import OpenAI

BASE_DIR = Path(__file__).resolve().parent.parent.parent
CARDS_DIR = BASE_DIR / 'textbook' / 'success_cards_moi'
PATTERNS_DIR = BASE_DIR / 'textbook' / 'question-patterns' / 'success'
OUTPUT_DIR = BASE_DIR / 'textbook' / 'transformed-questions' / 'success'
BACKEND_DIR = BASE_DIR / 'backend'

client = OpenAI(api_key=os.environ.get('OPENAI_API_KEY') or '')
if not client.api_key:
    env_path = BACKEND_DIR / '.env'
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if line.startswith('OPENAI_API_KEY='):
                client.api_key = line.split('=', 1)[1].strip().strip('"').strip("'")
                break
if not client.api_key:
    print("ERROR: OPENAI_API_KEY not found")
    sys.exit(1)

PROMPT_TPL = """당신은 한국 수능(성공적인 직업생활 과목) 문항 출제 전문가입니다.
실제 기출문제 하나를 저작권 침해 우려가 없는 유사 변형문제로 변환해주세요.
결과는 JSON 형식으로만 출력하라.

## 핵심 원칙
1. 원본 문제의 출제 의도와 판단 축은 반드시 유지하라.
2. 원본 문제의 골격 구조(itemFamily, blankCount, boCount, choiceType)는 반드시 유지하라.
3. 구체적인 자료 내용, 인물명, 회사명, 숫자, 장소, 표현은 완전히 새롭게 창작하라.
4. 자료 형식(TPL)은 원본과 같거나 다른 것을 사용해도 무방하다.
5. 변형된 문제에 대한 완전한 분석(conceptHighlightV2)도 함께 생성하라.

## 입력 데이터
TARGET_CONCEPT_PH
SOURCE_PH
STEM_PH
STIMULUS_PH
BOX_PH
OPTIONS_PH
ANSWER_PH
PATTERN_PH

## 출력 JSON 구조
{{
  "sampleQuestion": {{
    "metadata": {{ "source_exam": "GAP 유사 변형문제", "target_concept": "...", "item_type": "실전 모의고사", "recommended_template": "TPL_..." }},
    "render_ready": {{
      "question_stem": "변형된 발문",
      "stimulus_data": {{ 완전히 새롭게 창작된 자료 }},
      "options_list": ["선지1", "선지2", "선지3", "선지4", "선지5"]
    }},
    "combo_block": (보기 있으면 {{ "title": "<보기>", "items": [{{"key": "ㄱ", "text": "..."}}] }}, 없으면 null),
    "correct_answer": 정수 1~5,
    "questionSource": "GAP 유사 변형문제",
    "questionNumber": 0,
    "rawStimulus": ""
  }},
  "conceptHighlightV2": {{
    "stimulusClues": [{{ "quote": "단서 문장", "why": "판단 근거" }}],
    "optionAnalysis": [{{ "optionNum": 1, "verdict": "O/X", "reasoning": "..." }}],
    "solvingFlow": [{{ "step": 1, "action": "..." }}],
    "takeaway": "핵심 교훈"
  }}
}}

## 주의
- render_ready에 explanation 필드 포함 금지
- stimulus_data는 완전히 새로운 내용으로, 원본 문장 재사용 금지
- 모든 분석은 변형된 문제 기준으로 새로 작성
- 정답 번호는 변형 내용에 맞게 자유롭게 결정
"""


def load_pattern(unit: int, concept_name: str) -> dict | None:
    p = PATTERNS_DIR / f'{unit}단원.json'
    if not p.exists():
        return None
    data = json.loads(p.read_text('utf-8'))
    for entry in data.get('patterns', []):
        et = entry.get('targetConcept', '')
        if et == concept_name or concept_name in et or et in concept_name:
            return entry.get('pattern', {})
    return None


def build_prompt(concept_name: str, qd: dict, pattern: dict | None) -> str:
    rr = qd.get('render_ready', {})
    meta = qd.get('metadata', {})
    box = qd.get('box_items', [])
    opts = rr.get('options_list', qd.get('options', []))

    stimulus_str = json.dumps(rr.get('stimulus_data', {}), ensure_ascii=False)
    if len(stimulus_str) > 2500:
        stimulus_str = stimulus_str[:2500] + '...(truncated)'

    prompt = PROMPT_TPL
    prompt = prompt.replace('TARGET_CONCEPT_PH', f'- target_concept: {concept_name}')
    prompt = prompt.replace('SOURCE_PH', f'- 출처: {meta.get("source_exam", qd.get("source_exam", "unknown"))}')
    prompt = prompt.replace('STEM_PH', f'- 발문: {rr.get("question_stem", qd.get("stem", ""))}')
    prompt = prompt.replace('STIMULUS_PH', f'- 자료: {stimulus_str}')
    prompt = prompt.replace('BOX_PH', f'- 보기: {json.dumps(box, ensure_ascii=False)}')
    prompt = prompt.replace('OPTIONS_PH', f'- 선택지: {json.dumps(opts, ensure_ascii=False)}')
    prompt = prompt.replace('ANSWER_PH', f'- 정답: {qd.get("answer", meta.get("correct_answer", ""))}')
    prompt = prompt.replace('PATTERN_PH', f'- 패턴 정보: {json.dumps(pattern, ensure_ascii=False) if pattern else "없음"}')

    return prompt


def transform_question(concept_name: str, qd: dict, pattern: dict | None) -> dict | None:
    prompt = build_prompt(concept_name, qd, pattern)
    for attempt in range(3):
        try:
            resp = client.chat.completions.create(
                model='gpt-4o-mini',
                messages=[{'role': 'user', 'content': prompt}],
                temperature=0.7,
                response_format={'type': 'json_object'},
            )
            content = resp.choices[0].message.content
            return json.loads(content) if content else None
        except Exception as e:
            print(f'  retry {attempt+1}: {e}', file=sys.stderr)
            time.sleep(2 ** attempt)
    return None


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    unit_files = sorted(CARDS_DIR.glob('[0-9]*단원.json'))
    total_ok, total_fail = 0, 0

    for filepath in unit_files:
        data = json.loads(filepath.read_text('utf-8'))
        unit = data.get('unit', 0)
        unit_title = data.get('unitTitle', '')
        concepts = data.get('concepts', [])
        print(f'\n=== {unit}단원: {unit_title} ===')

        results = []
        for concept in concepts:
            if not concept.get('realQuestion') or not isinstance(concept['realQuestion'], dict):
                continue
            qd = concept['realQuestion'].get('questionData', {})
            if not qd:
                continue

            cn = concept.get('name', '')
            pattern = load_pattern(unit, cn)
            print(f'  [{cn[:30]}]...', end=' ', flush=True)

            result = transform_question(cn, qd, pattern)
            if result and 'sampleQuestion' in result:
                results.append({
                    'conceptName': cn,
                    'originalSource': qd.get('metadata', {}).get('source_exam', qd.get('source_exam', 'unknown')),
                    'sampleQuestion': result['sampleQuestion'],
                    'conceptHighlightV2': result.get('conceptHighlightV2'),
                })
                total_ok += 1
                print('OK')
            else:
                total_fail += 1
                print('FAIL')

            time.sleep(1)

        if results:
            output = {
                'unit': unit,
                'unitTitle': unit_title,
                'subject': 'success',
                'totalQuestions': len(results),
                'questions': results,
            }
            (OUTPUT_DIR / f'{unit}단원.json').write_text(
                json.dumps(output, ensure_ascii=False, indent=2), 'utf-8')
            print(f'  -> saved {len(results)}')

    print(f'\n=== Complete: OK={total_ok}, FAIL={total_fail} ===')


if __name__ == '__main__':
    main()
