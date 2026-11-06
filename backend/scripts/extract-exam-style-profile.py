#!/usr/bin/env python3
"""reference-pdf-v3 기출 전수 → 완전 AI 생성용 정량 출제 프로필.

참조 문항을 런타임에 쓰지 않고도 실제 시험의 형식 분포(응답 형식, 발문 틀, 보기·선지 조합,
정답 위치, 제시문 블록 구성, 길이, 라벨 관례, 배점 등)를 재현하기 위한 통계를 뽑는다.
원문 문장은 저장하지 않는다(발문 틀은 자료 명사를 슬롯으로 치환한 일반형만 저장).

usage: python3 scripts/extract-exam-style-profile.py
  in : ../artifacts/reference-corpus-v3/built/*.json
  out: src/exams/generative/data/exam-style-profile.json
"""
from __future__ import annotations

import collections
import glob
import json
import os
import re
import statistics
from typing import Any, Iterable

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CORPUS = os.path.join(ROOT, '..', 'artifacts', 'reference-corpus-v3', 'built', '*.json')
OUT = os.path.join(ROOT, 'src', 'exams', 'generative', 'data', 'exam-style-profile.json')

NEGATIVE = re.compile(r'옳지 않은|적절하지 않은|틀린 것|아닌 것')
VIEW_KEY = re.compile(r'^([ㄱ-ㅎ])[.)]\s*')
CHOICE_PREFIX = re.compile(r'^[①②③④⑤]\s*')
MATERIAL_NOUNS = [
    '사례', '보고서', '기사', '대화', '표', '자료', '수업', '공고', '계획서', '인터뷰', '회의록',
    '게시판', '안내문', '발표', '그림', '그래프', '상담', '일지', '설문', '면접', '토론', '신문',
    '수행 평가', '포트폴리오', '이메일', '메시지', 'SNS', '누리 소통망', '카드 뉴스', '광고', '홍보',
    '공정도', '도식', '체크리스트', '점검표', '일기', '편지', '학습지', '노트', '강의', '보도', '방송',
]
STEM_ENDINGS = [
    ('combo_all_correct', r'옳은 것만을 <보기>에서 있는 대로 고른 것은\?'),
    ('combo_all_appropriate', r'적절한 것만을 <보기>에서 있는 대로 고른 것은\?'),
    ('combo_correct', r'옳은 것만을 <보기>에서 고른 것은\?'),
    ('combo_appropriate', r'적절한 것만을 <보기>에서 고른 것은\?'),
    ('best_appropriate', r'가장 적절한 것은\?'),
    ('correct', r'옳은 것은\?'),
    ('appropriate', r'적절한 것은\?'),
    ('not_correct', r'옳지 않은 것은\?'),
    ('not_appropriate', r'적절하지 않은 것은\?'),
    ('pair_match', r'(바르게|옳게) (짝지은|연결한) 것은\?'),
    ('sequence', r'순서대로 (배열한|나열한) 것은\?'),
]


def load_rows() -> list[dict[str, Any]]:
    rows = []
    for path in sorted(glob.glob(CORPUS)):
        rows.extend(json.load(open(path, encoding='utf-8')))
    return rows


def subject_of(row: dict[str, Any]) -> str:
    return 'kongil' if row['subject'] == 'kongil' else 'success'


def source_type(payload: dict[str, Any]) -> str:
    return 'moi' if payload.get('source', {}).get('type') == 'moi' else 'suteck'


def strip_choice(choice: str) -> str:
    return CHOICE_PREFIX.sub('', choice).strip()


def combo_signature(choice: str) -> str | None:
    body = strip_choice(choice)
    keys = re.findall(r'[ㄱ-ㅎ]', body)
    if not keys or re.sub(r'[ㄱ-ㅎ,\s]', '', body):
        return None
    return ''.join(keys)


