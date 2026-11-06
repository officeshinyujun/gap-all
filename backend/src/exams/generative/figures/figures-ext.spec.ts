import { Difficulty } from '../../../entities/difficulty';
import { isSourceBlocksStimulusData } from '../../source-blocks-stimulus';
import { svgAllowlistViolation } from '../../svg-allowlist';
import {
  assembleGenerativeQuestion,
  parseGenerativeCandidate,
  renderForSolver,
  repairUnusedLabels,
  validateGenerativeCandidate,
} from '../generative-item-assembler';
import { pickFigureType, planGenerativeExam, replanGenerativeItem, seededRandom } from '../generative-item-planner';
import { buildGenerativeItemPrompt, generativeItemResponseFormat } from '../generative-item-prompt';
import { loadExamStyleProfile } from '../exam-style-knowledge';
import type { GenerativeItemSpec } from '../generative.types';
import { controlFacts, curveSegmentTrends, curveLines, ganttStatus, pearson, scatterPoints, type ControlFigureSpec, type CurveFigureSpec, type GanttFigureSpec, type ScatterFigureSpec } from './figure-chart-ext';
import { nestingFacts, nestingFit, networkSchedule, quadrantOf, type NetworkDiagramSpec } from './figure-diagram';
import { collectFigureStrings, mapFigureStrings } from './figure-parse';
import { figureTypeSchema } from './figure-prompt';
import { FIGURE_TYPES, figureAlt, figureFamily, figureTypeOf, parseFigureSpec, validateFigureSpec, type FigureSpec } from './figure-spec';
import { renderFigure, renderFigureSvg } from './figure-svg';

