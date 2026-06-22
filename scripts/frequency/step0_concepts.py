import json
import re
import time

from .api import llm_call
from .config import BASE_DIR


TEXTBOOK_DIR_MAP = {
    "kongil": "kongil",
    "success": "sungjik",
}


def step0_extract_concept_list(client, slug, output_dir):
    save_path = output_dir / "_step0_concepts.json"
    if save_path.exists():
        print("[Step 0c] 이전 개념 목록 로드", flush=True)
        data = json.loads(save_path.read_text(encoding="utf-8"))
        return {int(k): v for k, v in data.items()}

    print("[Step 0c] 교과서 개념 목록 추출...", flush=True)

    textbook_dir_name = TEXTBOOK_DIR_MAP.get(slug, slug)
    textbook_dir = BASE_DIR / "textbook" / textbook_dir_name

    unit_files = sorted(textbook_dir.glob("Unit_*.txt"))
    if not unit_files:
        print(f"  교과서 파일 없음: {textbook_dir}", flush=True)
        return {}

    concept_list = {}

    for uf in unit_files:
        match = re.search(r"Unit_(\d+)", uf.name)
        if not match:
            continue
        unit_num = int(match.group(1))
        text = uf.read_text(encoding="utf-8")

        prompt = f"""다음은 수능특강 교과서의 {unit_num}단원 내용입니다.
이 단원에서 시험에 출제되는 **포괄적 학습 개념**을 추출하세요.

중요: 단순 단어/용어가 아닌, 시험 문제 하나로 출제될 수 있는 "학습 단위" 수준으로 추출하세요.

좋은 예:
- "일과 직업의 구분 (일은 넓은 범위, 직업은 4가지 조건 충족)"
- "직업의 4가지 조건 (계속성, 경제성, 사회성, 윤리성)"
- "직업으로 분류되지 않는 활동 사례"
- "클라크의 산업 분류 (1차/2차/3차 산업 구분 기준)"
- "내재적 직업 가치와 외재적 직업 가치의 차이"

나쁜 예 (너무 단편적):
- "일"
- "직업"
- "계속성"
- "경제성"
- "1차 산업"

규칙:
1. 하나의 개념은 시험에서 하나의 문제로 출제될 수 있는 수준의 학습 단위
2. 관련된 하위 요소는 괄호 안에 포함 (예: "공업 발달 요소 (천연 자원, 인적 자원, 자본)")
3. 대비/비교되는 개념은 한 항목으로 묶기 (예: "제조업과 서비스업의 차이")
4. 분류 체계는 상위 개념으로 묶기 (예: "한국표준산업분류(KSIC)의 대분류 체계")
5. 각 개념에 핵심 키워드를 괄호로 부연 (시험에서 구분점이 되는 포인트)
6. 15~30개 사이로 추출

출력: JSON 배열 ["개념1 (핵심 키워드)", "개념2 (핵심 키워드)", ...]

교과서 내용:
{text[:12000]}"""

        messages = [{"role": "user", "content": prompt}]
        result = llm_call(client, messages)

        if isinstance(result, list):
            concept_list[unit_num] = result
        elif isinstance(result, dict) and "raw_text" in result:
            try:
                parsed = json.loads(result["raw_text"])
                if isinstance(parsed, list):
                    concept_list[unit_num] = parsed
                else:
                    concept_list[unit_num] = []
            except (json.JSONDecodeError, TypeError):
                concept_list[unit_num] = []
        else:
            concept_list[unit_num] = []

        print(f"  Unit {unit_num:02d}: {len(concept_list[unit_num])}개 개념", flush=True)
        time.sleep(2)

    save_path.write_text(
        json.dumps(concept_list, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    total = sum(len(v) for v in concept_list.values())
    print(f"  완료: {len(concept_list)}개 단원, 총 {total}개 개념", flush=True)
    return concept_list


def verify_and_fix_step0c(client, concept_list, slug, output_dir):
    print("[Verify 0c] 교과서 개념 검증...", flush=True)
    issues = []

    for unit in range(1, 21):
        if unit not in concept_list or len(concept_list.get(unit, [])) == 0:
            issues.append(f"  Unit {unit}: 비어있음")

    for unit, concepts in concept_list.items():
        if len(concepts) < 10:
            issues.append(f"  Unit {unit}: {len(concepts)}개 (10개 미만)")
        short_count = sum(1 for c in concepts if len(c) <= 3)
        if concepts and short_count / len(concepts) > 0.2:
            issues.append(f"  Unit {unit}: 단편적 단어 비율 {short_count}/{len(concepts)}")
        seen = set()
        dupes = []
        for c in concepts:
            if c in seen:
                dupes.append(c)
            seen.add(c)
        if dupes:
            concept_list[unit] = list(dict.fromkeys(concepts))
            issues.append(f"  Unit {unit}: 중복 {len(dupes)}개 제거")

    if issues:
        print("[Verify 0c] 이슈 발견:", flush=True)
        for issue in issues:
            print(issue, flush=True)
    else:
        print("[Verify 0c] 통과", flush=True)

    save_path = output_dir / "_step0_concepts.json"
    save_path.write_text(
        json.dumps(concept_list, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return concept_list
