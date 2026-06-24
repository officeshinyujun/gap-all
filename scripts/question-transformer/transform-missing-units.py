#!/usr/bin/env python3
"""Generate transformed questions for missing concepts in units 12 and 16."""

import json
import os
import sys
import time
import re
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

PROMPT_TPL = """당신은 한국 수능(성공적인 직업생활 과목) 문항 출제 전문가입니다.
주어진 개념 정보를 바탕으로 실제 수능형 문항 1개를 생성해주세요.
결과는 JSON 형식으로만 출력하라.

## 핵심 원칙
1. 문제는 실제 수능/모의평가에 나올 법한 형식과 난이도로 출제하라.
2. 발문은 구체적인 상황(사례, 표, 대화, 기사, 가상 면접 등)을 제시하고, 이를 분석하여 답을 고르는 형태로 구성하라.
3. 선택지는 5지선다형(①~⑤)으로, 함정 선지를 포함하되 논리적으로 구성하라.
4. 자료(표, 대화, 보기 등)는 완전히 새롭게 창작하라.
5. 해당 개념의 핵심 출제 포인트를 정확히 평가할 수 있도록 설계하라.
6. (단, 소정근로시간은 1일 8시간, 1주 40시간이며, 연장근로는 당사자 간 합의 시 1주 12시간 한도로 가능함)
7. 콤보블록(보기)이 있는 문제를 적극 활용하라.

## 개념 정보
CONCEPT_DEFINITION_PH
CONCEPT_KEYPOINTS_PH
CONCEPT_CAUTION_PH

## 출력 JSON 구조
{{
  "sampleQuestion": {{
    "metadata": {{ "source_exam": "GAP 유사 변형문제", "target_concept": "...", "item_type": "실전 모의고사", "recommended_template": "TPL_..." }},
    "render_ready": {{
      "question_stem": "발문",
      "stimulus_data": {{ ... }},
      "options_list": ["① ...", "② ...", "③ ...", "④ ...", "⑤ ..."]
    }},
    "combo_block": null,
    "correct_answer": 정수 1~5,
    "questionSource": "GAP 유사 변형문제",
    "questionNumber": 0,
    "rawStimulus": ""
  }},
  "conceptHighlightV2": {{
    "stimulusClues": [{{ "quote": "자료 속 단서 문장", "why": "판단 근거" }}],
    "optionAnalysis": [{{ "optionNum": 1, "verdict": "O/X", "reasoning": "설명" }}],
    "solvingFlow": [{{ "step": 1, "action": "..." }}],
    "takeaway": "핵심 교훈"
  }}
}}

## 주의
- render_ready에 explanation 필드 포함 금지
- stimulus_data는 null이 아닌 구체적인 내용으로 구성
- 정답 번호는 문제 설계에 맞게 자유롭게 결정
"""


def load_pattern(unit: int, concept_name: str) -> dict | None:
    p = BASE_DIR / 'textbook' / 'question-patterns' / 'success' / f'{unit}단원.json'
    if not p.exists():
        return None
    data = json.loads(p.read_text('utf-8'))
    best_entry = None
    best_score = 0
    for entry in data.get('patterns', []):
        et = entry.get('targetConcept', '')
        if et == concept_name:
            return entry.get('pattern', {})
        # fuzzy match pattern name to concept
        a = re.sub(r'[^가-힣]', '', et)
        b = re.sub(r'[^가-힣]', '', concept_name)
        if a and b:
            max_len = 0
            for i in range(len(a)):
                for j in range(len(b)):
                    k = 0
                    while i + k < len(a) and j + k < len(b) and a[i+k] == b[j+k]:
                        k += 1
                    if k > max_len:
                        max_len = k
            score = max_len / max(len(a), len(b), 1)
            if score > best_score:
                best_score = score
                best_entry = entry.get('pattern', {})
    return best_entry if best_score >= 0.2 else None


def build_prompt(unit: int, card: dict) -> str:
    concept_name = card['name']
    definition = card.get('card', {}).get('definition', '')
    keypoints = card.get('card', {}).get('keyPoints', [])
    caution = card.get('caution', '')
    pattern = load_pattern(unit, concept_name)

    prompt = PROMPT_TPL
    prompt = prompt.replace('CONCEPT_DEFINITION_PH',
        f'- 개념명: {concept_name}\n- 정의: {definition}')
    prompt = prompt.replace('CONCEPT_KEYPOINTS_PH',
        f'- 핵심 포인트:\n' + '\n'.join(f'  * {k}' for k in keypoints))
    prompt = prompt.replace('CONCEPT_CAUTION_PH',
        f'- 오답 주의: {caution}')
    if pattern:
        prompt += f'\n\n## 참고 출제 패턴\n{json.dumps(pattern, ensure_ascii=False)[:800]}'
    return prompt


def generate_question(card: dict, unit: int) -> dict | None:
    prompt = build_prompt(unit, card)
    for attempt in range(3):
        try:
            resp = client.chat.completions.create(
                model=MODEL,
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
    # Missing concepts per unit
    missing = {
        12: ["직무 문서의 개념, 종류 및 특징"],
        16: ["부당 해고, 징계 및 노동 행위", "임금 체불", "직장 내 성희롱"],
    }

    for unit, names in missing.items():
        cards_file = BASE_DIR / 'textbook' / 'success_cards_moi' / f'{unit}단원.json'
        tq_file = BASE_DIR / 'textbook' / 'transformed-questions' / 'success' / f'{unit}단원.json'

        cards_data = json.loads(cards_file.read_text('utf-8'))
        concepts = {c['name']: c for c in cards_data.get('concepts', [])}

        existing = json.loads(tq_file.read_text('utf-8'))
        existing_names = {q['conceptName'] for q in existing.get('questions', [])}

        new_questions = []
        for name in names:
            if name in existing_names:
                print(f'Unit {unit}: SKIP {name} (already exists)')
                continue
            card = concepts.get(name)
            if not card:
                print(f'Unit {unit}: SKIP {name} (not found in cards)')
                continue

            print(f'Unit {unit}: Generating for: {name}...', end=' ', flush=True)
            result = generate_question(card, unit)
            if result and 'sampleQuestion' in result:
                new_questions.append({
                    'conceptName': name,
                    'originalSource': 'GAP AI 생성 (개념 기반)',
                    'sampleQuestion': result['sampleQuestion'],
                    'conceptHighlightV2': result.get('conceptHighlightV2'),
                })
                print('OK')
            else:
                print('FAIL')
            time.sleep(2)

        if new_questions:
            existing['questions'].extend(new_questions)
            existing['totalQuestions'] = len(existing['questions'])
            tq_file.write_text(json.dumps(existing, ensure_ascii=False, indent=2), 'utf-8')
            print(f'  -> Added {len(new_questions)} questions. Total: {len(existing["questions"])}')

    print('\nDone.')


if __name__ == '__main__':
    main()
