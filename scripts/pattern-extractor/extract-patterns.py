#!/usr/bin/env python3
"""
성직(성공적인 직업생활) 기출문제 패턴 추출기

reads:  textbook/success_cards_moi/{unit}단원.json
writes: textbook/question-patterns/success/{unit}단원.json

각 실제 기출문제에서 다음 패턴 정보를 GPT-4o-mini로 추출:
- assessmentIntent (출제 의도)
- judgmentAxis (판단 축)
- skeletonStructure (골격 구조)
- distractorBlueprint (오답 전략)
- difficultyDriver (난이도 결정 요인)
- stemPattern (발문 패턴)
"""

import json
import os
import glob
import time
import sys
from pathlib import Path
from openai import OpenAI

BASE_DIR = Path(__file__).resolve().parent.parent.parent
TEXTBOOK_DIR = BASE_DIR / 'textbook' / 'success_cards_moi'
OUTPUT_DIR = BASE_DIR / 'textbook' / 'question-patterns' / 'success'
BACKEND_DIR = BASE_DIR / 'backend'

client = OpenAI(
    api_key=os.environ.get('OPENAI_API_KEY') or os.environ.get('GAP_OPENAI_KEY')
)

# If env var not set, try loading from backend .env
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
    print("ERROR: OPENAI_API_KEY not found. Set it as env var or in backend/.env")
    sys.exit(1)

PATTERN_EXTRACTION_PROMPT = """당신은 한국 수능(성공적인 직업생활 과목) 문항 출제 패턴 분석 전문가입니다.
실제 기출문제 하나를 분석하여 구조화된 패턴 메타데이터를 추출해주세요.

분석할 문제 정보:
- 과목: 성공적인 직업생활 (success)
- target_concept: {target_concept}
- 문제 출처: {source_exam}

[원본 문항 데이터]
- question_stem(발문): {question_stem}
- stimulus_data(자료): {stimulus_data}
- box_items(보기/선택지 구조): {box_items}
- options_list(선택지 목록): {options_list}
- correct_answer(정답): {correct_answer}
- metadata(메타데이터): {metadata}

다음 JSON 형식으로만 출력하세요 (설명이나 마크다운 없이 순수 JSON만):
{{
  "assessmentIntent": "이 문제가 평가하려는 핵심 능력/개념을 1-2문장으로 서술",
  "judgmentAxis": "문제가 요구하는 사고 과정 유형 (예: 분류/매칭, 비교/대조, 원리 적용, 사례 분석, 빈칸 추론, 자료 해석, 개념 변별 등)",
  "skeletonStructure": {{
    "itemFamily": "combination_judgment | single_selection | direct_statement | blank_workflow | label_matching | exhaustive_subset | pair_selection 중 선택",
    "stimulusTPL": "자료 제시에 사용된 TPL (TPL_FORMAL_DOCUMENT, TPL_CONVERSATIONAL_FLOW, TPL_COMPARATIVE_MATRIX, TPL_CASE_DIAGNOSTIC_FRAME, TPL_SEQUENTIAL_WORKFLOW, TPL_INSTRUCTIONAL_SCENE, TPL_DIGITAL_FORUM_INTERFACE, TPL_QUANTITATIVE_CHART, TPL_PROMOTIONAL_CANVAS 중 선택, 없다면 null)",
    "blankCount": "자료 내 빈칸((가)~(다) 등) 개수 (없으면 0)",
    "boCount": "보기(ㄱ~ㄹ) 개수 (없으면 0)",
    "choiceType": "truth_combination(진리조합형) | independent_options(독립선택형) | single_correct(단일정답형)",
    "choiceCount": "선택지 개수 (보통 5)",
    "hasComboBlock": "보기 블록 존재 여부 (true/false)"
  }},
  "distractorBlueprint": [
    "오답1: 어떤 방식으로 오답을 구성했는지 설명",
    "오답2: ...",
    "(모든 오답 전략을 빠짐없이)"
  ],
  "difficultyDriver": "이 문제의 난이도를 결정짓는 핵심 요소 (예: 정보 분산, 다중 조건, 유사 개념 변별, 추론 단계 수 등)",
  "stemPattern": "발문의 전형적 패턴 (예: '다음 [자료명]의 (가)~(다)에 대한 설명으로 옳은 것만을 <보기>에서 고른 것은?')"
}}

분석 시 유의사항:
- assessmentIntent는 단순히 개념명을 나열하지 말고, '무엇을 할 수 있는지'를 평가하는지 구체적으로 서술
- distractorBlueprint는 문제의 모든 오답 선지가 어떤 전략으로 설계되었는지 빠짐없이 분석
- skeletonStructure는 문제의 겉모양이 아닌 실제 논리 구조를 기준으로 판단
- judgmentAxis는 하나의 축으로 요약하되 필요시 '하위 유형'도 포함"""


