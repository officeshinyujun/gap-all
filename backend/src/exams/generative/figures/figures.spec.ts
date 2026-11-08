import { Difficulty } from '../../../entities/difficulty';
import { isSourceBlocksStimulusData } from '../../source-blocks-stimulus';
import { decodeSvgDataUri, svgAllowlistViolation } from '../../svg-allowlist';
import {
  assembleGenerativeQuestion,
  parseGenerativeCandidate,
  renderForSolver,
  stimulusPlainText,
  validateGenerativeCandidate,
} from '../generative-item-assembler';
import { planGenerativeExam, shapeWeights } from '../generative-item-planner';
import { blindSolveSystemPrompt, buildGenerativeItemPrompt, generativeItemResponseFormat } from '../generative-item-prompt';
import type { GenerativeItemSpec } from '../generative.types';
import { loadExamStyleProfile } from '../exam-style-knowledge';
import {
  CHART_TYPES,
  SCENE_ROLES,
  figureAlt,
  parseFigureSpec,
  validateFigureSpec,
  type ChartFigureSpec,
  type FigureSpec,
  type SceneFigureSpec,
} from './figure-spec';
import { figureIdPrefix, renderFigure, renderFigureSvg } from './figure-svg';

const pareto: ChartFigureSpec = {
  id: 'F1',
  kind: 'chart',
  chartType: 'bar_line',
  title: '〈항목별 불량품 수와 누적 비율〉',
  categoryLabel: '항목',
  categories: ['치수', '도장', '흠집', '기타'],
  series: [
    { name: '불량품 수', values: [30, 10, 7, 3], render: 'bar', axis: 'left' },
    { name: '누적 비율', values: [60, 80, 94, 100], render: 'line', axis: 'right' },
  ],
  valueAxis: { label: '불량품 수', unit: '개', min: 0, max: 40, step: 10 },
  secondaryAxis: { label: '누적 비율', unit: '%', min: 0, max: 100, step: 20 },
};

const chartOf = (chartType: ChartFigureSpec['chartType']): ChartFigureSpec => {
  switch (chartType) {
    case 'bar_line':
      return pareto;
    case 'pie':
      return { id: 'F1', kind: 'chart', chartType, categories: ['A', 'B', 'C'], series: [{ name: '구성비', values: [50, 30, 20] }], valueAxis: { label: '비율', unit: '%', min: 0, max: 100 } };
    case 'stacked_bar':
    case 'stacked_hbar':
      return {
        id: 'F1', kind: 'chart', chartType, percent: true, categories: ['1공장', '2공장'],
        series: [{ name: '국내', values: [60, 45] }, { name: '수출', values: [40, 55] }],
        valueAxis: { label: '비율', unit: '%', min: 0, max: 100, step: 20 },
      };
    case 'radar':
      return { id: 'F1', kind: 'chart', chartType, categories: ['의사소통', '수리', '문제 해결', '대인 관계', '직업윤리'], series: [{ name: '학생 A', values: [4, 3, 5, 2, 4] }, { name: '학생 B', values: [3, 5, 2, 4, 3] }], valueAxis: { label: '점수', unit: '점', min: 0, max: 5, step: 1 } };
    default:
      return {
        id: 'F1', kind: 'chart', chartType, categories: ['2022년', '2023년', '2024년'],
        series: [{ name: 'A 공장', values: [12, 18, 15] }, { name: 'B 공장', values: [8, 10, 16] }],
        valueAxis: { label: '생산량', unit: '만 개', min: 0, max: 20, step: 5 },
      };
  }
};

const interview: SceneFigureSpec = {
  id: 'F1',
  kind: 'scene',
  layout: 'pair',
  people: [
    { speaker: '기자', role: 'reporter', gender: 'female', age: 'adult' },
    { speaker: 'A 씨', role: 'executive', gender: 'male', age: 'adult' },
  ],
};

const svgOf = (spec: FigureSpec) => renderFigureSvg(spec);