def response_mode(payload: dict[str, Any]) -> str:
    stem = payload['stem']
    if payload.get('viewItems'):
        return 'truth_combination'
    if payload.get('choiceTable'):
        return 'pair_table'
    if re.search(r'순서대로 (배열|나열)', stem):
        return 'sequence'
    bodies = [strip_choice(c) for c in payload['choices']]
    if all(len(b) <= 14 and not re.search(r'(다|요)\.?$', b) for b in bodies):
        return 'short_label'
    return 'statement'


def stem_ending(stem: str) -> str:
    for key, pattern in STEM_ENDINGS:
        if re.search(pattern, stem):
            return key
    return 'other'


def stem_opening(stem: str) -> str:
    if stem.startswith('위'):
        return 'above'
    if re.match(r'^다음은 .+?(이다|이다\.|한 것이다|일부이다)', stem):
        return 'declarative'
    if stem.startswith('다음'):
        return 'direct'
    if re.match(r'^\(가\)|^그림|^표', stem):
        return 'label'
    return 'other'


def stem_shell(stem: str) -> str:
    """발문을 자료 명사·대상 슬롯으로 일반화한 틀. 고유 내용은 [대상]으로 접는다."""
    shell = stem
    shell = re.sub(r'\(단,.*\)\s*$', '(단, [조건])', shell)
    # 자료 명사는 독립 어절(앞: 시작/공백, 뒤: 조사·공백)일 때만 슬롯화한다. ('표준', '발표' 보호)
    nouns = '|'.join(re.escape(n) for n in sorted(MATERIAL_NOUNS, key=len, reverse=True))
    shell = re.sub(
        rf'(^|\s)(?:{nouns})(?=\s|에|를|을|의|와|과|이|가|로|으로|에서|,)',
        r'\1[자료]', shell)
    shell = re.sub(r'(\[자료\]\s*)+', '[자료] ', shell).replace('[자료] 에', '[자료]에').replace('[자료] 를', '[자료]를').replace('[자료] 의', '[자료]의').replace('[자료] 와', '[자료]와')
    # '…에 나타난 X에 대한' / '…의 X로' 같은 대상 구를 슬롯화
    shell = re.sub(r'(나타난|제시된|드러난|알 수 있는) [^,?]+?(에 대한|으로|로)', r'\1 [대상]\2', shell)
    shell = re.sub(r'[A-Z](, [A-Z])* (씨|기업|학생|회사|공장)', '[인물]', shell)
    shell = re.sub(r'\s+', ' ', shell).strip()
    return shell


def stimulus_shape(payload: dict[str, Any]) -> str:
    kinds = []
    for block in payload.get('stimulusBlocks') or []:
        kind = block['type']
        if kind not in kinds:
            kinds.append(kind)
    return '+'.join(sorted(kinds)) or 'empty'


def textual_shape(payload: dict[str, Any]) -> str:
    """그림을 뺀 생성 가능 블록 구성(text/table/dialogue)."""
    kinds = sorted({b['type'] for b in payload.get('stimulusBlocks') or [] if b['type'] != 'figure'})
    return '+'.join(kinds) or 'text'


# 엔진이 그릴 수 있는 그림만 센다. 기출 그림 설명(description)으로 세부 종류를 가른다.
#   그래프: 범주형(막대·꺾은선·누적·원·방사형·파레토), 간트, 관리도, 산점도, 곡선(수명 주기 등)
#   도식: 흐름도·순서도, 작업 네트워크(퍼트), 특성 요인도, 계층도·조직도, 순환도, 벤·포함 도식, 관계도, 2×2 매트릭스, 가공 형태
#   인물 삽화(+대화)
# 모식도·투시도·회로 그림, 잠금 패턴 격자, 안전 표지, 피라미드, 이동 경로는 그릴 수 없으므로 세지 않는다.
PERSON = re.compile(
    r'인물|사람|남성|여성|남자|여자|학생|기자|발표자|근로자|직원|교사|선생|사원|노동자|어린이|할머니|할아버지|대표|상담사|'
    r'의사|간호|요리사|농부|작업자|청소년|아이|씨[ )’]|면접')
