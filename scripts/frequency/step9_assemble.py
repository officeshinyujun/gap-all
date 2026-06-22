import json
import time

from .config import MAX_CONCEPTS_PER_UNIT


def step9_final_assembly(rankings, cards, real_questions, quizzes, subject, slug, output_dir):
    print("[Step 9] 최종 JSON 조립...", flush=True)

    for unit_key in sorted(rankings.keys(), key=lambda x: int(x)):
        unit_num = int(unit_key)
        concepts = rankings[unit_key][:MAX_CONCEPTS_PER_UNIT]

        if not concepts:
            continue

        unit_cards = cards.get(unit_key, cards.get(str(unit_num), {}))
        unit_rq = real_questions.get(unit_key, real_questions.get(str(unit_num), {}))
        unit_quizzes = quizzes.get(unit_key, quizzes.get(str(unit_num), {}))

        final_concepts = []
        for concept in concepts:
            name = concept["name"]
            cid = f"{slug}_{unit_num}_{concept['rank']:02d}"

            card_data = unit_cards.get(name, {}) if isinstance(unit_cards, dict) else {}
            rq_data = unit_rq.get(name, {}) if isinstance(unit_rq, dict) else {}
            quiz_data = unit_quizzes.get(name, []) if isinstance(unit_quizzes, dict) else []

            final_concepts.append({
                "id": cid,
                "rank": concept["rank"],
                "name": name,
                "frequency": concept["frequency"],
                "sources": concept.get("sources", []),
                "card": {
                    "definition": card_data.get("definition", ""),
                    "keyPoints": card_data.get("keyPoints", []),
                    "textbookExcerpt": card_data.get("textbookExcerpt", ""),
                },
                "realQuestion": {
                    "questionData": rq_data.get("questionData"),
                    "conceptUsage": rq_data.get("conceptUsage", ""),
                    "conceptHighlight": rq_data.get("conceptHighlight", {"inStimulus": [], "inOptions": [], "reason": ""}),
                },
                "caution": rq_data.get("caution", ""),
                "quiz": quiz_data,
            })

        if not final_concepts:
            continue

        final = {
            "subject": subject,
            "subjectSlug": slug,
            "unit": unit_num,
            "unitTitle": "",
            "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "concepts": final_concepts,
        }

        out_path = output_dir / f"{unit_num}단원.json"
        out_path.write_text(json.dumps(final, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  {unit_num}단원.json ({len(final_concepts)}개 개념)", flush=True)


def verify_and_fix_step9(output_dir):
    print("[Verify 9] 최종 결과 검증...", flush=True)
    issues = []

    json_files = sorted(output_dir.glob("*단원.json"), key=lambda x: int(x.stem.replace("단원", "")))

    if not json_files:
        issues.append("  생성된 단원 파일 없음")
        print("[Verify 9] 실패: 파일 없음", flush=True)
        return issues

    for f in json_files:
        data = json.loads(f.read_text(encoding="utf-8"))
        concepts = data.get("concepts", [])
        unit_num = data.get("unit", "?")

        if not concepts:
            issues.append(f"  {unit_num}단원: 개념 0개")
            continue

        for c in concepts:
            if not c.get("card", {}).get("definition"):
                issues.append(f"  {unit_num}단원 '{c['name']}': definition 비어있음")
            if not c.get("realQuestion", {}).get("questionData"):
                issues.append(f"  {unit_num}단원 '{c['name']}': realQuestion 없음")
            if not c.get("caution"):
                issues.append(f"  {unit_num}단원 '{c['name']}': caution 비어있음")
            if not c.get("quiz"):
                issues.append(f"  {unit_num}단원 '{c['name']}': quiz 비어있음")

        freqs = [c["frequency"] for c in concepts]
        if freqs != sorted(freqs, reverse=True):
            concepts.sort(key=lambda x: x["frequency"], reverse=True)
            for i, c in enumerate(concepts):
                c["rank"] = i + 1
            data["concepts"] = concepts
            f.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    if issues:
        print(f"[Verify 9] 이슈 {len(issues)}건", flush=True)
        for issue in issues[:15]:
            print(issue, flush=True)
    else:
        print("[Verify 9] 통과", flush=True)

    return issues
