import json, re, os, glob

BASE = "/Users/yjshin/projects/gap/textbook/success_cards_moi"

total_updated = 0

for n in range(1, 21):
    path = os.path.join(BASE, f"{n}단원.json")
    if not os.path.exists(path):
        print(f"[SKIP] {path} not found")
        continue

    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    unit_count = 0
    for concept in data.get("concepts", []):
        rq = concept.get("realQuestion")
        if rq is None:
            continue

        qd = rq.get("questionData")
        if qd is None:
            continue

        options = qd.get("options", [])
        answer = qd.get("answer", "")
        box_items = qd.get("box_items", [])
        stimulus = qd.get("stimulus", "")

        answer_num = None
        for j, marker in enumerate(["①", "②", "③", "④", "⑤"]):
            if marker in str(answer):
                answer_num = j + 1
                break

        option_analysis = []
        for i, opt in enumerate(options):
            is_correct = (i + 1 == answer_num)
            opt_text = re.sub(r"^[①②③④⑤]\s*", "", opt).strip()

            if is_correct:
                if box_items and re.search(r"[ㄱㄴㄷㄹ]", opt_text):
                    included = re.findall(r"[ㄱㄴㄷㄹ]", opt_text)
                    reasons = []
                    for marker_char in included:
                        idx = "ㄱㄴㄷㄹ".index(marker_char)
                        if idx < len(box_items):
                            reasons.append(f"'{box_items[idx][:40]}' - 지문의 내용과 부합한다.")
                    if reasons:
                        reasoning = "정답. " + " / ".join(reasons)
                    else:
                        reasoning = f"정답. 지문의 내용을 종합하면 {opt_text}이(가) 적절하다."
                else:
                    reasoning = f"정답. {opt_text[:60]} - 지문의 내용과 개념에 부합한다."
            else:
                if box_items and re.search(r"[ㄱㄴㄷㄹ]", opt_text):
                    included = re.findall(r"[ㄱㄴㄷㄹ]", opt_text)
                    if answer_num and answer_num <= len(options):
                        correct_opt = re.sub(r"^[①②③④⑤]\s*", "", options[answer_num - 1])
                        correct_markers = set(re.findall(r"[ㄱㄴㄷㄹ]", correct_opt))
                        current_markers = set(included)

                        wrong_included = current_markers - correct_markers
                        missing = correct_markers - current_markers

                        parts = []
                        for m in sorted(wrong_included):
                            idx = "ㄱㄴㄷㄹ".index(m)
                            if idx < len(box_items):
                                parts.append(f"'{box_items[idx][:30]}' 은(는) 지문과 부합하지 않는다")
                        for m in sorted(missing):
                            idx = "ㄱㄴㄷㄹ".index(m)
                            if idx < len(box_items):
                                parts.append(f"'{box_items[idx][:30]}' 이(가) 빠져있다")

                        if parts:
                            reasoning = "오답. " + ", ".join(parts) + "."
                        else:
                            reasoning = "오답. 보기 조합이 적절하지 않다."
                    else:
                        reasoning = "오답. 보기 조합이 적절하지 않다."
                else:
                    reasoning = f"오답. {opt_text[:50]} - 지문의 내용이나 개념 정의와 부합하지 않는다."

            if len(reasoning) > 150:
                reasoning = reasoning[:147] + "..."

            option_analysis.append({
                "optionNum": i + 1,
                "verdict": "O" if is_correct else "X",
                "reasoning": reasoning
            })

        if "conceptHighlightV2" not in rq:
            rq["conceptHighlightV2"] = {}
        rq["conceptHighlightV2"]["optionAnalysis"] = option_analysis
        unit_count += 1

    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    print(f"[DONE] {n}단원.json - {unit_count}개 개념 업데이트")
    total_updated += unit_count

print(f"\n총 {total_updated}개 개념의 optionAnalysis reasoning 재생성 완료.")