DIAGRAM_TYPES = ('flow', 'network', 'fishbone', 'tree', 'cycle', 'venn', 'relation', 'matrix', 'nesting')
CHART_TYPES = ('categorical', 'gantt', 'control', 'scatter', 'curve')


def figure_type(kind: str, d: str) -> str | None:
    """그림 하나의 세부 종류. 엔진이 그릴 수 없으면 None."""
    if kind == 'chart':
        if re.search(r'간트', d): return 'gantt'
        if re.search(r'관리도', d): return 'control'
        if re.search(r'산점|산포', d): return 'scatter'
        if re.search(r'수명 ?주기|곡선|거리에 따른|(?<!꺾은)선 그래프|비용 그래프', d): return 'curve'
        return 'categorical'
    if kind != 'diagram':
        return None
    if re.search(r'네트워크|퍼트|PERT', d): return 'network'
    if re.search(r'특성 요인도|생선뼈', d): return 'fishbone'
    if re.search(r'잠금 해제|패턴을 그리', d): return None
    if re.search(r'가공 형태', d): return 'nesting'
    if re.search(r'원뿔|피라미드', d): return None
    if re.search(r'조직도|계층도|트리|구성 요소|분류 내용|분류체계|직무 수행 능력', d): return 'tree'
    if re.search(r'사이클|순환 도식', d): return 'cycle'
    if re.search(r'벤 다이어그램|포함 관계', d): return 'venn'
    if re.search(r'조하리|4등분', d): return 'matrix'
    if re.search(r'표지', d): return None
    if re.search(r'마인드맵|기본 구조|거래 흐름|중심으로 네|사이의 두 화살표|경영 혁신 전략', d): return 'relation'
    if re.search(r'이동 경로', d): return None
    if re.search(r'모식도|구조 도식|회로|투시도|좌표 형태|아이콘|\[그림 [12]\]', d): return None
    if re.search(r'교육 장면|수업 장면', d) and not re.search(r'도식|순서|절차', d): return None
    if re.search(r'흐름도|순서도|공정|과정|단계|절차|게임판|경로|➡|→|도식', d): return 'flow'
    return None


def figure_plan(payload: dict[str, Any]) -> tuple[str, str] | None:
    """엔진이 그리는 그림형 제시문 구성과 그림 종류. (shape, type) 또는 None.
    그래프·도식은 첫 번째로 그릴 수 있는 그림을, 없으면 인물 삽화 + 대화를 본다."""
    figures = payload.get('figures') or []
    kinds = {b['type'] for b in payload.get('stimulusBlocks') or [] if b['type'] != 'figure'}
    for f in figures:
        kind = f.get('kind') or ''
        ftype = figure_type(kind, f.get('description') or '')
        if ftype is not None:
            family = 'chart' if ftype in CHART_TYPES else 'diagram'
            return (f'{family}+text' if kinds else family, ftype)
    person = any(f.get('kind') == 'illustration' and PERSON.search(f.get('description') or '') for f in figures)
    if person and 'dialogue' in kinds:
        return ('scene+dialogue', 'scene')
    return None


def stimulus_text_length(payload: dict[str, Any]) -> int:
    total = 0
    for block in payload.get('stimulusBlocks') or []:
        if block['type'] == 'text':
            total += len(block['text'])
        elif block['type'] == 'table':
            total += sum(len(cell) for row in block['rows'] for cell in row)
            total += sum(len(cell) for row in block.get('headers') or [] for cell in row)
        elif block['type'] == 'dialogue':
            total += sum(len(line['text']) for line in block['lines'])
    return total