describe('figure spec', () => {
  it('parses a strict-schema chart (nulls mean "absent") and a scene', () => {
    const chart = parseFigureSpec({ ...pareto, title: null, categoryLabel: null, showValues: null, percent: null });
    expect(typeof chart).not.toBe('string');
    expect(chart).toMatchObject({ kind: 'chart', chartType: 'bar_line', categories: pareto.categories });
    expect((chart as ChartFigureSpec).title).toBeUndefined();
    expect(parseFigureSpec(interview)).toEqual(interview);
  });

  it('rejects malformed specs with a concrete reason', () => {
    expect(parseFigureSpec({ ...pareto, id: 'X1' })).toMatch(/F1~F9/u);
    expect(parseFigureSpec({ ...pareto, chartType: 'donut' })).toMatch(/chartType/u);
    expect(parseFigureSpec({ ...pareto, series: [{ name: 'a', values: ['1'] }] })).toMatch(/숫자 배열/u);
    expect(parseFigureSpec({ ...interview, people: [{ speaker: '기자', role: 'pilot', gender: 'female', age: 'adult' }] })).toMatch(/role/u);
    expect(parseFigureSpec({ id: 'F1', kind: 'map' })).toMatch(/kind/u);
  });

  it('accepts every valid chart type and scene layout', () => {
    for (const type of CHART_TYPES) expect(validateFigureSpec(chartOf(type))).toEqual([]);
    expect(validateFigureSpec(interview)).toEqual([]);
  });

  it.each([
    ['values/categories length', { ...pareto, series: [{ ...pareto.series[0], values: [30, 10] }, pareto.series[1]] }, /범주 4개와 다릅니다/u],
    ['value outside the axis', { ...pareto, series: [{ ...pareto.series[0], values: [45, 10, 7, 3] }, pareto.series[1]] }, /축 범위/u],
    ['step not dividing the range', { ...pareto, valueAxis: { ...pareto.valueAxis, step: 15 } }, /나누어떨어지게/u],
    ['duplicate series names', { ...chartOf('bar'), series: [{ name: 'A', values: [1, 2, 3] }, { name: 'A', values: [1, 2, 3] }] }, /계열 이름이 중복/u],
    ['too long category name', { ...chartOf('bar'), categories: ['아주 긴 범주 이름이 열여섯 자를 넘음', 'B', 'C'] }, /1~16자/u],
    ['pie not summing to 100', { ...chartOf('pie'), series: [{ name: '구성비', values: [50, 30, 10] }] }, /100±0.5/u],
    ['100% stack not summing to 100', { ...chartOf('stacked_bar'), series: [{ name: '국내', values: [60, 45] }, { name: '수출', values: [30, 55] }] }, /100% 누적/u],
    ['bar_line without a line series', { ...pareto, series: [pareto.series[0]], secondaryAxis: undefined }, /render "line"/u],
    ['secondary axis outside bar_line', { ...chartOf('bar'), secondaryAxis: pareto.secondaryAxis }, /bar_line에서만/u],
  ])('rejects %s', (_, spec, reason) => {
    expect(validateFigureSpec(spec as ChartFigureSpec).join(' ')).toMatch(reason);
  });

  it('rejects scenes whose people do not fit the layout', () => {
    expect(validateFigureSpec({ ...interview, layout: 'single' }).join(' ')).toMatch(/1명/u);
    expect(validateFigureSpec({ ...interview, people: [interview.people[0], interview.people[0]] }).join(' ')).toMatch(/같은 화자/u);
  });

  it('writes an alt text with axes, units, categories and every value', () => {
    const alt = figureAlt(pareto);
    expect(alt).toContain('불량품 수(개) 0～40(10 간격)');
    expect(alt).toContain('누적 비율(%) 0～100(20 간격)');
    expect(alt).toContain('치수 30, 도장 10, 흠집 7, 기타 3');
    expect(alt).toContain('치수 60, 도장 80, 흠집 94, 기타 100');
    expect(figureAlt(chartOf('pie'))).toContain('A 50%, B 30%, C 20%');
    expect(figureAlt(interview)).toBe('장식용. 기자(기자)와 A 씨(경영자)가 마주 보고 이야기하는 인물 그림. 대화 내용은 이어지는 대화 블록에 있음.');
  });
});

