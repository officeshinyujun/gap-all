import json
import re
import asyncio

from .api import llm_call, async_llm_call, get_async_round_robin_client
from .config import MAX_CONCEPTS_PER_UNIT, KEYS_FILE


def _load_openai_keys():
    keys = {}
    with open(KEYS_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if "=" in line:
                k, v = line.split("=", 1)
                keys[k.strip()] = v.strip()
    return keys.get("OPENAI_API_KEY", keys.get("LLM_API_KEY", ""))


def _assign_questions_to_concepts(rankings, extracted, questions):
    assignments = {}

    for unit_key in sorted(rankings.keys(), key=lambda x: int(x)):
        unit_num = int(unit_key)
        concepts = rankings[unit_key][:MAX_CONCEPTS_PER_UNIT]
        assignments[unit_key] = {}
        used_indices = set()

        for concept in concepts:
            concept_name = concept["name"]
            best_question = None

            for i, ext in enumerate(extracted):
                if "error" in ext:
                    continue
                if ext.get("unit") != unit_num and str(ext.get("unit")) != str(unit_num):
                    continue
                if i in used_indices:
                    continue
                primary = ext.get("primary_concepts", [])
                concept_base = concept_name.split("(")[0].strip()
                for pc in primary:
                    if concept_base in pc or pc in concept_base:
                        best_question = i
                        break
                if best_question is not None:
                    break

            if best_question is not None:
                used_indices.add(best_question)
                q_data = questions[best_question] if best_question < len(questions) else None
                assignments[unit_key][concept_name] = q_data
            else:
                for i, ext in enumerate(extracted):
                    if "error" in ext:
                        continue
                    if ext.get("unit") != unit_num and str(ext.get("unit")) != str(unit_num):
                        continue
                    if i in used_indices:
                        continue
                    used_indices.add(i)
                    q_data = questions[i] if i < len(questions) else None
                    assignments[unit_key][concept_name] = q_data
                    break

            if concept_name not in assignments[unit_key]:
                for i, ext in enumerate(extracted):
                    if "error" in ext:
                        continue
                    if ext.get("unit") != unit_num and str(ext.get("unit")) != str(unit_num):
                        continue
                    q_data = questions[i] if i < len(questions) else None
                    assignments[unit_key][concept_name] = q_data
                    break

        if not assignments[unit_key]:
            assignments[unit_key] = {}

    return assignments


def _question_to_exam_format(q):
    if not q:
        return None
    options_list = q.get("options", [])
    answer_str = q.get("answer", "")
    correct_answer = None
    if answer_str:
        for i, opt in enumerate(options_list):
            if answer_str in opt:
                correct_answer = i + 1
                break
        if correct_answer is None:
            m = re.search(r"(\d)", str(answer_str))
            if m:
                correct_answer = int(m.group(1))

    combo_block = None
    if q.get("box_items"):
        items = []
        for item in q["box_items"]:
            if "." in item:
                key = item.split(".")[0].strip()
                text = ".".join(item.split(".")[1:]).strip()
            else:
                key = item[:1]
                text = item[1:].strip()
            items.append({"key": key, "text": text})
        combo_block = {
            "title": "보기",
            "items": items
        }

    stimulus = q.get("stimulus", "")
    stem = q.get("stem", "")

    return {
        "metadata": {
            "unit_name": "",
            "target_concept": "",
            "item_type": "실제 기출",
        },
        "render_ready": {
            "question_stem": stem,
            "stimulus_data": {"content": stimulus} if stimulus else None,
            "options_list": options_list,
            "explanation": "",
        },
        "combo_block": combo_block,
        "correct_answer": correct_answer,
        "questionSource": q.get("source_exam", ""),
    }


async def _generate_usage_and_caution(async_client, concept_name, question_text, subject, unit_num, semaphore):
    async with semaphore:
        prompt = f"""과목: {subject}, {int(unit_num)}단원
개념: {concept_name}

아래는 이 개념과 관련된 실제 시험 문제입니다:
{question_text[:3000]}

다음을 생성하세요:
1. conceptUsage: 이 문제에서 위 개념이 정확히 어떤 부분에, 어떻게 사용되었는지 설명 (2-3문장)
2. caution: 이 개념에서 학생들이 주의해야 할 점을 엄격하게 작성. 구체적인 오답 유발 포인트, 혼동하기 쉬운 부분, 반드시 확인해야 할 조건 등 (3-5문장, 엄격하고 구체적으로)
3. conceptHighlight: 이 문제에서 해당 개념이 판가름되는 구체적 위치
   - inStimulus: 지문/자료에서 이 개념의 판별 근거가 되는 핵심 문구 (원문 그대로, 1~3개)
   - inOptions: 이 개념과 직접 관련된 선지 번호 (1-indexed, 정답 포함)
   - reason: 왜 이 부분이 이 개념의 판별 포인트인지 (1문장)

출력 형식 (JSON):
{{
  "conceptUsage": "이 문제에서 해당 개념이 사용된 방식 설명",
  "caution": "이 개념에서 주의할 점 (엄격하고 구체적)",
  "conceptHighlight": {{
    "inStimulus": ["지문에서 핵심 문구1", "핵심 문구2"],
    "inOptions": [4],
    "reason": "이 부분이 판별 포인트인 이유"
  }}
}}"""

        messages = [{"role": "user", "content": prompt}]
        result = await async_llm_call(async_client, messages)
        if isinstance(result, dict) and "conceptUsage" in result:
            return concept_name, result
        return concept_name, {"conceptUsage": "", "caution": "", "conceptHighlight": {"inStimulus": [], "inOptions": [], "reason": ""}}


def step5_realquestions(client, rankings, extracted, questions, subject, output_dir):
    save_path = output_dir / "_step5_realquestions.json"
    if save_path.exists():
        print("[Step 5] 이전 실제 문제 결과 로드", flush=True)
        return json.loads(save_path.read_text(encoding="utf-8"))

    print("[Step 5] 실제 문제 배정 + 분석 (병렬)...", flush=True)

    assignments = _assign_questions_to_concepts(rankings, extracted, questions)

    api_keys_str = _load_openai_keys()
    async_client = get_async_round_robin_client(api_keys_str)
    semaphore = asyncio.Semaphore(12)

    async def run_all():
        tasks = []
        for unit_key in sorted(assignments.keys(), key=lambda x: int(x)):
            for concept_name, q_data in assignments[unit_key].items():
                q_text = q_data.get("full_text", "") if q_data else ""
                tasks.append(_generate_usage_and_caution(
                    async_client, concept_name, q_text, subject, unit_key, semaphore
                ))
        return await asyncio.gather(*tasks)

    results = asyncio.run(run_all())

    usage_map = {}
    for concept_name, data in results:
        usage_map[concept_name] = data

    real_questions = {}
    for unit_key in sorted(assignments.keys(), key=lambda x: int(x)):
        real_questions[unit_key] = {}
        for concept_name, q_data in assignments[unit_key].items():
            exam_format = _question_to_exam_format(q_data)
            usage_data = usage_map.get(concept_name, {})
            real_questions[unit_key][concept_name] = {
                "questionData": exam_format,
                "conceptUsage": usage_data.get("conceptUsage", ""),
                "caution": usage_data.get("caution", ""),
                "conceptHighlight": usage_data.get("conceptHighlight", {"inStimulus": [], "inOptions": [], "reason": ""}),
            }
        print(f"  {int(unit_key)}단원: {len(real_questions[unit_key])}개 배정", flush=True)

    print("  [Step 5b] conceptHighlight 생성 (병렬)...", flush=True)
    real_questions = asyncio.run(_generate_highlights(real_questions, assignments, api_keys_str))

    save_path.write_text(json.dumps(real_questions, ensure_ascii=False, indent=2), encoding="utf-8")
    return real_questions


async def _generate_single_highlight(async_client, concept_name, question_text, semaphore):
    async with semaphore:
        prompt = f"""다음 시험 문제에서 "{concept_name}" 개념이 판가름되는 구체적 위치를 찾아주세요.

문제:
{question_text[:3000]}

출력 형식 (JSON):
{{
  "inStimulus": ["지문에서 이 개념의 판별 근거가 되는 핵심 문구 (원문 그대로)"],
  "inOptions": [4],
  "reason": "왜 이 부분이 이 개념의 판별 포인트인지 (1문장)"
}}

규칙:
- inStimulus: 지문/자료에서 이 개념을 판별할 수 있는 핵심 문구 1~3개 (원문 그대로 발췌)
- inOptions: 이 개념과 직접 관련된 선지 번호들 (1~5 중, 정답 포함)
- reason: 왜 이 부분들이 판별 포인트인지 한 문장으로"""

        messages = [{"role": "user", "content": prompt}]
        result = await async_llm_call(async_client, messages)
        if isinstance(result, dict) and ("inStimulus" in result or "inOptions" in result):
            return concept_name, result
        return concept_name, {"inStimulus": [], "inOptions": [], "reason": ""}


async def _generate_highlights(real_questions, assignments, api_keys_str):
    async_client = get_async_round_robin_client(api_keys_str)
    semaphore = asyncio.Semaphore(12)

    tasks = []
    for unit_key in sorted(real_questions.keys(), key=lambda x: int(x)):
        for concept_name, rq_data in real_questions[unit_key].items():
            q_data = assignments.get(unit_key, {}).get(concept_name)
            q_text = q_data.get("full_text", "") if q_data else ""
            if q_text:
                tasks.append(_generate_single_highlight(async_client, concept_name, q_text, semaphore))

    results = await asyncio.gather(*tasks)

    highlight_map = {}
    for concept_name, highlight in results:
        highlight_map[concept_name] = highlight

    for unit_key in real_questions:
        for concept_name in real_questions[unit_key]:
            if concept_name in highlight_map:
                real_questions[unit_key][concept_name]["conceptHighlight"] = highlight_map[concept_name]

    filled = sum(1 for h in highlight_map.values() if h.get("inStimulus") or h.get("inOptions"))
    print(f"  conceptHighlight: {filled}/{len(highlight_map)} 채워짐", flush=True)

    empty_count = 0
    for unit_key in real_questions:
        for concept_name, rq_data in real_questions[unit_key].items():
            ch = rq_data.get("conceptHighlight", {})
            if not ch.get("inStimulus") and not ch.get("inOptions"):
                q_data = assignments.get(unit_key, {}).get(concept_name)
                if q_data:
                    fallback_stimulus = []
                    concept_base = concept_name.split("(")[0].strip()
                    stimulus = q_data.get("stimulus", "") or q_data.get("full_text", "")
                    for keyword in concept_base.split():
                        if len(keyword) >= 2 and keyword in stimulus:
                            start = stimulus.find(keyword)
                            excerpt = stimulus[max(0, start-10):start+len(keyword)+20].strip()
                            if excerpt and excerpt not in fallback_stimulus:
                                fallback_stimulus.append(excerpt)
                    if not fallback_stimulus and stimulus:
                        fallback_stimulus = [stimulus[:60]]

                    fallback_options = []
                    answer_str = q_data.get("answer", "")
                    if answer_str:
                        import re
                        m = re.search(r"(\d)", str(answer_str))
                        if m:
                            fallback_options = [int(m.group(1))]

                    rq_data["conceptHighlight"] = {
                        "inStimulus": fallback_stimulus[:2],
                        "inOptions": fallback_options,
                        "reason": f"'{concept_base}' 개념이 이 문제의 핵심 판별 요소",
                    }
                    empty_count += 1

    if empty_count:
        print(f"  fallback 채움: {empty_count}개", flush=True)

    return real_questions


def verify_and_fix_step5(client, real_questions, rankings, subject, output_dir):
    print("[Verify 5] 실제 문제 검증...", flush=True)
    issues = []

    for unit_key in sorted(real_questions.keys(), key=lambda x: int(x)):
        for name, data in real_questions[unit_key].items():
            if not data.get("questionData"):
                issues.append(f"  {int(unit_key)}단원 '{name}': 문제 없음")
            if not data.get("conceptUsage"):
                issues.append(f"  {int(unit_key)}단원 '{name}': conceptUsage 비어있음")
            if not data.get("caution"):
                issues.append(f"  {int(unit_key)}단원 '{name}': caution 비어있음")

    if issues:
        print(f"[Verify 5] 이슈 {len(issues)}건", flush=True)
        for issue in issues[:10]:
            print(issue, flush=True)
    else:
        print("[Verify 5] 통과", flush=True)

    save_path = output_dir / "_step5_realquestions.json"
    save_path.write_text(json.dumps(real_questions, ensure_ascii=False, indent=2), encoding="utf-8")
    return real_questions