def labels(payload: dict[str, Any]) -> list[str]:
    text = payload.get('stimulus') or ''
    found = []
    if re.search(r'\(가\)', text):
        found.append('(가)(나)')
    if re.search(r'[㉠㉡㉢]', text):
        found.append('㉠㉡')
    if re.search(r'\bA 기업|\bA 회사|\bA사\b', text):
        found.append('A·B 기업')
    if re.search(r'[A-E] ?씨', text):
        found.append('A 씨')
    if re.search(r'학생 [A-E]|[갑을병정]\s*:', text):
        found.append('학생 A·B/갑·을')
    if re.search(r'\[\s*[^\]]{2,20}\s*\]', text):
        found.append('[제목]')
    if re.search(r'[A-E] 공정|[A-E] 단계|\(가\) 단계', text):
        found.append('A 공정/단계')
    return found


def quantiles(values: Iterable[int]) -> dict[str, int]:
    data = sorted(values)
    if not data:
        return {'p25': 0, 'median': 0, 'p75': 0}
    q = statistics.quantiles(data, n=4) if len(data) >= 4 else [data[0], statistics.median(data), data[-1]]
    return {'p25': round(q[0]), 'median': round(statistics.median(data)), 'p75': round(q[2])}


def share(counter: collections.Counter, top: int | None = None) -> dict[str, float]:
    total = sum(counter.values()) or 1
    items = counter.most_common(top)
    return {key: round(count / total, 4) for key, count in items}


def clean_concept(concept: str) -> str:
    concept = concept.strip()
    if concept.count('(') > concept.count(')'):
        concept = concept.split('(')[0].strip()
    return concept


