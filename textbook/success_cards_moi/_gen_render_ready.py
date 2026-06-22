import json, re, os, asyncio, tempfile
from dotenv import load_dotenv
from openai import AsyncOpenAI

load_dotenv('/Users/yjshin/projects/gap/backend/.env')

BASE = "/Users/yjshin/projects/gap/textbook/success_cards_moi"
VALID_TEMPLATES = {
    'TPL_COMPARATIVE_MATRIX',
    'TPL_FORMAL_DOCUMENT',
    'TPL_CONVERSATIONAL_FLOW',
    'TPL_CASE_DIAGNOSTIC_FRAME',
    'TPL_SEQUENTIAL_WORKFLOW',
    'TPL_INSTRUCTIONAL_SCENE',
    'TPL_DIGITAL_FORUM_INTERFACE',
    'TPL_QUANTITATIVE_CHART',
    'TPL_PROMOTIONAL_CANVAS',
    'TPL_PLAIN_TEXT',
}

client = AsyncOpenAI(api_key=os.environ['OPENAI_API_KEY'])

SYSTEM_PROMPT = """당신은 한국 수능/모의고사 문제 지문을 구조화하는 전문가입니다.
주어진 지문 텍스트를 분석하고 아래 9가지 템플릿 중 가장 적합한 것으로 구조화하세요.

템플릿별 조건:
- TPL_COMPARATIVE_MATRIX: 2개 이상 항목을 비교하는 표/행렬. 필드: {"headers":[{"id":"h1","label":"..."},...], "rows":[{"id":"1","cells":["...",...]},...], "selection_chips":[]}
- TPL_FORMAL_DOCUMENT: 공문서/양식/계획서/기술서. 필드: {"doc_type":"...","header_info":{"title":"...","date":"","author":""},"paragraphs":[{"sub_title":"...","content":"..."}],"footnotes":[]}
- TPL_CONVERSATIONAL_FLOW: 두 명 이상의 실제 대화문. 필드: {"participants":[{"id":"A","name":"...","role":""}],"messages":[{"participant_id":"A","text":"...","timestamp":""}]}
- TPL_CASE_DIAGNOSTIC_FRAME: 사례 제시 후 체크리스트/점검표. 필드: {"case_profile":{"name":"...","context":"..."},"narrative":"...","check_items":[{"id":1,"label":"...","is_checked":false}]}
- TPL_SEQUENTIAL_WORKFLOW: 단계적 순서/흐름도. 필드: {"orientation":"vertical","steps":[{"idx":1,"label":"...","desc":"...","is_missing":false}]}
- TPL_INSTRUCTIONAL_SCENE: 수업/강의 장면. 필드: {"instructor":{"id":"T","name":"교사","role":"교사"},"canvas_content":{"title":"","items":[]},"students":[{"id":"S1","name":"학생","role":"학생"}]}
- TPL_DIGITAL_FORUM_INTERFACE: 온라인 게시판/SNS. 필드: {"forum_name":"...","main_post":{"author":"...","title":"...","content":"...","timestamp":""},"comments":[]}
- TPL_QUANTITATIVE_CHART: 수치 데이터 차트/그래프. 필드: {"chart_type":"bar","axes":[{"id":"x","label":"..."},{"id":"y","label":"..."}],"datasets":[{"label":"...","values":[]}]}
- TPL_PROMOTIONAL_CANVAS: 광고문/홍보물. 필드: {"slogan":"...","bullets":[],"visual_elements":[],"missing_part":""}
- TPL_PLAIN_TEXT: 위 어디에도 해당 없는 경우. 필드: {"content":"원문 그대로"}

반드시 JSON만 응답하세요:
{"template": "TPL_XXX", "stimulus_data": {...}}"""


def strip_option_prefix(opt: str) -> str:
    return re.sub(r'^[①②③④⑤⑥⑦⑧⑨⑩]\s*', '', opt).strip()