describe('figure SVG renderer', () => {
  it.each(CHART_TYPES.map((type) => [type]))('renders a %s chart that passes the strict allowlist', (type) => {
    const svg = svgOf(chartOf(type));
    expect(svgAllowlistViolation(svg)).toBeNull();
    const root = svg.slice(0, svg.indexOf('>'));
    expect(root).toMatch(/viewBox="0 0 480 \d+(\.\d+)?"/u);
    expect(root).not.toMatch(/\swidth=|\sheight=/u);
    expect(root).toContain("font-family=\"&#39;Noto Sans KR&#39;");
    for (const category of chartOf(type).categories) expect(svg).toContain(`>${category}<`);
    // 회색조만 쓴다.
    for (const [, color] of svg.matchAll(/(?:fill|stroke)="(#[0-9a-f]{3,6})"/giu)) {
      const hex = color.length === 4 ? color.replace(/^#(.)(.)(.)$/u, '#$1$1$2$2$3$3') : color;
      expect(hex.slice(1, 3)).toBe(hex.slice(3, 5));
      expect(hex.slice(3, 5)).toBe(hex.slice(5, 7));
    }
  });

  it('draws one bar per category and series, axis titles with units, and value labels', () => {
    const spec = chartOf('bar');
    const svg = svgOf(spec);
    const prefix = figureIdPrefix(spec);
    const bars = [...svg.matchAll(/<rect x="[\d.]+" y="[\d.]+" width="[\d.]+" height="[\d.]+" fill="(#fff|#b4b4b4)" stroke="#000" stroke-width="1"\/>/gu)];
    expect(bars).toHaveLength(spec.categories.length * spec.series.length);
    expect(svg).toContain('>생산량(만 개)<');
    expect(svg).toContain('>18<');
    expect(svg).toContain('stroke-dasharray="3 3"');
    expect(svg).toContain(`id="${prefix}-hatch"`);
  });

  it('draws the pareto right-hand cumulative axis and line markers', () => {
    const svg = svgOf(pareto);
    expect(svg).toContain('>누적 비율(%)<');
    expect(svg).toMatch(/<polyline points="[^"]+" fill="none" stroke="#000"/u);
    expect(svg.match(/<polyline points="([^"]+)"/u)?.[1].split(' ')).toHaveLength(4);
    // 범례 표식 1개 + 점 4개
    expect(svg.match(/<circle cx="[\d.]+" cy="[\d.]+" r="3.6"/gu)).toHaveLength(5);
    expect(svg).toContain('>94%<');
  });

  it('labels pie slices "nn%" and draws a legend', () => {
    const svg = svgOf(chartOf('pie'));
    expect(svg.match(/<path d="M[^"]*A92 92/gu)).toHaveLength(3);
    expect(svg).toContain('>50%<');
    expect(svg).toContain('>A<');
  });

  it('prefixes pattern ids per figure so two inlined figures never share ids', () => {
    const a = chartOf('stacked_bar');
    const b = { ...a, categories: ['3공장', '4공장'] };
    expect(figureIdPrefix(a)).not.toBe(figureIdPrefix(b));
    expect(figureIdPrefix(a)).toMatch(/^F1-[0-9a-f]{6}$/u);
    const three = { ...chartOf('bar'), series: [...chartOf('bar').series, { name: 'C 공장', values: [5, 6, 7] }] };
    expect(svgOf(three)).toContain(`fill="url(#${figureIdPrefix(three)}-hatch)"`);
  });

  it('draws scenes without any text and mirrors the right-hand person of a pair', () => {
    const pair = svgOf(interview);
    expect(svgAllowlistViolation(pair)).toBeNull();
    expect(pair).not.toMatch(/<text/u);
    expect(pair).toContain('scale(-1 1)');
    expect(pair).toMatch(/viewBox="0 0 480 224"/u);
    const presenter = svgOf({ id: 'F1', kind: 'scene', layout: 'presenter', people: [{ speaker: '학생', role: 'student', gender: 'female', age: 'teen' }] });
    expect(presenter).not.toMatch(/<text/u);
    expect(presenter).toMatch(/viewBox="0 0 520 240"/u);
  });

  it('renders every role, gender and age as a valid, text-free person', () => {
    for (const role of SCENE_ROLES) {
      for (const gender of ['female', 'male'] as const) {
        for (const age of ['child', 'teen', 'adult', 'senior'] as const) {
          const svg = svgOf({ id: 'F1', kind: 'scene', layout: 'single', people: [{ speaker: 'A', role, gender, age }] });
          expect(svgAllowlistViolation(svg)).toBeNull();
          expect(svg).not.toMatch(/<text|NaN|undefined/u);
        }
      }
    }
  });

  it('produces a base64 SVG data URI entry with alt, kind and the source spec', () => {
    const figure = renderFigure(pareto);
    expect(figure.src.startsWith('data:image/svg+xml;base64,')).toBe(true);
    expect(decodeSvgDataUri(figure.src)).toBe(renderFigureSvg(pareto));
    expect(figure.kind).toBe('chart');
    expect(figure.spec).toBe(pareto);
    expect(renderFigure(interview).kind).toBe('illustration');
    // 결정론
    expect(renderFigure(pareto).src).toBe(figure.src);
  });
});

