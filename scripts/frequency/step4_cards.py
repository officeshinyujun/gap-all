import json
import asyncio

from .api import async_llm_call, get_async_round_robin_client
from .config import MAX_CONCEPTS_PER_UNIT, BASE_DIR, KEYS_FILE

TEXTBOOK_DIR_MAP = {"kongil": "kongil", "success": "sungjik"}


def _load_openai_keys():
    keys = {}
    with open(KEYS_FILE, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if "=" in line:
                k, v = line.split("=", 1)
                keys[k.strip()] = v.strip()
    return keys.get("OPENAI_API_KEY", keys.get("LLM_API_KEY", ""))


def _load_textbook_unit(slug, unit_num):
    dir_name = TEXTBOOK_DIR_MAP.get(slug, slug)
    path = BASE_DIR / "textbook" / dir_name / f"Unit_{int(unit_num):02d}.txt"
    if path.exists():
        return path.read_text(encoding="utf-8")
    return ""


async def _generate_card(async_client, concept_name, subject, unit_num, textbook_text, semaphore):
    async with semaphore:
        prompt = f"""과목: {subject}, {int(unit_num)}단원
개념: {concept_name}

아래는 수능특강 교과서의 해당 단원 내용입니다:
{textbook_text[:6000]}

다음을 생성하세요:
1. definition: 이 개념의 간결하고 정확한 정의 (1-2문장)
2. keyPoints: 시험에서 구분점이 되는 핵심 포인트 3-5개
3. textbookExcerpt: 교과서 원문에서 이 개념에 해당하는 부분을 그대로 발췌 (원문 유지, 100-300자)

출력 형식 (JSON):
{{
  "definition": "정의",
  "keyPoints": ["포인트1", "포인트2", "포인트3"],
  "textbookExcerpt": "교과서 원문 발췌"
}}"""

        messages = [{"role": "user", "content": prompt}]
        result = await async_llm_call(async_client, messages)
        if isinstance(result, dict) and "definition" in result:
            return concept_name, result
        return concept_name, {"definition": "", "keyPoints": [], "textbookExcerpt": ""}


def step4_card_generation(client, rankings, subject, slug, output_dir):
    save_path = output_dir / "_step4_cards.json"
    if save_path.exists():
        print("[Step 4] 이전 카드 결과 로드", flush=True)
        return json.loads(save_path.read_text(encoding="utf-8"))

    print("[Step 4] 카드 생성 (병렬)...", flush=True)

    api_keys_str = _load_openai_keys()
    async_client = get_async_round_robin_client(api_keys_str)
    semaphore = asyncio.Semaphore(12)

    async def run_all():
        tasks = []
        for unit_num in sorted(rankings.keys(), key=lambda x: int(x)):
            concepts = rankings[unit_num][:MAX_CONCEPTS_PER_UNIT]
            textbook_text = _load_textbook_unit(slug, unit_num)
            for concept in concepts:
                tasks.append(_generate_card(async_client, concept["name"], subject, unit_num, textbook_text, semaphore))
        return await asyncio.gather(*tasks)

    results = asyncio.run(run_all())

    cards = {}
    for concept_name, card_data in results:
        for unit_num, concepts in rankings.items():
            for c in concepts[:MAX_CONCEPTS_PER_UNIT]:
                if c["name"] == concept_name:
                    if unit_num not in cards:
                        cards[unit_num] = {}
                    cards[unit_num][concept_name] = card_data
                    break

    for unit_num in sorted(cards.keys(), key=lambda x: int(x)):
        print(f"  {int(unit_num)}단원: {len(cards[unit_num])}개 카드", flush=True)

    save_path.write_text(json.dumps(cards, ensure_ascii=False, indent=2), encoding="utf-8")
    return cards


def verify_and_fix_step4(client, cards, rankings, subject, slug, output_dir):
    print("[Verify 4] 카드 검증...", flush=True)
    issues = []

    for unit_num in sorted(cards.keys(), key=lambda x: int(x)):
        for name, card in cards[unit_num].items():
            if not card.get("definition") or len(card.get("definition", "")) < 20:
                issues.append(f"  {int(unit_num)}단원 '{name}': definition 부실")
            if not card.get("keyPoints") or len(card.get("keyPoints", [])) < 1:
                issues.append(f"  {int(unit_num)}단원 '{name}': keyPoints 없음")
            if not card.get("textbookExcerpt"):
                issues.append(f"  {int(unit_num)}단원 '{name}': textbookExcerpt 없음")

    if issues:
        print(f"[Verify 4] 이슈 {len(issues)}건", flush=True)
        for issue in issues[:10]:
            print(issue, flush=True)
    else:
        print("[Verify 4] 통과", flush=True)

    save_path = output_dir / "_step4_cards.json"
    save_path.write_text(json.dumps(cards, ensure_ascii=False, indent=2), encoding="utf-8")
    return cards