def strip_question_number(stem: str) -> str:
    return re.sub(r'^\s*\d+\.\s*', '', stem).strip()


def validate_render_ready(rr: dict, template: str) -> list:
    errors = []
    if not rr.get('question_stem'):
        errors.append('question_stem 없음')
    if not rr.get('stimulus_data'):
        errors.append('stimulus_data 없음')
    if not rr.get('options_list') or len(rr['options_list']) < 2:
        errors.append('options_list 부족')
    if template not in VALID_TEMPLATES:
        errors.append(f'unknown template: {template}')
    return errors


async def gen_render_ready(concept: dict, sem: asyncio.Semaphore) -> dict:
    rq = concept.get('realQuestion')
    if not rq:
        return concept

    qd = rq.get('questionData')
    if not qd:
        return concept

    if 'render_ready' in qd:
        return concept

    stimulus = qd.get('stimulus', '')
    stem = qd.get('stem', '')
    options = qd.get('options', [])
    box_items = qd.get('box_items', [])

    cleaned_stem = strip_question_number(stem)
    cleaned_options = [strip_option_prefix(o) for o in options]

    if not stimulus.strip():
        qd['render_ready'] = {
            'question_stem': cleaned_stem,
            'stimulus_data': None,
            'options_list': cleaned_options,
            'explanation': '',
        }
        qd['metadata'] = {
            'recommended_template': None,
            'source_exam': qd.get('source_exam', ''),
            'question_number': qd.get('number'),
        }
        return concept

    async with sem:
        try:
            resp = await client.chat.completions.create(
                model='gpt-4o-mini',
                messages=[
                    {'role': 'system', 'content': SYSTEM_PROMPT},
                    {'role': 'user', 'content': f'지문:\n{stimulus}'},
                ],
                temperature=0,
                response_format={'type': 'json_object'},
            )
            raw = json.loads(resp.choices[0].message.content)
            template = raw.get('template', 'TPL_PLAIN_TEXT')
            stimulus_data = raw.get('stimulus_data', {'content': stimulus})
        except Exception as e:
            print(f'  [ERROR] GPT 호출 실패: {e}')
            template = 'TPL_PLAIN_TEXT'
            stimulus_data = {'content': stimulus}

    rr = {
        'question_stem': cleaned_stem,
        'stimulus_data': stimulus_data,
        'options_list': cleaned_options,
        'explanation': '',
    }
    meta = {
        'recommended_template': template,
        'source_exam': qd.get('source_exam', ''),
        'question_number': qd.get('number'),
    }

    errors = validate_render_ready(rr, template)
    if errors:
        print(f'  [WARN] 검증 실패 ({concept.get("name","?")}): {errors}')
        qd['render_ready_error'] = errors
    else:
        qd.pop('render_ready_error', None)

    qd['render_ready'] = rr
    qd['metadata'] = meta
    return concept


async def process_file(path: str, sem: asyncio.Semaphore):
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)

    concepts = data.get('concepts', [])
    already = sum(1 for c in concepts if 'render_ready' in (c.get('realQuestion') or {}).get('questionData', {}))
    todo = len(concepts) - already
    print(f'[{os.path.basename(path)}] 총 {len(concepts)}개 | 기존 {already}개 | 처리 {todo}개')

    if todo == 0:
        return

    tasks = [gen_render_ready(c, sem) for c in concepts]
    data['concepts'] = await asyncio.gather(*tasks)

    tmp = path + '.tmp'
    with open(tmp, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    os.replace(tmp, path)
    print(f'  → 저장 완료')


async def main():
    sem = asyncio.Semaphore(10)
    files = sorted([
        os.path.join(BASE, f)
        for f in os.listdir(BASE)
        if re.match(r'^\d+단원\.json$', f)
    ])
    print(f'총 {len(files)}개 파일 처리 시작\n')
    for path in files:
        await process_file(path, sem)
    print('\n완료.')


if __name__ == '__main__':
    asyncio.run(main())
