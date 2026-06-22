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


async def _process_unit_quizzes(async_client, unit_num, concepts, subject, semaphore):
    unit_results = {}
    for concept in concepts:
        async with semaphore:
            name = concept["name"]
            prompt = f"""과목: {subject}, {int(unit_num)}단원
개념: {name}

이 개념에 대한 4지선다 퀴즈 2개를 생성하세요.
실제 시험 스타일로, 함정 선지를 포함하여 변별력 있게 만드세요.

출력 형식 (JSON 배열):
[
  {{
    "question": "문제",
    "options": ["선지1", "선지2", "선지3", "선지4"],
    "answer": 정답인덱스(0-3),
    "explanation": "해설 (정답 선지가 왜 맞는지)"
  }}
]

규칙:
- 4개 선지 모두 서로 다른 내용
- answer는 0, 1, 2, 3 중 하나
- explanation에 정답 선지 내용 언급"""

            messages = [{"role": "user", "content": prompt}]
            result = await async_llm_call(async_client, messages)

            if isinstance(result, list):
                unit_results[name] = result[:2]
            else:
                unit_results[name] = []

    return unit_num, unit_results


def step6_quiz_generation(client, rankings, subject, output_dir):
    save_path = output_dir / "_step6_quizzes.json"
    if save_path.exists():
        print("[Step 6] 이전 퀴즈 결과 로드", flush=True)
        return json.loads(save_path.read_text(encoding="utf-8"))

    print("[Step 6] 퀴즈 생성 (병렬)...", flush=True)

    api_keys_str = _load_openai_keys()
    async_client = get_async_round_robin_client(api_keys_str)
    semaphore = asyncio.Semaphore(12)

    async def run_all():
        tasks = []
        for unit_num in sorted(rankings.keys(), key=lambda x: int(x)):
            concepts = rankings[unit_num][:MAX_CONCEPTS_PER_UNIT]
            tasks.append(_process_unit_quizzes(async_client, unit_num, concepts, subject, semaphore))
        results = await asyncio.gather(*tasks)
        return results

    results = asyncio.run(run_all())

    quizzes = {}
    for unit_num, unit_results in results:
        quizzes[unit_num] = unit_results
        print(f"  {int(unit_num)}단원: {len(unit_results)}개 개념 퀴즈", flush=True)

    save_path.write_text(json.dumps(quizzes, ensure_ascii=False, indent=2), encoding="utf-8")
    return quizzes


def verify_and_fix_step6(client, quizzes, rankings, subject, output_dir):
    print("[Verify 6] 퀴즈 검증...", flush=True)
    issues = []
    fixed = 0

    for unit_num in sorted(quizzes.keys(), key=lambda x: int(x)):
        unit_quizzes = quizzes[unit_num]
        concepts = rankings.get(unit_num, rankings.get(str(unit_num), []))[:MAX_CONCEPTS_PER_UNIT]

        for concept in concepts:
            name = concept["name"]
            quiz_list = unit_quizzes.get(name, [])

            needs_fix = False
            if len(quiz_list) < 2:
                issues.append(f"  {int(unit_num)}단원 '{name}': 퀴즈 {len(quiz_list)}개 (2개 미만)")
                needs_fix = True
            else:
                for qi, q in enumerate(quiz_list):
                    opts = q.get("options", [])
                    if len(opts) != 4:
                        issues.append(f"  {int(unit_num)}단원 '{name}' Q{qi+1}: options {len(opts)}개")
                        needs_fix = True
                    elif len(set(opts)) != 4:
                        issues.append(f"  {int(unit_num)}단원 '{name}' Q{qi+1}: 중복 선지")
                        needs_fix = True
                    ans = q.get("answer")
                    if not isinstance(ans, int) or ans < 0 or ans > 3:
                        issues.append(f"  {int(unit_num)}단원 '{name}' Q{qi+1}: answer={ans} 범위 밖")
                        needs_fix = True

            if needs_fix:
                prompt = f"""과목: {subject}, {int(unit_num)}단원
개념: {name}

이 개념에 대한 4지선다 퀴즈 2개를 생성하세요.

출력 형식 (JSON 배열):
[{{"question":"문제","options":["선지1","선지2","선지3","선지4"],"answer":정답(0-3),"explanation":"해설"}}]

규칙: 선지 4개 모두 다른 내용, answer는 0~3"""
                messages = [{"role": "user", "content": prompt}]
                result = llm_call(client, messages)
                if isinstance(result, list) and len(result) >= 2:
                    quizzes[unit_num][name] = result[:2]
                    fixed += 1
                time.sleep(2)

    if issues:
        print(f"[Verify 6] 이슈 {len(issues)}건, 수정 {fixed}건", flush=True)
        for issue in issues[:10]:
            print(issue, flush=True)
    else:
        print("[Verify 6] 통과", flush=True)

    save_path = output_dir / "_step6_quizzes.json"
    save_path.write_text(json.dumps(quizzes, ensure_ascii=False, indent=2), encoding="utf-8")
    return quizzes
