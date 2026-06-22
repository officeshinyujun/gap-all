import json
import time

from .api import llm_call
from .config import MAX_CONCEPTS_PER_UNIT


def step8_verification(client, rankings, subject, output_dir):
    save_path = output_dir / "_step8_verification.json"
    if save_path.exists():
        print("[Step 8] 이전 검증 결과 로드", flush=True)
        return json.loads(save_path.read_text(encoding="utf-8"))

    print("[Step 8] 검증...", flush=True)
    verification = {}

    for unit_num in sorted(rankings.keys()):
        concepts = rankings[unit_num][:MAX_CONCEPTS_PER_UNIT]
        concept_list = [f"{c['rank']}. {c['name']} (freq={c['frequency']})" for c in concepts]

        prompt = f"""과목: {subject}
단원: {unit_num}단원

현재 추출된 핵심 개념:
{chr(10).join(concept_list)}

다음을 검증하세요:
1. 이 단원에서 누락된 중요 개념
2. 다른 단원에 속해야 할 개념 (잘못 배정)
3. 동일 개념의 중복 표현

출력 형식 (JSON):
{{
  "missing_concepts": [{{"name": "개념명", "reason": "누락 이유"}}],
  "misplaced_concepts": [{{"name": "개념명", "correct_unit": 단원번호, "reason": "이유"}}],
  "duplicates": [{{"names": ["이름1", "이름2"], "canonical_name": "정식명칭"}}],
  "assessment": "전반적 평가"
}}"""

        messages = [{"role": "user", "content": prompt}]
        result = llm_call(client, messages)
        verification[unit_num] = result
        print(f"  {unit_num}단원 검증 완료", flush=True)
        time.sleep(2)

    save_path.write_text(json.dumps(verification, ensure_ascii=False, indent=2), encoding="utf-8")
    return verification


def apply_verification(rankings, verification):
    adjusted = {}
    for unit_num, concepts in rankings.items():
        adjusted[unit_num] = list(concepts)

    for unit_num, v in verification.items():
        if not isinstance(v, dict):
            continue
        unit_num_int = int(unit_num) if isinstance(unit_num, str) else unit_num

        for dupe in v.get("duplicates", []):
            if not isinstance(dupe, dict):
                continue
            canonical = dupe.get("canonical_name", "")
            names = dupe.get("names", [])
            if not canonical or not names:
                continue
            merged_freq = 0
            merged_sources = []
            for c in adjusted.get(unit_num_int, []):
                if c["name"] in names:
                    merged_freq += c["frequency"]
                    merged_sources.extend(c.get("sources", []))
            adjusted[unit_num_int] = [c for c in adjusted.get(unit_num_int, []) if c["name"] not in names]
            if merged_freq > 0:
                adjusted[unit_num_int].append({
                    "rank": 0, "name": canonical, "frequency": merged_freq,
                    "sources": list(set(merged_sources)), "co_concepts": {}, "questions": [],
                })

        for mis in v.get("misplaced_concepts", []):
            if not isinstance(mis, dict):
                continue
            name = mis.get("name", "")
            correct = mis.get("correct_unit")
            if not name or not correct:
                continue
            moved = None
            for c in adjusted.get(unit_num_int, []):
                if c["name"] == name:
                    moved = c
                    break
            if moved:
                adjusted[unit_num_int].remove(moved)
                adjusted.setdefault(correct, []).append(moved)

    for unit_num in adjusted:
        adjusted[unit_num].sort(key=lambda x: x["frequency"], reverse=True)
        for i, c in enumerate(adjusted[unit_num]):
            c["rank"] = i + 1

    return adjusted
