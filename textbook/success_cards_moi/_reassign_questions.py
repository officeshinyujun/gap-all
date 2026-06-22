import json
import os
import shutil

BASE_DIR = "/Users/yjshin/projects/gap/textbook/success_cards_moi"
MAPPING_FILE = os.path.join(BASE_DIR, "_question_unit_mapping.json")
OCR_FILE = os.path.join(BASE_DIR, "_step0_ocr.json")
BACKUP_DIR = os.path.join(BASE_DIR, "_backup_before_reassign")

with open(MAPPING_FILE, "r", encoding="utf-8") as f:
    mappings = json.load(f)

with open(OCR_FILE, "r", encoding="utf-8") as f:
    ocr_data = json.load(f)

question_lookup = {}
for exam_group in ocr_data:
    for file_entry in exam_group:
        for q in file_entry.get("questions", []):
            key = (q["source_exam"], q["number"])
            question_lookup[key] = q

unit_questions = {}
for m in mappings:
    unit = m["primary_unit"]
    if unit not in unit_questions:
        unit_questions[unit] = []
    unit_questions[unit].append(m)

confidence_order = {"high": 0, "medium": 1, "low": 2}
for unit in unit_questions:
    unit_questions[unit].sort(key=lambda x: (confidence_order.get(x.get("confidence", "low"), 2), x["number"]))

os.makedirs(BACKUP_DIR, exist_ok=True)

total_reassigned = 0
total_null = 0

for unit_num in range(1, 21):
    filename = f"{unit_num}단원.json"
    filepath = os.path.join(BASE_DIR, filename)
    if not os.path.exists(filepath):
        print(f"[SKIP] {filename} not found")
        continue

    shutil.copy2(filepath, os.path.join(BACKUP_DIR, filename))

    with open(filepath, "r", encoding="utf-8") as f:
        unit_data = json.load(f)

    available_questions = list(unit_questions.get(unit_num, []))
    used_indices = set()

    for concept in unit_data.get("concepts", []):
        assigned = False
        for i, mapping in enumerate(available_questions):
            if i in used_indices:
                continue
            key = (mapping["source_exam"], mapping["number"])
            if key in question_lookup:
                qdata = question_lookup[key]
                concept["realQuestion"] = {
                    "questionData": {
                        "number": qdata["number"],
                        "source_exam": qdata["source_exam"],
                        "stimulus": qdata.get("stimulus", ""),
                        "stem": qdata.get("stem", ""),
                        "box_items": qdata.get("box_items", []),
                        "options": qdata.get("options", []),
                        "answer": qdata.get("answer", ""),
                        "full_text": qdata.get("full_text", "")
                    },
                    "conceptUsage": "",
                    "conceptHighlight": {"inStimulus": "", "inOptions": "", "reason": ""},
                    "conceptHighlightV2": None
                }
                used_indices.add(i)
                assigned = True
                total_reassigned += 1
                break

        if not assigned:
            concept["realQuestion"] = None
            total_null += 1

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(unit_data, f, ensure_ascii=False, indent=2)

    unit_assigned = len(used_indices)
    unit_null = len(unit_data.get("concepts", [])) - unit_assigned
    print(f"[{filename}] concepts={len(unit_data.get('concepts', []))}, assigned={unit_assigned}, null={unit_null}")

print(f"\n=== SUMMARY ===")
print(f"Total reassigned: {total_reassigned}")
print(f"Total null: {total_null}")
print(f"Backup saved to: {BACKUP_DIR}")