/** 모델이 쓰는 strict JSON 그대로의 명세(선택 필드 null) */
const RAW: Record<string, Record<string, unknown>> = {
  gantt: { id: 'F1', kind: 'chart', chartType: 'gantt', title: null, periodLabel: '9월', unit: '일', start: 1, end: 15, statusDay: 8, tasks: [{ name: '제품 1', plannedStart: 1, plannedEnd: 7, doneUntil: 6 }, { name: '제품 2', plannedStart: 3, plannedEnd: 12, doneUntil: 8 }, { name: '제품 3', plannedStart: 6, plannedEnd: 15, doneUntil: null }] },
  control: { id: 'F1', kind: 'chart', chartType: 'control', title: null, xLabel: '일자', yLabel: '통계량', values: [48, 52, 50, 55, 47, 53, 51, 54, 49, 46, 52, 50, 58, 64, 51, 47, 39, 52, 54, 53], center: 50, upper: 60, lower: 40 },
  scatter: { id: 'F1', kind: 'chart', chartType: 'scatter', title: null, points: 40, panels: [{ title: null, xLabel: '부품 오차', yLabel: '불량률', correlation: 'strong_positive' }, { title: null, xLabel: '숙련도', yLabel: '불량률', correlation: 'negative' }] },
  curve: { id: 'F1', kind: 'chart', chartType: 'curve', title: null, xLabel: '시기', yLabel: '매출액', preset: 'lifecycle', segments: ['(가)', '(나)', '(다)', '(라)'], xMax: 100, yMax: 100, curves: [] },
  flow: { id: 'F1', kind: 'diagram', diagramType: 'flow', title: null, direction: 'vertical', steps: [{ id: 's1', label: '재고 여유', shape: 'box', yesLabel: null }, { id: 's2', label: '재고가 기준량 이하인가?', shape: 'decision', yesLabel: '예' }, { id: 's3', label: '일정량 주문', shape: 'box', yesLabel: null }], loops: [{ from: 's2', to: 's1', label: '아니요' }] },
  network: { id: 'F1', kind: 'diagram', diagramType: 'network', title: null, unit: '분', tasks: [{ id: 'A', name: '작업 A', duration: 6 }, { id: 'B', name: '작업 B', duration: 10 }, { id: 'C', name: '작업 C', duration: 5 }, { id: 'D', name: '작업 D', duration: 7 }, { id: 'E', name: '작업 E', duration: 4 }], links: [{ from: 'A', to: 'B' }, { from: 'A', to: 'C' }, { from: 'B', to: 'D' }, { from: 'C', to: 'D' }, { from: 'B', to: 'E' }, { from: 'D', to: 'E' }] },
  fishbone: { id: 'F1', kind: 'diagram', diagramType: 'fishbone', title: null, effect: '조립 불량', categories: [{ name: '작업 절차', causes: ['불필요한 동작 과다'] }, { name: '인력', causes: ['교육 미흡'] }, { name: '자재', causes: ['규격 미달'] }, { name: '장비', causes: ['유지 보수 불량'] }] },
  tree: { id: 'F1', kind: 'diagram', diagramType: 'tree', title: null, direction: 'down', nodes: [{ id: 'r', label: '대표이사', parent: null }, { id: 'a', label: '생산부', parent: 'r' }, { id: 'b', label: '(가)', parent: 'r' }, { id: 'c', label: '품질팀', parent: 'a' }] },
  cycle: { id: 'F1', kind: 'diagram', diagramType: 'cycle', title: null, center: '안전 관리 사이클', steps: ['P 계획', 'D 실시', 'C (가)', 'A 조치'] },
  venn: { id: 'F1', kind: 'diagram', diagramType: 'venn', title: null, mode: 'overlap', labels: ['(가)', '(나)'], onlyFirst: ['산업체가 경비 일부 부담'], onlySecond: ['학교 밖 학습을 학점으로 인정'], both: ['일과 학업 병행'] },
  relation: { id: 'F1', kind: 'diagram', diagramType: 'relation', title: null, layout: 'circle', nodes: [{ id: 'g', label: '(가)' }, { id: 'l', label: '(나)' }, { id: 'm', label: '(다)' }], links: [{ from: 'l', to: 'g', label: '노동정책 건의', arrow: 'forward' }, { from: 'm', to: 'l', label: '임금 제공', arrow: 'forward' }, { from: 'l', to: 'm', label: '근로 제공', arrow: 'forward' }] },
  matrix: { id: 'F1', kind: 'diagram', diagramType: 'matrix', title: null, xAxis: { label: '자신이', low: '안다', high: '모른다' }, yAxis: { label: '타인이', low: '모른다', high: '안다' }, quadrants: ['열린 창', '보이지 않는 창', '숨겨진 창', '미지의 창'], points: [{ label: 'A', x: 7, y: 8 }] },
  nesting: { id: 'F1', kind: 'diagram', diagramType: 'nesting', title: null, unit: 'cm', plans: [{ label: '1안', sheetWidth: 80, sheetHeight: 40, diameter: 20, rows: [4, 4], stagger: false }, { label: '2안', sheetWidth: 80, sheetHeight: 40, diameter: 14, rows: [5, 5, 5], stagger: true }] },
};

const parsed = (type: string): FigureSpec => {
  const spec = parseFigureSpec(RAW[type]);
  if (typeof spec === 'string') throw new Error(spec);
  return spec;
};
const withRaw = (type: string, patch: Record<string, unknown>) => {
  const spec = parseFigureSpec({ ...RAW[type], ...patch });
  return typeof spec === 'string' ? [spec] : validateFigureSpec(spec);
};

