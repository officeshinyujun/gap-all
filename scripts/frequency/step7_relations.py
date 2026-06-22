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


async def _process_unit_relations(async_client, unit_num, concepts, subject, semaphore):
    unit_results = []
    for concept in concepts:
        co = concept.get("co_concepts", {})
        top_co = sorted(co.items(), key=lambda x: x[1], reverse=True)[:5]

        if not top_co:
            unit_results.append({"concept_name": concept["name"], "related": []})
            continue

        async with semaphore:
            co_list = [{"name": name, "count": cnt} for name, cnt in top_co]
            prompt = f"""과목: {subject}, {int(unit_num)}단원
개념: {concept['name']}

이 개념과 함께 출제되는 개념들:
{json.dumps(co_list, ensure_ascii=False)}

각 관련 개념에 대해 관계를 분류하세요.

출력 형식 (JSON):
[
  {{
    "name": "관련 개념명",
    "coPattern": "함께출제 또는 대비출제",
    "description": "어떻게 함께/대비되어 나오는지",
    "coOccurrence": 동시출현횟수(int)
  }}
]

- 함께출제: 같은 문제에서 보완적으로 등장
- 대비출제: 혼동을 유발하는 대비 관계"""

            messages = [{"role": "user", "content": prompt}]
            result = await async_llm_call(async_client, messages)

            related = []
            if isinstance(result, list):
                related = result
            elif isinstance(result, dict) and "related" in result:
                related = result["related"]

            unit_results.append({"concept_name": concept["name"], "related": related})

    return unit_num, unit_results


def step7_related_concepts(client, rankings, subject, output_dir):
    save_path = output_dir / "_step7_relations.json"
    if save_path.exists():
        print("[Step 7] 이전 관련 개념 결과 로드", flush=True)
        return json.loads(save_path.read_text(encoding="utf-8"))

    print("[Step 7] 관련 개념 분석 (병렬)...", flush=True)

    api_keys_str = _load_openai_keys()
    async_client = get_async_round_robin_client(api_keys_str)
    semaphore = asyncio.Semaphore(12)

    async def run_all():
        tasks = []
        for unit_num in sorted(rankings.keys(), key=lambda x: int(x)):
            concepts = rankings[unit_num][:MAX_CONCEPTS_PER_UNIT]
            tasks.append(_process_unit_relations(async_client, unit_num, concepts, subject, semaphore))
        results = await asyncio.gather(*tasks)
        return results

    results = asyncio.run(run_all())

    relations = {}
    for unit_num, unit_results in results:
        relations[unit_num] = unit_results
        print(f"  {int(unit_num)}단원 완료", flush=True)

    save_path.write_text(json.dumps(relations, ensure_ascii=False, indent=2), encoding="utf-8")
    return relations


def verify_and_fix_step7(client, relations, rankings, subject, output_dir):
    print("[Verify 7] 관련 개념 검증...", flush=True)
    issues = []

    for unit_num in sorted(relations.keys(), key=lambda x: int(x)):
        unit_relations = relations[unit_num]

        for item in unit_relations:
            concept_name = item.get("concept_name", "")
            related = item.get("related", [])

            if not related:
                issues.append(f"  {int(unit_num)}단원 '{concept_name}': 관련 개념 0개")
                continue

            for r in related:
                co_pattern = r.get("coPattern", "")
                if co_pattern not in ("함께출제", "대비출제"):
                    issues.append(f"  {int(unit_num)}단원 '{concept_name}': coPattern='{co_pattern}' 유효하지 않음")
                if not r.get("description"):
                    issues.append(f"  {int(unit_num)}단원 '{concept_name}': description 비어있음")

    if issues:
        print(f"[Verify 7] 이슈 {len(issues)}건", flush=True)
        for issue in issues[:10]:
            print(issue, flush=True)
    else:
        print("[Verify 7] 통과", flush=True)

    save_path = output_dir / "_step7_relations.json"
    save_path.write_text(json.dumps(relations, ensure_ascii=False, indent=2), encoding="utf-8")
    return relations