def load_unit(filepath: Path) -> dict | None:
    try:
        data = json.loads(filepath.read_text(encoding='utf-8'))
        if isinstance(data, dict):
            return data
        return None
    except (json.JSONDecodeError, Exception):
        return None


def extract_pattern(question_data: dict, target_concept: str) -> dict | None:
    render_ready = question_data.get('render_ready', {})
    metadata = question_data.get('metadata', {})
    box_items = question_data.get('box_items', [])

    stimulus_data_str = json.dumps(render_ready.get('stimulus_data', {}), ensure_ascii=False)
    if len(stimulus_data_str) > 3000:
        stimulus_data_str = stimulus_data_str[:3000] + '...(truncated)'

    prompt = PATTERN_EXTRACTION_PROMPT.format(
        target_concept=target_concept,
        source_exam=metadata.get('source_exam', question_data.get('source_exam', 'unknown')),
        question_stem=render_ready.get('question_stem', question_data.get('stem', '')),
        stimulus_data=stimulus_data_str,
        box_items=json.dumps(box_items, ensure_ascii=False),
        options_list=json.dumps(render_ready.get('options_list', question_data.get('options', [])), ensure_ascii=False),
        correct_answer=str(question_data.get('answer', metadata.get('correct_answer', ''))),
        metadata=json.dumps(metadata, ensure_ascii=False),
    )

    max_retries = 3
    for attempt in range(max_retries):
        try:
            response = client.chat.completions.create(
                model='gpt-4o-mini',
                messages=[{'role': 'user', 'content': prompt}],
                temperature=0.1,
                response_format={'type': 'json_object'},
            )
            content = response.choices[0].message.content
            if not content:
                raise ValueError('Empty response')

            result = json.loads(content)

            required_keys = [
                'assessmentIntent', 'judgmentAxis', 'skeletonStructure',
                'distractorBlueprint', 'difficultyDriver', 'stemPattern'
            ]
            for k in required_keys:
                if k not in result:
                    print(f'  Warning: missing key "{k}" in GPT response')

            return result

        except Exception as e:
            print(f'  Attempt {attempt + 1}/{max_retries} failed: {e}')
            if attempt < max_retries - 1:
                time.sleep(2 ** attempt)
            else:
                print(f'  Failed to extract pattern after {max_retries} attempts')
                return None


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    unit_files = sorted(glob.glob(str(TEXTBOOK_DIR / '[0-9]*단원.json')))

    total_questions = 0
    extracted = 0
    skipped = 0

    for filepath_str in unit_files:
        filepath = Path(filepath_str)
        unit_data = load_unit(filepath)

        if unit_data is None:
            print(f'Skipping {filepath.name}: not a valid unit dict')
            continue

        unit = unit_data.get('unit', 0)
        unit_title = unit_data.get('unitTitle', '')
        concepts = unit_data.get('concepts', [])

        unit_patterns = []
        unit_question_count = 0

        print(f'\n=== {unit}단원: {unit_title} ===')

        for concept in concepts:
            if 'realQuestion' not in concept or concept['realQuestion'] is None:
                continue

            concept_name = concept.get('name', 'unknown')
            real_q = concept['realQuestion']
            if real_q is None or not isinstance(real_q, dict):
                continue
            question_data = real_q.get('questionData', {})
            if not question_data:
                continue
            metadata = question_data.get('metadata', {})

            # Build source info
            source_exam = metadata.get('source_exam',
                                        question_data.get('source_exam', 'unknown'))

            print(f'  [{concept_name}] ({source_exam})...', end=' ', flush=True)

            result = extract_pattern(question_data, concept_name)

            if result:
                pattern_entry = {
                    'conceptId': concept.get('id', ''),
                    'targetConcept': concept_name,
                    'frequency': concept.get('frequency', 0),
                    'sourceExam': source_exam,
                    'questionNumber': question_data.get('number', 0),
                    'pattern': result,
                }
                unit_patterns.append(pattern_entry)
                extracted += 1
                print('OK')
            else:
                skipped += 1
                print('FAIL')

            total_questions += 1
            unit_question_count += 1

            # Rate limiting: 20 req/min
            if total_questions % 10 == 0:
                print('  (rate limit pause...)')
                time.sleep(3)

        if unit_patterns:
            output = {
                'unit': unit,
                'unitTitle': unit_title,
                'subject': 'success',
                'totalQuestions': unit_question_count,
                'patterns': unit_patterns,
            }
            out_path = OUTPUT_DIR / f'{unit}단원.json'
            out_path.write_text(
                json.dumps(output, ensure_ascii=False, indent=2),
                encoding='utf-8',
            )
            print(f'  → saved {len(unit_patterns)} patterns to {out_path.name}')

    print(f'\n=== Complete ===')
    print(f'Total questions processed: {total_questions}')
    print(f'Successfully extracted: {extracted}')
    print(f'Skipped/failed: {skipped}')
    print(f'Output directory: {OUTPUT_DIR}')


if __name__ == '__main__':
    main()
