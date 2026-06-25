import json
from collections import defaultdict

from .config import YEAR_WEIGHTS


def step3_frequency_count(extracted, output_dir):
    save_path = output_dir / "_step3_rankings.json"
    print("[Step 3] 빈도 집계...", flush=True)

    unit_concepts = defaultdict(lambda: defaultdict(lambda: {
        "raw_count": 0, "weighted_count": 0.0, "sources": [],
        "co_concepts": defaultdict(int), "questions": [],
    }))

    for item in extracted:
        if "error" in item:
            continue
        unit = item.get("unit", 0)
        source = item.get("source_exam", "")
        year = None
        for y in YEAR_WEIGHTS:
            if y in source:
                year = y
                break
        weight = YEAR_WEIGHTS.get(year, 1.0) if year else 1.0

        all_concepts_in_q = item.get("primary_concepts", []) + item.get("secondary_concepts", [])

        # 변별력 향상: 같은 단원 내 N개 개념이 동시 태깅되면 weight를 N으로 나눠 분산
        primary_in_unit = [c for c in item.get("primary_concepts", []) if c in unit_concepts[unit]]
        secondary_in_unit = [c for c in item.get("secondary_concepts", []) if c in unit_concepts[unit]]
        primary_count = max(len(primary_in_unit), 1)
        secondary_count = max(len(secondary_in_unit), 1)

        for concept in primary_in_unit:
            entry = unit_concepts[unit][concept]
            entry["raw_count"] += 1.0 / primary_count
            entry["weighted_count"] += weight / primary_count
            if source and source not in entry["sources"]:
                entry["sources"].append(source)
            entry["questions"].append(item.get("_question_text", "")[:500])
            for other in all_concepts_in_q:
                if other != concept:
                    entry["co_concepts"][other] += 1

        for concept in secondary_in_unit:
            entry = unit_concepts[unit][concept]
            entry["raw_count"] += 0.5 / secondary_count
            entry["weighted_count"] += (weight * 0.5) / secondary_count
            if source and source not in entry["sources"]:
                entry["sources"].append(source)
            for other in all_concepts_in_q:
                if other != concept:
                    entry["co_concepts"][other] += 1

    rankings = {}
    for unit_num, concepts in unit_concepts.items():
        ranked = sorted(concepts.items(), key=lambda x: x[1]["weighted_count"], reverse=True)
        rankings[unit_num] = []
        for i, (name, data) in enumerate(ranked):
            rankings[unit_num].append({
                "rank": i + 1,
                "name": name,
                "frequency": round(data["weighted_count"], 1),
                "raw_count": data["raw_count"],
                "sources": data["sources"],
                "co_concepts": dict(data["co_concepts"]),
                "questions": data["questions"][:3],
            })

    for unit_num in sorted(rankings.keys()):
        top = rankings[unit_num][0] if rankings[unit_num] else None
        count = len(rankings[unit_num])
        if top:
            print(f"  {unit_num}단원: {count}개 개념 (TOP: {top['name']} freq={top['frequency']})", flush=True)

    save_path.write_text(json.dumps(rankings, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    return rankings


def verify_and_fix_step3(rankings, output_dir):
    print("[Verify 3] 빈도 집계 검증...", flush=True)
    issues = []

    keys_to_remove = []
    for key in rankings:
        unit_num = int(key) if isinstance(key, str) else key
        if unit_num > 20 or unit_num < 1:
            keys_to_remove.append(key)
            issues.append(f"  단원 {key}: 범위 밖, 제거")
    for key in keys_to_remove:
        del rankings[key]

    concept_locations = {}
    for unit_key, concepts in rankings.items():
        for c in concepts:
            name = c["name"]
            if name in concept_locations:
                existing_unit = concept_locations[name]["unit"]
                existing_freq = concept_locations[name]["freq"]
                if c["frequency"] > existing_freq:
                    old_unit_concepts = rankings.get(existing_unit, [])
                    rankings[existing_unit] = [x for x in old_unit_concepts if x["name"] != name]
                    concept_locations[name] = {"unit": unit_key, "freq": c["frequency"]}
                else:
                    concepts_list = rankings.get(unit_key, [])
                    rankings[unit_key] = [x for x in concepts_list if x["name"] != name]
                issues.append(f"  '{name}': 중복 ({existing_unit}, {unit_key}단원) → 병합")
            else:
                concept_locations[name] = {"unit": unit_key, "freq": c["frequency"]}

    for unit_key, concepts in rankings.items():
        for c in concepts:
            sources_count = len(c.get("sources", []))
            if sources_count > 0 and c["frequency"] > sources_count * 2:
                issues.append(f"  {unit_key}단원 '{c['name']}': freq={c['frequency']} > sources*2={sources_count*2} (경고)")

    for unit_key in rankings:
        rankings[unit_key].sort(key=lambda x: x["frequency"], reverse=True)
        for i, c in enumerate(rankings[unit_key]):
            c["rank"] = i + 1

    if issues:
        print("[Verify 3] 이슈 발견:", flush=True)
        for issue in issues:
            print(issue, flush=True)
    else:
        print("[Verify 3] 통과", flush=True)

    save_path = output_dir / "_step3_rankings.json"
    save_path.write_text(json.dumps(rankings, ensure_ascii=False, indent=2, default=str), encoding="utf-8")
    return rankings