describe('extended figure specs: parse, validate, render', () => {
  it.each(Object.keys(RAW).map((type) => [type]))('%s parses from strict JSON, validates, renders allowlisted SVG and an alt', (type) => {
    const spec = parsed(type);
    expect(validateFigureSpec(spec)).toEqual([]);
    expect(figureTypeOf(spec)).toBe(type);
    const svg = renderFigureSvg(spec);
    expect(svgAllowlistViolation(svg)).toBeNull();
    expect(svg).not.toMatch(/NaN|undefined|Infinity/u);
    expect(svg.slice(0, svg.indexOf('>'))).not.toMatch(/\swidth=|\sheight=/u);
    expect(figureAlt(spec).length).toBeGreaterThan(30);
    // 그림 속 라벨은 SVG 글자로 나온다(산점도·가공 형태 제외: 축·배치안 이름만)
    const textContent = svg.replace(/<[^>]+>/gu, '').replace(/\s+/gu, '');
    for (const label of collectFigureStrings(spec).filter((text) => text.length <= 6 && !/[<>&'"]/u.test(text)).slice(0, 4)) {
      expect(textContent).toContain(label.replace(/\s+/gu, ''));
    }
    const rendered = renderFigure(spec);
    expect(rendered.kind).toBe(figureFamily(figureTypeOf(spec)) === 'diagram' ? 'diagram' : 'chart');
    expect(renderFigure(spec).src).toBe(rendered.src);
  });

  it('every figure type except scene/categorical has a strict schema', () => {
    for (const type of FIGURE_TYPES.filter((entry) => entry !== 'scene' && entry !== 'categorical')) {
      const schema = figureTypeSchema(type) as { required: string[]; additionalProperties: boolean };
      expect(schema.additionalProperties).toBe(false);
      expect(schema.required).toEqual(expect.arrayContaining(['id', 'kind', 'title']));
    }
  });

  it.each([
    ['gantt period over 31 cells', 'gantt', { end: 40 }, /31칸/u],
    ['gantt planned outside the period', 'gantt', { tasks: [{ name: 'A', plannedStart: 0, plannedEnd: 3, doneUntil: null }] }, /기간/u],
    ['gantt done beyond the planned end', 'gantt', { tasks: [{ name: 'A', plannedStart: 1, plannedEnd: 5, doneUntil: 6 }] }, /계획 작업량을 넘을 수 없음/u],
    ['control limits out of order', 'control', { upper: 45 }, /lower < center < upper/u],
    ['control too few points', 'control', { values: [50, 51, 52] }, /8~30/u],
    ['scatter bad correlation', 'scatter', { panels: [{ title: null, xLabel: 'x', yLabel: 'y', correlation: 'huge' }] }, /correlation/u],
    ['curve x not increasing', 'curve', { preset: null, segments: null, curves: [{ name: '비용', points: [{ x: 50, y: 10 }, { x: 40, y: 20 }, { x: 90, y: 30 }] }] }, /커지는 순서/u],
    ['flow loop to a missing step', 'flow', { loops: [{ from: 's2', to: 's9', label: null }] }, /없는 단계/u],
    ['flow decision without a branch', 'flow', { loops: [] }, /다른 갈래/u],
    ['network cycle', 'network', { links: [{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }, { from: 'C', to: 'A' }, { from: 'C', to: 'D' }, { from: 'D', to: 'E' }] }, /순환/u],
    ['network non-positive duration', 'network', { tasks: [{ id: 'A', name: '작업 A', duration: 0 }, { id: 'B', name: '작업 B', duration: 2 }, { id: 'C', name: '작업 C', duration: 2 }], links: [{ from: 'A', to: 'B' }, { from: 'B', to: 'C' }] }, /0보다 크고/u],
    ['network disconnected', 'network', { links: [{ from: 'A', to: 'B' }, { from: 'C', to: 'D' }] }, /하나의 네트워크/u],
    ['fishbone with one category', 'fishbone', { categories: [{ name: '자재', causes: ['규격 미달'] }] }, /2~6/u],
    ['tree with two roots', 'tree', { nodes: [{ id: 'r', label: 'A', parent: null }, { id: 's', label: 'B', parent: null }, { id: 't', label: 'C', parent: 'r' }] }, /정확히 1개/u],
    ['tree parent cycle', 'tree', { nodes: [{ id: 'r', label: 'A', parent: null }, { id: 'a', label: 'B', parent: 'b' }, { id: 'b', label: 'C', parent: 'a' }] }, /순환/u],
    ['venn overlap with three sets', 'venn', { labels: ['A', 'B', 'C'] }, /2개/u],
    ['relation link to itself', 'relation', { links: [{ from: 'g', to: 'g', label: null, arrow: 'forward' }] }, /잘못/u],
    ['matrix point on a boundary', 'matrix', { points: [{ label: 'A', x: 5, y: 8 }] }, /경계/u],
    ['nesting that does not fit', 'nesting', { plans: [{ label: '1안', sheetWidth: 60, sheetHeight: 40, diameter: 20, rows: [4, 4], stagger: false }] }, /넘습니다/u],
  ])('rejects %s', (_, type, patch, reason) => {
    expect(withRaw(type, patch).join(' ')).toMatch(reason);
  });
});

describe('engine-computed facts', () => {
  it('computes the PERT critical path, project duration and slack (CPM)', () => {
    const schedule = networkSchedule(parsed('network') as NetworkDiagramSpec)!;
    expect(schedule.duration).toBe(27);
    expect(schedule.criticalPaths).toEqual([['A', 'B', 'D', 'E']]);
    expect(schedule.tasks.find((task) => task.id === 'C')?.slack).toBe(5);
    expect(figureAlt(parsed('network'))).toContain('[엔진 계산] 주 공정(가장 긴 경로): 작업 A→작업 B→작업 D→작업 E, 전체 작업 완료 최소 27분');
    // 두 주 공정이 함께 있으면 둘 다 적는다.
    const tie = parseFigureSpec({ ...RAW.network, tasks: [{ id: 'A', name: 'A', duration: 3 }, { id: 'B', name: 'B', duration: 4 }, { id: 'C', name: 'C', duration: 4 }, { id: 'D', name: 'D', duration: 2 }], links: [{ from: 'A', to: 'B' }, { from: 'A', to: 'C' }, { from: 'B', to: 'D' }, { from: 'C', to: 'D' }] }) as NetworkDiagramSpec;
    expect(networkSchedule(tie)?.criticalPaths).toEqual([['A', 'B', 'D'], ['A', 'C', 'D']]);
  });

  it('computes Gantt planned vs done and the delay at the status day', () => {
    const status = ganttStatus(parsed('gantt') as GanttFigureSpec);
    expect(status.map((entry) => entry.difference)).toEqual([-1, 0, -3]);
    // 기준일을 넘은 완료 막대 = 계획보다 앞섬
    const ahead = ganttStatus({ ...(parsed('gantt') as GanttFigureSpec), tasks: [{ name: '검사', plannedStart: 6, plannedEnd: 12, doneUntil: 10 }] });
    expect(ahead[0]).toMatchObject({ plannedByStatus: 3, doneDays: 5, difference: 2 });
    expect(status[0]).toMatchObject({ plannedDays: 7, doneDays: 6, plannedByStatus: 7, complete: false });
    const alt = figureAlt(parsed('gantt'));
    expect(alt).toContain('제품 1: 계획 1일～7일, 완료 작업량 1일～6일');
    expect(alt).toContain('[엔진 계산] 기준일까지 계획 대비: 제품 1 1일 지연(계획 7일분·완료 6일분), 제품 2 계획대로(계획 6일분·완료 6일분), 제품 3 3일 지연(계획 3일분·완료 0일분).');
  });

  it('finds control-chart points out of limits, runs and trends', () => {
    const facts = controlFacts(parsed('control') as ControlFigureSpec);
    expect(facts.outOfLimits).toEqual([{ index: 14, value: 64, side: 'upper' }, { index: 17, value: 39, side: 'lower' }]);
    expect(facts.inControl).toBe(false);
    const run = controlFacts({ ...(parsed('control') as ControlFigureSpec), values: [51, 52, 53, 52, 54, 51, 53, 49, 48, 50] });
    expect(run.longestRun).toMatchObject({ length: 7, side: 'upper', from: 1, to: 7 });
    expect(run.inControl).toBe(false);
    const ok = controlFacts({ ...(parsed('control') as ControlFigureSpec), values: [51, 48, 52, 47, 53, 49, 55, 46, 50.5, 49] });
    expect(ok.inControl).toBe(true);
    expect(figureAlt(parsed('control'))).toContain('14번째(64, 상한선 위), 17번째(39, 하한선 아래)');
  });

  it('generates deterministic scatter points whose correlation sign matches the spec', () => {
    const spec = parsed('scatter') as ScatterFigureSpec;
    const first = scatterPoints(spec, 0);
    expect(first.points).toHaveLength(40);
    expect(first.r).toBeGreaterThan(0.85);
    expect(scatterPoints(spec, 1).r).toBeLessThan(-0.45);
    expect(scatterPoints(spec, 0)).toEqual(first);
    expect(pearson([[0, 0], [1, 1], [2, 2]])).toBeCloseTo(1);
    expect(figureAlt(spec)).toMatch(/강한 양의 상관관계.*음의 상관관계/u);
  });

  it('describes lifecycle segments with the steepest rise and the peak', () => {
    const spec = parsed('curve') as CurveFigureSpec;
    expect(curveSegmentTrends(spec, curveLines(spec)[0])).toEqual(['(가) 완만하게 증가', '(나) 가장 가파르게 증가', '(다) 완만하게 증가(최고점 포함)', '(라) 감소']);
  });

  it('computes nesting counts and utilization and matrix quadrants', () => {
    const plan = { label: '1안', sheetWidth: 80, sheetHeight: 40, diameter: 20, rows: [4, 4], stagger: false };
    expect(nestingFacts(plan)).toEqual({ count: 8, utilization: 78.5 });
    expect(nestingFit({ ...plan, rows: [5, 4] })).toMatch(/1번째 줄/u);
    expect(quadrantOf({ x: 7, y: 8 })).toBe(1);
    expect(figureAlt(parsed('matrix'))).toContain('A(7, 8) → 오른쪽 위 ‘보이지 않는 창’');
  });
});

describe('figure text handling', () => {
  it('maps only label text, keeping ids, references and enums', () => {
    const mapped = mapFigureStrings(parsed('network'), (text) => `<${text}>`) as NetworkDiagramSpec;
    expect(mapped.tasks[0]).toEqual({ id: 'A', name: '<작업 A>', duration: 6 });
    expect(mapped.links[0]).toEqual({ from: 'A', to: 'B' });
    expect(mapped.diagramType).toBe('network');
  });
});

// ------------------------------------------------------------
// 엔진 통합
// ------------------------------------------------------------

function itemSpec(overrides: Partial<GenerativeItemSpec>): GenerativeItemSpec {
  const band = { p25: 20, median: 30, p75: 40 };
  return {
    id: 'gen_ext', ordinal: 1, subject: 'kongil', unitNumber: 7, unitTitle: '제품 개발 및 생산 관리', examFocus: '',
    targetConcept: { name: '공정 관리', definition: '', keyFacts: [], diagnosticCues: [], confusableWith: [], weight: 1 },
    companionConcepts: [], confusionPairs: [], responseMode: 'truth_combination', polarity: 'positive',
    stemEnding: '옳은 것만을 <보기>에서 있는 대로 고른 것은?', stemOpening: 'direct', stemExamples: [], conditionClause: false,
    material: { genre: '보고서', blockShape: 'text', construction: '', labelling: '', share: 1 },
    stimulusShape: 'diagram+text', figureType: 'network', scenarioArchetype: '', viewKeys: ['ㄱ', 'ㄴ', 'ㄷ'],
    comboChoiceSet: ['ㄱ', 'ㄴ', 'ㄱㄷ', 'ㄴㄷ', 'ㄱㄴㄷ'], trueViewKeys: ['ㄱ', 'ㄷ'], answerIndex: 3, falseTechniques: [],
    trueStatementPatterns: [], difficulty: Difficulty.MIDDLE, points: 2, difficultyLevers: [],
    lengths: { stem: { p25: 40, median: 55, p75: 70 }, stimulus: { p25: 80, median: 200, p75: 300 }, viewItem: band, choice: band },
    toneAndRegister: '', numericConventions: '', pitfallsToAvoid: [], diversityHint: '', unitDifficultyTier: 'standard',
    ...overrides,
  };
}

const candidate = (figure: Record<string, unknown>, text = '○○ 기업은 신제품 조립 라인의 작업 순서와 작업 시간을 정리하여 납기를 맞출 수 있는지 검토하였다. 각 작업은 앞 작업이 끝나야 시작할 수 있다.') => JSON.stringify({
  design: { scenario: '공정 검토', clues: ['작업 시간'], difficultyDevices: [] },
  blocks: [
    { type: 'text', text, title: '', headers: [], rows: [], lines: [], figureId: '' },
    { type: 'figure', text: '', title: '', headers: [], rows: [], lines: [], figureId: 'F1' },
  ],
  figures: [figure],
  stem: '다음 자료에 대한 설명으로 옳은 것만을 <보기>에서 있는 대로 고른 것은?',
  viewItems: [
    { key: 'ㄱ', text: '모든 작업을 마치는 데 최소 27분이 걸린다.', truth: true, basis: '주 공정 27분' },
    { key: 'ㄴ', text: '작업 C를 2분 줄이면 전체 시간이 2분 줄어든다.', truth: false, basis: 'C는 여유 5분' },
    { key: 'ㄷ', text: '작업 B가 늦어지면 전체 완료 시간도 늦어진다.', truth: true, basis: 'B는 주 공정' },
  ],
  explanation: { intent: '주 공정을 찾을 수 있는가?', solution: 'ㄱ 옳다. ㄴ 옳지 않다. ㄷ 옳다.', distractorNotes: ['ㄴ. C는 주 공정이 아니다.'], clues: [], steps: [], takeaway: '' },
});

describe('engine integration for charts and diagrams', () => {
  it('assembles a network diagram item with a [도식 F1] solver line carrying the computed critical path', () => {
    const spec = itemSpec({});
    const parsedCandidate = parseGenerativeCandidate(candidate(RAW.network), spec);
    expect(validateGenerativeCandidate(spec, parsedCandidate)).toEqual([]);
    const question = assembleGenerativeQuestion(spec, parsedCandidate);
    expect(isSourceBlocksStimulusData(question.stimulusData)).toBe(true);
    expect(question.stimulusData.figures.F1.kind).toBe('diagram');
    expect(renderForSolver(question)).toContain('[도식 F1] 작업 네트워크 도표');
    expect(renderForSolver(question)).toContain('전체 작업 완료 최소 27분');
  });

  it('requires the planned figure type and family', () => {
    const spec = itemSpec({});
    const wrongType = validateGenerativeCandidate(spec, parseGenerativeCandidate(candidate(RAW.flow), spec));
    expect(wrongType.map((issue) => issue.message).join(' ')).toMatch(/"network"/u);
    const wrongFamily = validateGenerativeCandidate(spec, parseGenerativeCandidate(candidate(RAW.gantt), spec));
    expect(wrongFamily.map((issue) => issue.message).join(' ')).toMatch(/도식\(diagram\)만/u);
    const ganttSpec = itemSpec({ stimulusShape: 'chart+text', figureType: 'gantt' });
    expect(validateGenerativeCandidate(ganttSpec, parseGenerativeCandidate(candidate(RAW.gantt), ganttSpec))).toEqual([]);
  });

  it('runs the concept-leak and unused-label checks over diagram labels', () => {
    const spec = itemSpec({ figureType: 'fishbone', targetConcept: { name: '특성 요인도', definition: '', keyFacts: [], diagnosticCues: [], confusableWith: [], weight: 1 } });
    const leak = { ...RAW.fishbone, title: '특성 요인도로 본 불량 원인' };
    expect(validateGenerativeCandidate(spec, parseGenerativeCandidate(candidate(leak), spec)).map((issue) => issue.code)).toContain('GEN_ANSWER_LEAK');
    // 묻지 않는 (가) 라벨: 도식 칸 전체가 라벨이면 지우지 않고 반려한다.
    const treeSpec = itemSpec({ figureType: 'tree' });
    const repaired = repairUnusedLabels(parseGenerativeCandidate(candidate(RAW.tree), treeSpec));
    expect(validateGenerativeCandidate(treeSpec, repaired).map((issue) => issue.message).join(' ')).toMatch(/라벨 \(가\)/u);
  });

  it('puts only the planned type section and schema into the brief', () => {
    const spec = itemSpec({ stimulusShape: 'chart+text', figureType: 'control' });
    const prompt = buildGenerativeItemPrompt(spec);
    expect(prompt).toContain('## 관리도 (필수');
    expect(prompt).not.toContain('## 작업 네트워크');
    const schema = generativeItemResponseFormat(spec).json_schema.schema as unknown as { properties: { figures: { items: { properties: Record<string, { enum?: string[] }> } } } };
    expect(schema.properties.figures.items.properties.chartType.enum).toEqual(['control']);
  });
});

describe('planner figure types', () => {
  it('samples figure types inside a shape family by unit share', () => {
    const profile = loadExamStyleProfile().subjects.kongil;
    const counts = new Map<string, number>();
    for (let seed = 0; seed < 400; seed += 1) {
      const rng = seededRandom(`pick-${seed}`);
      const type = pickFigureType('diagram+text', profile.units['7'], profile.bySource.moi, { figureTypes: new Map() }, rng);
      counts.set(type, (counts.get(type) ?? 0) + 1);
    }
    expect([...counts.keys()].every((type) => figureFamily(type as never) === 'diagram')).toBe(true);
    expect(counts.get('fishbone') ?? 0).toBeGreaterThan(counts.get('network') ?? 0);
    expect(counts.get('network') ?? 0).toBeGreaterThan(0);
    expect(pickFigureType('scene+dialogue', profile.units['7'], profile.bySource.moi, { figureTypes: new Map() }, Math.random)).toBe('scene');
  });

  it('plans diagram items with a figure type and never on calculation items', () => {
    const types = new Map<string, number>();
    for (let seed = 0; seed < 40; seed += 1) {
      for (const spec of planGenerativeExam({ subject: 'kongil', startUnitNum: 7, endUnitNum: 12, questionCount: 8, difficulty: Difficulty.MIDDLE, seed: `ext-${seed}` })) {
        if (spec.stimulusShape.startsWith('diagram') || spec.stimulusShape.startsWith('chart')) {
          expect(spec.figureType).toBeDefined();
          expect(figureFamily(spec.figureType!)).toBe(spec.stimulusShape.split('+')[0]);
          types.set(spec.figureType!, (types.get(spec.figureType!) ?? 0) + 1);
        }
        if (spec.calculation !== undefined) expect(spec.figureType).toBeUndefined();
      }
    }
    expect([...types.keys()]).toEqual(expect.arrayContaining(['network', 'fishbone', 'gantt', 'control', 'tree', 'categorical']));
  });

  it('keeps a figure slot\'s shape and figure type when replanning a failed item', () => {
    const request = { subject: 'kongil' as const, startUnitNum: 7, endUnitNum: 7, questionCount: 5, difficulty: Difficulty.MIDDLE, seed: 'e2e-104' };
    const failed = planGenerativeExam(request).find((spec) => spec.figureType === 'network')!;
    for (let attempt = 2; attempt <= 4; attempt += 1) {
      const next = replanGenerativeItem(request, failed, attempt, []);
      expect(next).toMatchObject({ stimulusShape: failed.stimulusShape, figureType: 'network', answerIndex: failed.answerIndex, responseMode: failed.responseMode });
      expect(next.targetConcept.name).not.toBe(failed.targetConcept.name);
      expect(next.calculation).toBeUndefined();
    }
  });
});