// ------------------------------------------------------------
// 엔진 통합
// ------------------------------------------------------------

const band = { p25: 20, median: 30, p75: 40 };

function itemSpec(overrides: Partial<GenerativeItemSpec> = {}): GenerativeItemSpec {
  return {
    id: 'gen_fig',
    ordinal: 1,
    subject: 'kongil',
    unitNumber: 11,
    unitTitle: '품질 관리',
    examFocus: '',
    targetConcept: {
      name: '파레토도',
      definition: '불량 항목을 크기 순으로 나열한 막대와 누적 비율 꺾은선으로 중점 관리 대상을 찾는 도구',
      keyFacts: [],
      diagnosticCues: [],
      confusableWith: ['특성 요인도'],
      weight: 3,
    },
    companionConcepts: [],
    confusionPairs: [],
    responseMode: 'truth_combination',
    polarity: 'positive',
    stemEnding: '옳은 것만을 <보기>에서 있는 대로 고른 것은?',
    stemOpening: 'direct',
    stemExamples: [],
    conditionClause: false,
    material: { genre: '품질 개선 보고서', blockShape: 'text+table', construction: '', labelling: '', share: 1 },
    stimulusShape: 'chart+text',
    scenarioArchetype: '불량 개선',
    viewKeys: ['ㄱ', 'ㄴ', 'ㄷ'],
    comboChoiceSet: ['ㄱ', 'ㄴ', 'ㄱㄷ', 'ㄴㄷ', 'ㄱㄴㄷ'],
    trueViewKeys: ['ㄱ', 'ㄷ'],
    answerIndex: 3,
    falseTechniques: ['개념 바꿔치기'],
    trueStatementPatterns: [],
    difficulty: Difficulty.MIDDLE,
    points: 2,
    difficultyLevers: [],
    lengths: {
      stem: { p25: 40, median: 55, p75: 70 },
      stimulus: { p25: 80, median: 200, p75: 300 },
      viewItem: band,
      choice: band,
    },
    toneAndRegister: '',
    numericConventions: '',
    pitfallsToAvoid: [],
    diversityHint: '자동차 부품 제조 기업',
    unitDifficultyTier: 'standard',
    ...overrides,
  };
}

const explanation = {
  intent: '불량 자료로 중점 관리 대상을 판단할 수 있는가?',
  solution: 'ㄱ은 옳다. ㄴ은 옳지 않다. ㄷ은 옳다.',
  distractorNotes: ['ㄴ. 누적 비율은 상위 두 항목에서 80%이다.'],
  clues: [{ quote: '불량품 50개의 원인을 항목별로 집계', why: '항목별 집계' }],
  steps: ['그래프 확인', '누적 비율 계산', '판정'],
  takeaway: '누적 비율로 중점 관리 항목을 정한다.',
};