def summarize(rows: list[dict[str, Any]]) -> dict[str, Any]:
    payloads = [r['source_payload'] for r in rows]
    modes = collections.Counter(response_mode(p) for p in payloads)
    endings = collections.Counter(stem_ending(p['stem']) for p in payloads)
    openings = collections.Counter(stem_opening(p['stem']) for p in payloads)
    shells_by_mode: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    for p in payloads:
        shells_by_mode[response_mode(p)][stem_shell(p['stem'])] += 1
    single = [p for p in payloads if not p.get('viewItems')]
    negative_single = sum(1 for p in single if NEGATIVE.search(p['stem']))
    view_counts = collections.Counter(len(p['viewItems']) for p in payloads if p.get('viewItems'))
    combo_sets: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    correct_combo_sizes: dict[str, collections.Counter] = collections.defaultdict(collections.Counter)
    for p in payloads:
        if not p.get('viewItems'):
            continue
        sigs = [combo_signature(c) for c in p['choices']]
        if any(s is None for s in sigs):
            continue
        n = str(len(p['viewItems']))
        combo_sets[n]['|'.join(sigs)] += 1
        answer = p.get('correctAnswer')
        if isinstance(answer, int) and 1 <= answer <= 5:
            correct_combo_sizes[n][str(len(sigs[answer - 1]))] += 1
    answers = collections.Counter(str(p.get('correctAnswer')) for p in payloads)
    points = collections.Counter(f"{source_type(p)}:{p.get('points')}" for p in payloads)
    shapes = collections.Counter(stimulus_shape(p) for p in payloads)
    text_shapes = collections.Counter(textual_shape(p) for p in payloads)
    label_counter = collections.Counter(l for p in payloads for l in labels(p))
    speakers = collections.Counter(
        line['speaker'] for p in payloads for b in p.get('stimulusBlocks') or []
        if b['type'] == 'dialogue' for line in b['lines'])
    dialogue_turns = [len(b['lines']) for p in payloads for b in p.get('stimulusBlocks') or [] if b['type'] == 'dialogue']
    table_rows = [len(b['rows']) for p in payloads for b in p.get('stimulusBlocks') or [] if b['type'] == 'table']
    table_cols = [max((len(r) for r in b['rows']), default=0) for p in payloads for b in p.get('stimulusBlocks') or [] if b['type'] == 'table']
    material_words = collections.Counter(
        noun for p in payloads for noun in MATERIAL_NOUNS if noun in p['stem'])
    choice_table_headers = collections.Counter(
        ' | '.join(p['choiceTable']['headers']) for p in payloads if p.get('choiceTable'))
    lengths_by_mode: dict[str, list[int]] = collections.defaultdict(list)
    for p in payloads:
        lengths_by_mode[response_mode(p)].extend(len(strip_choice(c)) for c in p['choices'])
    concepts = collections.Counter(
        clean_concept(c) for p in payloads for c in (p.get('targetConcepts') or [])[:1] if c.strip())
    secondary = collections.Counter(
        clean_concept(c) for p in payloads for c in (p.get('targetConcepts') or [])[1:] if c.strip())
    co_occurrence = collections.Counter()
    for p in payloads:
        cs = sorted({clean_concept(c) for c in p.get('targetConcepts') or [] if c.strip()})
        for i, a in enumerate(cs):
            for b in cs[i + 1:]:
                co_occurrence[f'{a} ⟷ {b}'] += 1
    return {
        'count': len(rows),
        'responseModes': share(modes),
        'negativeShareOfSingle': round(negative_single / max(1, len(single)), 4),
        'stemEndings': share(endings),
        'stemOpenings': share(openings),
        'stemShellsByMode': {mode: [s for s, _ in counter.most_common(12)] for mode, counter in shells_by_mode.items()},
        'conditionClauseShare': round(sum(1 for p in payloads if '(단,' in p['stem']) / max(1, len(payloads)), 4),
        'viewItemCounts': share(view_counts),
        'comboChoiceSets': {n: share(counter, 8) for n, counter in combo_sets.items()},
        'correctComboSizes': {n: share(counter) for n, counter in correct_combo_sizes.items()},
        'answerPositions': share(answers),
        'points': share(points),
        'stimulusShapes': share(shapes, 12),
        'textualShapes': share(text_shapes),
        'figureShare': round(sum(1 for p in payloads if p.get('figures')) / max(1, len(payloads)), 4),
        # 전체 문항 중 엔진이 그릴 수 있는 그림형 구성의 비율(planner가 textualShapes와 섞어 쓴다)
        'figureShapes': {
            shape: round(sum(1 for p in payloads if (figure_plan(p) or ('', ''))[0] == shape) / max(1, len(payloads)), 4)
            for shape in ('chart+text', 'chart', 'diagram+text', 'diagram', 'scene+dialogue')
        },
        # 전체 문항 중 그림 종류별 비율(planner가 그림형 구성 안에서 종류를 고를 때 쓴다)
        'figureTypes': {
            ftype: round(sum(1 for p in payloads if (figure_plan(p) or ('', ''))[1] == ftype) / max(1, len(payloads)), 4)
            for ftype in (*CHART_TYPES, *DIAGRAM_TYPES, 'scene')
        },
        'sharedStimulusShare': round(sum(1 for p in payloads if re.search(r'\[\d+\s*[~∼]\s*\d+\]', p.get('stimulus') or '')) / max(1, len(payloads)), 4),
        'labels': share(label_counter),
        'dialogueSpeakers': share(speakers, 20),
        'dialogueTurns': quantiles(dialogue_turns),
        'tableRows': quantiles(table_rows),
        'tableCols': quantiles(table_cols),
        'stemMaterialNouns': share(material_words, 20),
        'choiceTableHeaders': share(choice_table_headers, 12),
        'lengths': {
            'stem': quantiles(len(p['stem']) for p in payloads),
            'stimulus': quantiles(stimulus_text_length(p) for p in payloads),
            'viewItem': quantiles(len(VIEW_KEY.sub('', v)) for p in payloads for v in p.get('viewItems') or []),
            'choiceByMode': {mode: quantiles(values) for mode, values in lengths_by_mode.items()},
            'explanation': quantiles(len(p.get('explanation') or '') for p in payloads if p.get('explanation')),
        },
        'primaryConcepts': dict(concepts.most_common(30)),
        'secondaryConcepts': dict(secondary.most_common(30)),
        'conceptCoOccurrence': dict(co_occurrence.most_common(25)),
    }

