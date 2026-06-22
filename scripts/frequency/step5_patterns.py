import json
import time
import asyncio

from .api import llm_call, async_llm_call, AsyncRoundRobinClient, get_async_round_robin_client
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


async def _process_unit_patterns(async_client, unit_num, concepts, subject, semaphore):
    unit_results = []
    for concept in concepts:
        async with semaphore:
            name = concept["name"]
            q_examples = concept.get("questions", [])
            q_text = "\n---\n".join(q_examples[:2]) if q_examples else "예시 없음"

            prompt = f"""과목: {subject}, {int(unit_num)}단원
개념: {name}
출제 빈도: {concept['frequency']}회

관련 실제 시험 문제:
{q_text[:3000]}

이 개념이 시험에서 어떤 함정 패턴으로 출제되는지 분석하세요.

출력 형식 (JSON 배열):
[
  {{
    "patternType": "함정 유형명 (예: 유사개념 혼동, 조건 누락, 범위 착각 등)",
    "commonMistake": "학생이 구체적으로 하는 실수 (한 문장)",
    "description": "이 함정이 어떻게 작동하는지 설명",
    "realExamExample": {{
      "source": "출처",
      "stimulus": "지문 요약",
      "targetOption": "함정 선지",
      "whyWrong": "왜 학생이 속는지",
      "howToAvoid": "피하는 방법"
    }},
    "frequency": 출현횟수(int)
  }}
]

1-3개의 주요 패턴만 분석하세요."""

            messages = [{"role": "user", "content": prompt}]
            result = await async_llm_call(async_client, messages)

            concept_patterns = []
            if isinstance(result, list):
                concept_patterns = result
            elif isinstance(result, dict) and "patterns" in result:
                concept_patterns = result["patterns"]

            unit_results.append({
                "concept_name": name,
                "patterns": concept_patterns,
            })

    return unit_num, unit_results


def step5_trap_patterns(client, rankings, subject, output_dir):
    save_path = output_dir / "_step5_patterns.json"
    if save_path.exists():
        print("[Step 5] 이전 함정 패턴 결과 로드", flush=True)
        return json.loads(save_path.read_text(encoding="utf-8"))

    print("[Step 5] 함정 패턴 분석 (병렬)...", flush=True)

    api_keys_str = _load_openai_keys()
    async_client = get_async_round_robin_client(api_keys_str)
    semaphore = asyncio.Semaphore(12)

    async def run_all():
        tasks = []
        for unit_num in sorted(rankings.keys(), key=lambda x: int(x)):
            concepts = rankings[unit_num][:MAX_CONCEPTS_PER_UNIT]
            tasks.append(_process_unit_patterns(async_client, unit_num, concepts, subject, semaphore))
        results = await asyncio.gather(*tasks)
        return results

    results = asyncio.run(run_all())

    patterns = {}
    for unit_num, unit_results in results:
        patterns[unit_num] = unit_results
        print(f"  {int(unit_num)}단원: {len(unit_results)}개 개념 분석", flush=True)

    save_path.write_text(json.dumps(patterns, ensure_ascii=False, indent=2), encoding="utf-8")
    return patterns


def verify_and_fix_step5(client, patterns, rankings, subject, output_dir):
    print("[Verify 5] 함정 패턴 검증...", flush=True)
    issues = []
    fixed = 0

    for unit_num in sorted(patterns.keys(), key=lambda x: int(x)):
        unit_patterns = patterns[unit_num]

        for item in unit_patterns:
            concept_name = item.get("concept_name", "")
            concept_patterns = item.get("patterns", [])

            if not concept_patterns:
                issues.append(f"  {int(unit_num)}단원 '{concept_name}': 패턴 0개 → 재생성")
                prompt = f"""과목: {subject}, {int(unit_num)}단원
개념: {concept_name}

이 개념이 시험에서 어떤 함정 패턴으로 출제되는지 분석하세요.

출력 형식 (JSON 배열):
[
  {{
    "patternType": "함정 유형명",
    "commonMistake": "학생이 구체적으로 하는 실수",
    "description": "이 함정이 어떻게 작동하는지",
    "realExamExample": {{
      "source": "출처",
      "stimulus": "지문 요약",
      "targetOption": "함정 선지",
      "whyWrong": "왜 학생이 속는지",
      "howToAvoid": "피하는 방법"
    }},
    "frequency": 1
  }}
]

최소 1개 이상 패턴을 반드시 생성하세요."""
                messages = [{"role": "user", "content": prompt}]
                result = llm_call(client, messages)
                if isinstance(result, list) and result:
                    item["patterns"] = result
                    fixed += 1
                elif isinstance(result, dict) and "patterns" in result:
                    item["patterns"] = result["patterns"]
                    fixed += 1
                time.sleep(2)
                continue

            seen_types = set()
            for p in concept_patterns:
                if not p.get("commonMistake"):
                    issues.append(f"  {int(unit_num)}단원 '{concept_name}': commonMistake 비어있음")
                example = p.get("realExamExample", {})
                if not example.get("whyWrong"):
                    issues.append(f"  {int(unit_num)}단원 '{concept_name}': whyWrong 비어있음")
                if not example.get("howToAvoid"):
                    issues.append(f"  {int(unit_num)}단원 '{concept_name}': howToAvoid 비어있음")
                pt = p.get("patternType", "")
                if pt in seen_types:
                    issues.append(f"  {int(unit_num)}단원 '{concept_name}': 중복 유형 '{pt}'")
                seen_types.add(pt)

    if issues:
        print(f"[Verify 5] 이슈 {len(issues)}건, 수정 {fixed}건", flush=True)
        for issue in issues[:10]:
            print(issue, flush=True)
    else:
        print("[Verify 5] 통과", flush=True)

    save_path = output_dir / "_step5_patterns.json"
    save_path.write_text(json.dumps(patterns, ensure_ascii=False, indent=2), encoding="utf-8")
    return patterns