const chartCandidate = (overrides: Record<string, unknown> = {}) => JSON.stringify({
  design: { scenario: '불량 개선', clues: ['상위 두 항목 누적 80%'], difficultyDevices: [] },
  blocks: [
    { type: 'text', text: '○○ 기업은 지난달 생산한 부품에서 나온 불량품 50개의 원인을 항목별로 집계하여 다음 분기 개선 대상을 정하려고 한다.', title: '', headers: [], rows: [], lines: [], figureId: '' },
    { type: 'figure', text: '', title: '', headers: [], rows: [], lines: [], figureId: 'F1' },
  ],
  figures: [{ ...pareto, title: '〈항목별 불량품 수와 누적 비율〉', showValues: null, percent: null }],
  stem: '다음 자료에 대한 설명으로 옳은 것만을 <보기>에서 있는 대로 고른 것은?',
  viewItems: [
    { key: 'ㄱ', text: '상위 두 항목만 개선해도 불량의 80%를 줄일 수 있다.', truth: true, basis: '누적 80%' },
    { key: 'ㄴ', text: '흠집을 줄이는 것이 도장을 줄이는 것보다 효과가 크다.', truth: false, basis: '흠집 7 < 도장 10' },
    { key: 'ㄷ', text: '치수 불량 한 항목이 전체 불량의 60%를 차지한다.', truth: true, basis: '30/50' },
  ],
  explanation,
  ...overrides,
});

const sceneSpec = () => itemSpec({
  subject: 'success',
  unitNumber: 1,
  stimulusShape: 'scene+dialogue',
  material: { genre: '인터뷰', blockShape: 'dialogue', construction: '', labelling: '', share: 1 },
  targetConcept: { name: '직업의 의미', definition: '', keyFacts: [], diagnosticCues: [], confusableWith: [], weight: 1 },
});

const sceneCandidate = (people = interview.people, extraBlocks: unknown[] = []) => JSON.stringify({
  design: { scenario: '인터뷰', clues: ['보람'], difficultyDevices: [] },
  blocks: [
    ...extraBlocks,
    {
      type: 'dialogue', text: '', title: '', headers: [], rows: [], figureId: '',
      lines: [
        { speaker: '기자', text: '회사를 세우신 계기를 말씀해 주시겠습니까?' },
        { speaker: 'A 씨', text: '저는 지역 청년들이 고향에서 안정적으로 일할 곳을 만들고 싶어 창업하였고, 지금은 직원 스무 명과 함께 수익의 일부를 지역 장학금으로 내놓고 있습니다.' },
      ],
    },
    { type: 'figure', text: '', title: '', headers: [], rows: [], lines: [], figureId: 'F1' },
  ],
  figures: [{ ...interview, people: [...people].reverse() }],
  stem: '다음 대화에 나타난 직업관에 대한 설명으로 옳은 것만을 <보기>에서 있는 대로 고른 것은?',
  viewItems: [
    { key: 'ㄱ', text: 'A 씨는 일을 통해 지역 사회에 기여하려 한다.', truth: true, basis: '장학금' },
    { key: 'ㄴ', text: 'A 씨는 경제적 보상만을 직업의 목적으로 여긴다.', truth: false, basis: '' },
    { key: 'ㄷ', text: 'A 씨는 직업을 통해 다른 사람과 협력하고 있다.', truth: true, basis: '' },
  ],
  explanation,
});

