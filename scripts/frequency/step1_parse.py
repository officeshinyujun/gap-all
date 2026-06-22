import json
import re
import time

from .api import llm_call


def extract_unit_from_filename(filename):
    m = re.search(r"(\d+)단원", filename)
    if m:
        return int(m.group(1))
    return None


def get_year_from_path(filepath):
    m = re.search(r"(202[0-9])", filepath)
    if m:
        return m.group(1)
    return None


def get_exam_type_from_path(filepath):
    if "수능특강" in filepath or "suteck" in filepath:
        return "수능특강"
    if "수능" in filepath and "모의" not in filepath:
        return "수능"
    if "6월" in filepath:
        return "6월 모의평가"
    if "9월" in filepath:
        return "9월 모의평가"
    return "기타"


def step1_parse_questions(client, ocr_results, source_type, output_dir):
    save_path = output_dir / "_step1_questions.json"
    if save_path.exists():
        print("[Step 1] 이전 파싱 결과 로드", flush=True)
        return json.loads(save_path.read_text(encoding="utf-8"))

    print("[Step 1] OCR 텍스트 → 문제 파싱...", flush=True)
    all_questions = []

    for doc in ocr_results:
        if "error" in doc:
            continue
        filename = doc["filename"]
        full_text = doc["full_text"]
        file_path = doc["file"]

        unit_from_file = extract_unit_from_filename(filename)
        year = get_year_from_path(file_path)
        exam_type = get_exam_type_from_path(file_path)

        source_label = ""
        if year:
            source_label = f"{year} {exam_type}"

        prompt = f"""다음은 한국 직업계고 시험지의 OCR 텍스트입니다.
각 문제를 개별적으로 분리하여 JSON 배열로 출력하세요.

출력 형식:
[
  {{
    "number": 문제번호(int),
    "stimulus": "지문/자료 텍스트",
    "stem": "발문(질문)",
    "options": ["①선지1", "②선지2", "③선지3", "④선지4", "⑤선지5"],
    "answer": "정답번호(있으면)",
    "full_text": "문제 전체 텍스트"
  }}
]

주의: 모든 문제를 빠짐없이 추출하세요. 선지가 4개인 경우도 있습니다.

OCR 텍스트:
{full_text[:12000]}"""

        messages = [{"role": "user", "content": prompt}]
        result = llm_call(client, messages)

        questions = []
        if isinstance(result, list):
            questions = result
        elif isinstance(result, dict) and "questions" in result:
            questions = result["questions"]
        elif isinstance(result, dict) and "raw_text" in result:
            questions = []

        for q in questions:
            q["source_file"] = filename
            q["source_exam"] = source_label
            if source_type == "suteck" and unit_from_file:
                q["unit"] = unit_from_file
            q["year"] = year

        all_questions.extend(questions)
        print(f"  {filename}: {len(questions)}개 문제", flush=True)
        time.sleep(1)

    save_path.write_text(json.dumps(all_questions, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  총 {len(all_questions)}개 문제 파싱 완료", flush=True)
    return all_questions