DIFFICULTY_PRIOR_WEIGHT = 4  # 표본이 적은 단원은 과목 평균 쪽으로 당긴다(가상 문항 4개)
NUMERIC_TOKEN = re.compile(r'\d[\d,.]*\s*(?:%|개|분|원|명|일|개월|년|시간|PPM|가지|회)')


def is_calculation(payload: dict[str, Any]) -> bool:
    views = payload.get('viewItems') or []
    blob = ' '.join([
        payload.get('stimulus') or '',
        *[v.get('text', '') if isinstance(v, dict) else str(v) for v in views],
        *(payload.get('choices') or []),
    ])
    return len(NUMERIC_TOKEN.findall(blob)) >= 4


def unit_difficulty(unit_rows: list[dict[str, Any]], subject_moi: list[dict[str, Any]]) -> dict[str, Any]:
    """단원 난도: 평가원 배점(3점 비율)·문항 번호 위치·계산 문항 비율로 매긴다(정답률 자료는 없음)."""
    moi = [r['source_payload'] for r in unit_rows if source_type(r['source_payload']) == 'moi']
    prior_p3 = sum(p.get('points') == 3 for p in (r['source_payload'] for r in subject_moi)) / max(1, len(subject_moi))
    prior_qn = statistics.mean(int(r['source_payload'].get('questionNumber') or 10) for r in subject_moi) if subject_moi else 10.5
    k = DIFFICULTY_PRIOR_WEIGHT
    n = len(moi)
    n3 = sum(p.get('points') == 3 for p in moi)
    p3 = (n3 + k * prior_p3) / (n + k)
    qn = (sum(int(p.get('questionNumber') or prior_qn) for p in moi) + k * prior_qn) / (n + k)
    calc = sum(is_calculation(r['source_payload']) for r in unit_rows) / max(1, len(unit_rows))
    index = 0.6 * p3 + 0.25 * (qn - 1) / 19 + 0.15 * min(1.0, calc / 0.5)
    tier = 'hard' if index >= 0.58 else 'easy' if index < 0.38 else 'standard'
    return {
        'moiCount': n,
        'points3Share': round(p3, 3),
        'rawPoints3Share': round(n3 / n, 3) if n else None,
        'meanQuestionNumber': round(qn, 2),
        'calculationShare': round(calc, 3),
        'index': round(index, 3),
        'tier': tier,
    }



def main() -> None:
    rows = load_rows()
    by_subject: dict[str, list[dict[str, Any]]] = collections.defaultdict(list)
    by_unit: dict[tuple[str, int], list[dict[str, Any]]] = collections.defaultdict(list)
    for row in rows:
        subject = subject_of(row)
        by_subject[subject].append(row)
        by_unit[(subject, int(row['unit_number']))].append(row)
    profile: dict[str, Any] = {
        'version': 'exam-style-profile-v2',
        'corpus': 'reference-pdf-v3',
        'questionCount': len(rows),
        'subjects': {},
    }
    for subject, subject_rows in sorted(by_subject.items()):
        moi = [r for r in subject_rows if source_type(r['source_payload']) == 'moi']
        suteck = [r for r in subject_rows if source_type(r['source_payload']) == 'suteck']
        units = {}
        for (unit_subject, unit), unit_rows in sorted(by_unit.items()):
            if unit_subject != subject:
                continue
            units[str(unit)] = {**summarize(unit_rows), 'difficulty': unit_difficulty(unit_rows, moi)}
        profile['subjects'][subject] = {
            'overall': summarize(subject_rows),
            'bySource': {'moi': summarize(moi), 'suteck': summarize(suteck)},
            'units': units,
        }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as handle:
        json.dump(profile, handle, ensure_ascii=False, indent=1)
        handle.write('\n')
    print(f'wrote {OUT} ({len(rows)} questions)')


if __name__ == '__main__':
    main()