describe('engine integration', () => {
  it('assembles a chart item: SVG data URI figure, alt, spec, figure block and solver text', () => {
    const spec = itemSpec();
    const candidate = parseGenerativeCandidate(chartCandidate(), spec);
    expect(validateGenerativeCandidate(spec, candidate)).toEqual([]);
    const question = assembleGenerativeQuestion(spec, candidate);
    expect(isSourceBlocksStimulusData(question.stimulusData)).toBe(true);
    expect(question.stimulusData.blocks.map((block) => block.type)).toEqual(['text', 'figure']);
    expect(question.stimulusData.blocks[1]).toEqual({ type: 'figure', figure_id: 'F1' });
    const figure = question.stimulusData.figures.F1;
    expect(figure.kind).toBe('chart');
    expect(figure.src?.startsWith('data:image/svg+xml;base64,')).toBe(true);
    expect(figure.spec).toMatchObject({ chartType: 'bar_line', categories: ['치수', '도장', '흠집', '기타'] });
    const solver = renderForSolver(question);
    expect(solver).toContain('[그래프 F1] 막대그래프와 꺾은선 그래프를 겹친 그래프(이중 축).');
    expect(solver).toContain('치수 30, 도장 10, 흠집 7, 기타 3');
    // 그래프 라벨은 학생이 읽는 글자이므로 제시문 글자에 들어간다(노출·라벨·중복 검사용).
    expect(stimulusPlainText(candidate.blocks, candidate.figures)).toContain('누적 비율');
  });

  it('catches the answer concept in chart labels and graph values repeated in the text', () => {
    const spec = itemSpec();
    const leak = JSON.parse(chartCandidate());
    leak.figures[0].title = '파레토도로 본 불량 현황';
    expect(validateGenerativeCandidate(spec, parseGenerativeCandidate(JSON.stringify(leak), spec)).map((issue) => issue.code)).toContain('GEN_ANSWER_LEAK');
    const repeated = JSON.parse(chartCandidate());
    repeated.blocks[0].text = '집계 결과 치수 불량은 30개, 도장 불량은 10개, 흠집 불량은 7개였다. 회사는 다음 분기 개선 대상을 정하려고 한다.';
    const issues = validateGenerativeCandidate(spec, parseGenerativeCandidate(JSON.stringify(repeated), spec));
    expect(issues.map((issue) => issue.message).join(' ')).toMatch(/그래프 F1의 범주별 수치/u);
  });

  it('rejects invalid chart specs, missing figure blocks, figure tokens in text and figures on non-figure items', () => {
    const spec = itemSpec();
    const bad = JSON.parse(chartCandidate());
    bad.figures[0].valueAxis.max = 25;
    expect(validateGenerativeCandidate(spec, parseGenerativeCandidate(JSON.stringify(bad), spec)).map((issue) => issue.code)).toContain('GEN_FIGURE_INVALID');
    const noBlock = JSON.parse(chartCandidate());
    noBlock.blocks = [noBlock.blocks[0]];
    const noBlockIssues = validateGenerativeCandidate(spec, parseGenerativeCandidate(JSON.stringify(noBlock), spec));
    expect(noBlockIssues.map((issue) => issue.code)).toEqual(expect.arrayContaining(['GEN_STIMULUS_INVALID', 'GEN_FIGURE_INVALID']));
    const token = JSON.parse(chartCandidate());
    token.blocks[0].text += ' [그림 F1]을 보고 판단한다.';
    expect(validateGenerativeCandidate(spec, parseGenerativeCandidate(JSON.stringify(token), spec)).map((issue) => issue.message).join(' ')).toMatch(/figure 블록/u);
    const textSpec = itemSpec({ stimulusShape: 'text' });
    const extra = JSON.parse(chartCandidate());
    expect(validateGenerativeCandidate(textSpec, parseGenerativeCandidate(JSON.stringify(extra), textSpec)).map((issue) => issue.message).join(' ')).toMatch(/그림 없이/u);
    expect(() => parseGenerativeCandidate(chartCandidate({ figures: [{ id: 'F1', kind: 'chart', chartType: 'gantt' }] }), spec)).toThrow(/GEN_FIGURE_INVALID/u);
  });

  it('assembles a scene item: figure placed before the dialogue, pair ordered by first speaker', () => {
    const spec = sceneSpec();
    const candidate = parseGenerativeCandidate(sceneCandidate(), spec);
    expect(validateGenerativeCandidate(spec, candidate)).toEqual([]);
    expect(candidate.blocks.map((block) => block.type)).toEqual(['figure', 'dialogue']);
    const scene = candidate.figures?.[0] as SceneFigureSpec;
    expect(scene.people.map((person) => person.speaker)).toEqual(['기자', 'A 씨']);
    const question = assembleGenerativeQuestion(spec, candidate);
    expect(question.stimulusData.figures.F1.kind).toBe('illustration');
    expect(renderForSolver(question)).toContain('[그림 F1] 장식용.');
  });

  it('rejects scenes whose speakers are not dialogue speakers or that lack a dialogue', () => {
    const spec = sceneSpec();
    const wrong = parseGenerativeCandidate(sceneCandidate([interview.people[0], { ...interview.people[1], speaker: '대표' }]), spec);
    expect(validateGenerativeCandidate(spec, wrong).map((issue) => issue.message).join(' ')).toMatch(/"대표"이\(가\) 대화 화자/u);
    const raw = JSON.parse(sceneCandidate());
    raw.blocks = raw.blocks.filter((block: { type: string }) => block.type !== 'dialogue');
    raw.blocks.push({ type: 'text', text: '기자와 A 씨가 이야기를 나누었다. A 씨는 지역 청년을 위해 회사를 세웠다.', title: '', headers: [], rows: [], lines: [] });
    const issues = validateGenerativeCandidate(spec, parseGenerativeCandidate(JSON.stringify(raw), spec)).map((issue) => issue.message).join(' ');
    expect(issues).toMatch(/dialogue\) 블록이 있어야/u);
  });

  it('puts figure rules and a figure schema in the writing brief only for figure items', () => {
    const chartPrompt = buildGenerativeItemPrompt(itemSpec());
    expect(chartPrompt).toContain('## 그래프 (필수');
    expect(chartPrompt).toContain('text 블록에 범주별 수치를 다시 적지 말고');
    const scenePrompt = buildGenerativeItemPrompt(sceneSpec());
    expect(scenePrompt).toContain('## 인물 그림 (필수');
    expect(scenePrompt).toContain('reporter=기자(마이크)');
    expect(buildGenerativeItemPrompt(itemSpec({ stimulusShape: 'text' }))).not.toContain('## 그래프');
    const chartSchema = generativeItemResponseFormat(itemSpec()).json_schema.schema as { required: string[]; properties: Record<string, { items?: { properties?: Record<string, unknown> } }> };
    expect(chartSchema.required).toEqual(expect.arrayContaining(['blocks', 'figures', 'stem']));
    expect(chartSchema.properties.blocks.items?.properties).toHaveProperty('figureId');
    const textSchema = generativeItemResponseFormat(itemSpec({ stimulusShape: 'text' })).json_schema.schema as { required: string[]; properties: Record<string, { items?: { properties?: Record<string, unknown> } }> };
    expect(textSchema.required).not.toContain('figures');
    expect(textSchema.properties.blocks.items?.properties).not.toHaveProperty('figureId');
    expect(blindSolveSystemPrompt()).toContain('[그래프 F1]');
  });
});

