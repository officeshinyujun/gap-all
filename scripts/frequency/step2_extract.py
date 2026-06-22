import json
import time

from .api import llm_call


def step2_extract_concepts(client, questions, source_type, output_dir, concept_list=None):
    save_path = output_dir / "_step2_extracted.json"
    if save_path.exists():
        print("[Step 2] 이전 개념 추출 결과 로드", flush=True)
        return json.loads(save_path.read_text(encoding="utf-8"))

    print("[Step 2] 개념 추출...", flush=True)
    extracted = []

    concept_ref = ""
    if concept_list:
        concept_ref = json.dumps(concept_list, ensure_ascii=False)

    for i, q in enumerate(questions):
        q_text = q.get("full_text", "") or json.dumps(q, ensure_ascii=False)
        unit_hint = ""
        if source_type == "suteck" and q.get("unit"):
            unit_hint = f"\n이 문제의 단원: {q['unit']}단원"

        if concept_list:
            prompt = f"""다음 시험 문제가 다루는 개념을 분석하세요.{unit_hint}

[기준 개념 목록 (이 과목의 단원별 핵심 개념)]
{concept_ref}

출력 형식 (JSON):
{{
  "source_exam": "출처",
  "unit": 단원번호(int),
  "primary_concepts": ["기준 목록에서 직접 다루는 개념들"],
  "secondary_concepts": ["기준 목록에서 선지/보기에 등장하는 관련 개념들"],
  "unlisted_concepts": ["기준 목록에 없지만 중요해 보이는 새 개념"],
  "question_format": "문제 유형",
  "difficulty": "상/중/하"
}}

규칙:
- primary_concepts와 secondary_concepts는 반드시 기준 목록에 있는 이름을 사용하세요
- 기준 목록에 없지만 중요한 개념은 unlisted_concepts에 넣으세요
- 한 문제에서 여러 단원의 개념이 나올 수 있습니다
- 반드시 기준 목록에 있는 이름을 그대로 사용하세요. 목록에 없는 개념은 unlisted_concepts에 넣으세요.

문제:
{q_text[:3000]}"""
        else:
            prompt = f"""다음 시험 문제에서 핵심 개념을 추출하세요.{unit_hint}

출력 형식 (JSON):
{{
  "source_exam": "출처",
  "unit": 단원번호(int),
  "primary_concepts": ["직접 묻는 핵심 개념들"],
  "secondary_concepts": ["선지/보기에 등장하는 관련 개념들"],
  "question_format": "문제 유형",
  "difficulty": "상/중/하"
}}

문제:
{q_text[:3000]}"""

        messages = [{"role": "user", "content": prompt}]
        result = llm_call(client, messages)

        if isinstance(result, dict) and "raw_text" not in result:
            if q.get("source_exam"):
                result["source_exam"] = q["source_exam"]
            if source_type == "suteck" and q.get("unit"):
                result["unit"] = q["unit"]
            result["_question_text"] = q_text[:2000]
            extracted.append(result)
        else:
            extracted.append({"error": "parse_failed", "_question_text": q_text[:500]})

        if (i + 1) % 5 == 0:
            print(f"  [{i+1}/{len(questions)}]", flush=True)
        time.sleep(2)

    save_path.write_text(json.dumps(extracted, ensure_ascii=False, indent=2), encoding="utf-8")
    errors = sum(1 for e in extracted if "error" in e)
    print(f"  완료: {len(extracted)}개 (에러: {errors}개)", flush=True)
    return extracted


def verify_and_fix_step2(client, extracted, concept_list, source_type, output_dir):
    print("[Verify 2] 개념 추출 검증...", flush=True)
    issues = []
    fixed_count = 0

    for i, item in enumerate(extracted):
        if "error" in item:
            continue
        unit = item.get("unit", 0)
        if unit < 1 or unit > 20:
            issues.append(f"  문제 {i+1}: unit={unit} (범위 밖)")
            all_concepts_flat = []
            for u, concepts in concept_list.items():
                for c in concepts:
                    all_concepts_flat.append(f"{u}단원: {c}")
            q_text = item.get("_question_text", "")[:2000]
            prompt = f"""이 문제가 1~20단원 중 어디에 해당하나요?

개념 목록:
{chr(10).join(all_concepts_flat[:100])}

문제:
{q_text}

출력: {{"unit": 단원번호}}"""
            messages = [{"role": "user", "content": prompt}]
            result = llm_call(client, messages)
            if isinstance(result, dict) and "unit" in result:
                new_unit = result["unit"]
                if 1 <= new_unit <= 20:
                    extracted[i]["unit"] = new_unit
                    fixed_count += 1
            time.sleep(2)

        primary = item.get("primary_concepts", [])
        secondary = item.get("secondary_concepts", [])
        if not primary and not secondary:
            issues.append(f"  문제 {i+1}: 개념 0개")
        if primary and secondary and set(primary) == set(secondary):
            issues.append(f"  문제 {i+1}: primary == secondary")

    unit_counts = {}
    for item in extracted:
        if "error" in item:
            continue
        u = item.get("unit", 0)
        unit_counts[u] = unit_counts.get(u, 0) + 1

    empty_units = [u for u in range(1, 21) if unit_counts.get(u, 0) == 0]
    if empty_units:
        issues.append(f"  빈 단원: {empty_units}")

    errors = sum(1 for e in extracted if "error" in e)
    error_rate = errors / len(extracted) if extracted else 0
    if error_rate > 0.05:
        issues.append(f"  에러율: {error_rate:.1%} (5% 초과)")

    if issues:
        print("[Verify 2] 이슈 발견:", flush=True)
        for issue in issues:
            print(issue, flush=True)
        if fixed_count:
            print(f"  자동 수정: {fixed_count}건", flush=True)
    else:
        print("[Verify 2] 통과", flush=True)

    save_path = output_dir / "_step2_extracted.json"
    save_path.write_text(json.dumps(extracted, ensure_ascii=False, indent=2), encoding="utf-8")
    return extracted