describe('planner figure shapes', () => {
  const profile = loadExamStyleProfile().subjects;

  it('weights figure shapes by the unit share of drawable figures and never for calculation items', () => {
    const unit = profile.kongil.units['11'];
    const weights = Object.fromEntries(shapeWeights(unit, profile.kongil.bySource.moi, { shapes: new Map() }, true).map((entry) => [entry.value, entry.weight]));
    expect(weights['chart+text']).toBeGreaterThan(0.2);
    const none = shapeWeights(unit, profile.kongil.bySource.moi, { shapes: new Map() }, false);
    expect(none.filter((entry) => ['chart', 'chart+text', 'scene+dialogue'].includes(entry.value)).every((entry) => entry.weight === 0)).toBe(true);
    const after = Object.fromEntries(shapeWeights(unit, profile.kongil.bySource.moi, { shapes: new Map([['scene+dialogue', 1]]) }, true).map((entry) => [entry.value, entry.weight]));
    expect(after['chart+text']).toBeCloseTo(weights['chart+text'] * 0.45, 6);
  });

  it('plans charts and scenes in proportion across many exams, without calculation items using them', () => {
    const shapes = new Map<string, number>();
    let total = 0;
    for (let seed = 0; seed < 30; seed += 1) {
      for (const [subject, units] of [['kongil', [10, 11]], ['success', [1, 3]]] as const) {
        const specs = planGenerativeExam({ subject, startUnitNum: units[0], endUnitNum: units[1], questionCount: 6, difficulty: Difficulty.MIDDLE, seed: `fig-${seed}` });
        for (const spec of specs) {
          total += 1;
          shapes.set(spec.stimulusShape, (shapes.get(spec.stimulusShape) ?? 0) + 1);
          if (spec.calculation !== undefined) expect(spec.stimulusShape).toBe('table+text');
        }
      }
    }
    const share = (shape: string) => (shapes.get(shape) ?? 0) / total;
    expect(share('chart+text') + share('chart')).toBeGreaterThan(0.04);
    expect(share('scene+dialogue')).toBeGreaterThan(0.04);
    expect(share('chart+text') + share('chart') + share('scene+dialogue')).toBeLessThan(0.4);
  });
});
