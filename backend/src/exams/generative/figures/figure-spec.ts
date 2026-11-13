/**
 * 그림형 문항의 figure spec(모델이 쓰는 구조화 명세) 타입·해석·검증·설명문.
 *
 * 모델은 SVG를 쓰지 않는다. 그래프(chart)는 범주·계열·축 값을, 인물 그림(scene)은 배치·역할만 적고,
 * 엔진(figure-svg.ts)이 같은 명세로 항상 같은 SVG를 그린다. 순수 TS(스킬 엔진 번들에 들어간다).
 */
import { josa, num } from '../calculation/calculation-kit';
import { EXT_CHART_TYPES, extChartAlt, parseExtChart, validateExtChart, type ExtChartSpec, type ExtChartType } from './figure-chart-ext';
import { DIAGRAM_TYPES, diagramAlt, parseDiagram, validateDiagram, type DiagramSpec, type DiagramType } from './figure-diagram';
import { FigureParseError, collectFigureStrings, countFigureNumbers } from './figure-parse';

export const CHART_TYPES = [
  'bar',
  'hbar',
  'stacked_bar',
  'stacked_hbar',
  'line',
  'bar_line',
  'pie',
  'radar',
] as const;
export type ChartType = (typeof CHART_TYPES)[number];

export const SCENE_LAYOUTS = ['single', 'pair', 'presenter'] as const;
export type SceneLayout = (typeof SCENE_LAYOUTS)[number];

/** 인물 역할: 옷차림·소품이 정해진다(그림 안에 글자는 없다). */
export const SCENE_ROLES = [
  'reporter',
  'teacher',
  'student',
  'office',
  'executive',
  'worker',
  'engineer',
  'doctor',
  'counselor',
  'chef',
  'farmer',
  'researcher',
  'presenter',
  'citizen',
] as const;
export type SceneRole = (typeof SCENE_ROLES)[number];

export const ROLE_LABELS: Readonly<Record<SceneRole, string>> = {
  reporter: '기자',
  teacher: '교사',
  student: '학생',
  office: '회사원',
  executive: '경영자',
  worker: '현장 근로자',
  engineer: '엔지니어',
  doctor: '의사',
  counselor: '상담사',
  chef: '요리사',
  farmer: '농업인',
  researcher: '연구원',
  presenter: '발표자',
  citizen: '시민',
};

/** 지시서에 넣는 역할별 옷차림·소품 설명 */
export const ROLE_PROPS: Readonly<Record<SceneRole, string>> = {
  reporter: '마이크',
  teacher: '책',
  student: '교복',
  office: '셔츠·넥타이·사원증',
  executive: '정장·넥타이',
  worker: '안전모·안전 조끼',
  engineer: '안전모·작업복·태블릿',
  doctor: '가운·청진기',
  counselor: '카디건·서류철',
  chef: '조리모·조리복',
  farmer: '밀짚모자·멜빵 작업복',
  researcher: '실험 가운·보안경',
  presenter: '마이크·재킷',
  citizen: '평상복',
};

export const PERSON_GENDERS = ['female', 'male'] as const;
export type PersonGender = (typeof PERSON_GENDERS)[number];
export const PERSON_AGES = ['child', 'teen', 'adult', 'senior'] as const;
export type PersonAge = (typeof PERSON_AGES)[number];

export type ChartAxis = Readonly<{ label: string; unit: string; min: number; max: number; step?: number }>;

export type ChartSeries = Readonly<{
  name: string;
  values: readonly number[];
  render?: 'bar' | 'line';
  axis?: 'left' | 'right';
}>;

export type ChartFigureSpec = Readonly<{
  id: string;
  kind: 'chart';
  chartType: ChartType;
  title?: string;
  /** 범주축 이름(예: "항목", "연도"). 없으면 표시하지 않는다. */
  categoryLabel?: string;
  categories: readonly string[];
  series: readonly ChartSeries[];
  valueAxis: ChartAxis;
  /** bar_line(파레토·이중 축) 전용 오른쪽 축 */
  secondaryAxis?: ChartAxis;
  /** 값 라벨 표시(기본 true) */
  showValues?: boolean;
  /** 백분율 자료: 누적 막대는 범주마다, 원그래프는 전체 합이 100이어야 한다. */
  percent?: boolean;
}>;

export type ScenePerson = Readonly<{
  speaker: string;
  role: SceneRole;
  gender: PersonGender;
  age: PersonAge;
}>;

export type SceneFigureSpec = Readonly<{
  id: string;
  kind: 'scene';
  layout: SceneLayout;
  people: readonly ScenePerson[];
}>;

export type FigureSpec = ChartFigureSpec | ExtChartSpec | DiagramSpec | SceneFigureSpec;

/**
 * 그림 종류(출제 명세의 figureType): 범주형 그래프(categorical: 막대·선·누적·원·방사형) | 간트·관리도·산점도·곡선 |
 * 도식 9종 | 인물 그림(scene)
 */
export const FIGURE_TYPES = ['categorical', ...EXT_CHART_TYPES, ...DIAGRAM_TYPES, 'scene'] as const;
export type FigureType = (typeof FIGURE_TYPES)[number];
export { EXT_CHART_TYPES, DIAGRAM_TYPES };
export type { ExtChartSpec, ExtChartType, DiagramSpec, DiagramType };

export function isCategoricalChart(spec: FigureSpec): spec is ChartFigureSpec {
  return spec.kind === 'chart' && (CHART_TYPES as readonly string[]).includes(spec.chartType);
}

export function isExtChart(spec: FigureSpec): spec is ExtChartSpec {
  return spec.kind === 'chart' && (EXT_CHART_TYPES as readonly string[]).includes(spec.chartType);
}

export function figureTypeOf(spec: FigureSpec): FigureType {
  if (spec.kind === 'scene') return 'scene';
  if (spec.kind === 'diagram') return spec.diagramType;
  return isCategoricalChart(spec) ? 'categorical' : (spec as ExtChartSpec).chartType;
}

/** 그림 종류가 속하는 큰 갈래(제시문 구성 chart·diagram·scene) */
export function figureFamily(type: FigureType): 'chart' | 'diagram' | 'scene' {
  if (type === 'scene') return 'scene';
  return (DIAGRAM_TYPES as readonly string[]).includes(type) ? 'diagram' : 'chart';
}

export const FIGURE_ID_PATTERN = /^F[1-9]$/u;
const NAME_MAX = 16;
const PERCENT_TOLERANCE = 0.5;

/** 앱 figures 맵의 kind 값(기출 코퍼스와 같은 이름) */
export function figureKind(spec: FigureSpec): 'chart' | 'diagram' | 'illustration' {
  return spec.kind === 'scene' ? 'illustration' : spec.kind;
}

/**
 * 모델 출력 한 개를 명세로 정규화한다. 형식부터 틀리면 사유 문자열을 돌려준다.
 * (strict JSON 스키마는 선택 필드를 null로 채우므로 null은 "없음"으로 읽는다.)
 */
export function parseFigureSpec(raw: unknown): FigureSpec | string {
  if (!isRecord(raw)) return '그림 명세가 객체가 아닙니다.';
  const id = str(raw.id);
  if (!FIGURE_ID_PATTERN.test(id)) return `그림 id "${id}"는 F1~F9 형식이어야 합니다.`;
  if (raw.kind === 'diagram' || (raw.kind === 'chart' && (EXT_CHART_TYPES as readonly string[]).includes(str(raw.chartType)))) {
    try {
      return raw.kind === 'diagram' ? parseDiagram(raw, id) : parseExtChart(raw, id, str(raw.chartType) as ExtChartType);
    } catch (error) {
      if (error instanceof FigureParseError) return `${id}: ${error.message}`;
      throw error;
    }
  }
  if (raw.kind === 'chart') {
    const chartType = str(raw.chartType) as ChartType;
    if (!CHART_TYPES.includes(chartType)) return `${id}: chartType은 ${[...CHART_TYPES, ...EXT_CHART_TYPES].join('|')} 중 하나여야 합니다.`;
    const valueAxis = parseAxis(raw.valueAxis);
    if (valueAxis === null) return `${id}: valueAxis(label, unit, min, max)가 없거나 형식이 틀렸습니다.`;
    const secondary = raw.secondaryAxis === null || raw.secondaryAxis === undefined ? undefined : parseAxis(raw.secondaryAxis);
    if (secondary === null) return `${id}: secondaryAxis 형식이 틀렸습니다.`;
    if (!Array.isArray(raw.categories) || !raw.categories.every((value) => typeof value === 'string')) {
      return `${id}: categories는 문자열 배열이어야 합니다.`;
    }
    if (!Array.isArray(raw.series) || !raw.series.every(isRecord)) return `${id}: series는 객체 배열이어야 합니다.`;
    const series: ChartSeries[] = [];
    for (const entry of raw.series as Record<string, unknown>[]) {
      if (!Array.isArray(entry.values) || !entry.values.every((value) => typeof value === 'number')) {
        return `${id}: 계열 "${str(entry.name)}"의 values는 숫자 배열이어야 합니다.`;
      }
      const render = entry.render === 'bar' || entry.render === 'line' ? entry.render : undefined;
      const axis = entry.axis === 'left' || entry.axis === 'right' ? entry.axis : undefined;
      series.push({
        name: str(entry.name),
        values: [...(entry.values as number[])],
        ...(render === undefined ? {} : { render }),
        ...(axis === undefined ? {} : { axis }),
      });
    }
    const title = str(raw.title);
    const categoryLabel = str(raw.categoryLabel);
    return {
      id,
      kind: 'chart',
      chartType,
      ...(title === '' ? {} : { title }),
      ...(categoryLabel === '' ? {} : { categoryLabel }),
      categories: (raw.categories as string[]).map((value) => value.trim()),
      series,
      valueAxis,
      ...(secondary === undefined ? {} : { secondaryAxis: secondary }),
      ...(typeof raw.showValues === 'boolean' ? { showValues: raw.showValues } : {}),
      ...(typeof raw.percent === 'boolean' ? { percent: raw.percent } : {}),
    };
  }
  if (raw.kind === 'scene') {
    const layout = str(raw.layout) as SceneLayout;
    if (!SCENE_LAYOUTS.includes(layout)) return `${id}: layout은 ${SCENE_LAYOUTS.join('|')} 중 하나여야 합니다.`;
    if (!Array.isArray(raw.people) || !raw.people.every(isRecord)) return `${id}: people은 객체 배열이어야 합니다.`;
    const people: ScenePerson[] = [];
    for (const person of raw.people as Record<string, unknown>[]) {
      const role = str(person.role) as SceneRole;
      const gender = str(person.gender) as PersonGender;
      const age = str(person.age) as PersonAge;
      if (!SCENE_ROLES.includes(role)) return `${id}: role "${role}"은(는) ${SCENE_ROLES.join('|')} 중 하나여야 합니다.`;
      if (!PERSON_GENDERS.includes(gender)) return `${id}: gender는 female|male이어야 합니다.`;
      if (!PERSON_AGES.includes(age)) return `${id}: age는 ${PERSON_AGES.join('|')} 중 하나여야 합니다.`;
      people.push({ speaker: str(person.speaker), role, gender, age });
    }
    return { id, kind: 'scene', layout, people };
  }
  return `${id}: kind는 chart, diagram, scene 중 하나여야 합니다.`;
}

/** 명세 자체의 규칙 위반(문항 맥락과 무관한 것). 빈 배열이면 통과. */
export function validateFigureSpec(spec: FigureSpec): string[] {
  if (spec.kind === 'scene') return validateScene(spec);
  if (spec.kind === 'diagram') return validateDiagram(spec);
  return isCategoricalChart(spec) ? validateChart(spec) : validateExtChart(spec as ExtChartSpec);
}

function validateChart(spec: ChartFigureSpec): string[] {
  const problems: string[] = [];
  const at = (message: string) => problems.push(`${spec.id}: ${message}`);
  const { chartType, categories, series } = spec;
  const [minCategories, maxCategories] = chartType === 'radar' ? [3, 8] : chartType === 'pie' ? [2, 6] : [2, 8];
  if (categories.length < minCategories || categories.length > maxCategories) {
    at(`범주는 ${minCategories}~${maxCategories}개여야 합니다(현재 ${categories.length}개).`);
  }
  checkNames(categories, '범주', at);
  const maxSeries = chartType === 'pie' ? 1 : 4;
  if (series.length < 1 || series.length > maxSeries) at(`계열은 1~${maxSeries}개여야 합니다(현재 ${series.length}개).`);
  checkNames(series.map((entry) => entry.name), '계열', at);
  for (const entry of series) {
    if (entry.values.length !== categories.length) {
      at(`계열 "${entry.name}"의 값 ${entry.values.length}개가 범주 ${categories.length}개와 다릅니다.`);
    }
    if (entry.values.some((value) => !Number.isFinite(value))) at(`계열 "${entry.name}"에 유한하지 않은 값이 있습니다.`);
  }
  for (const [name, axis] of [['valueAxis', spec.valueAxis], ['secondaryAxis', spec.secondaryAxis]] as const) {
    if (axis === undefined) continue;
    if (!(axis.max > axis.min)) at(`${name}의 max는 min보다 커야 합니다.`);
    const step = axis.step ?? niceStep(axis.min, axis.max);
    const ticks = (axis.max - axis.min) / step;
    if (!(step > 0) || Math.abs(ticks - Math.round(ticks)) > 1e-6) {
      at(`${name}의 step(${num(step)})이 max-min(${num(axis.max - axis.min)})을 나누어떨어지게 하지 않습니다.`);
    } else if (Math.round(ticks) < 2 || Math.round(ticks) > 12) {
      at(`${name}의 눈금 칸 수는 2~12개여야 합니다(현재 ${Math.round(ticks)}칸).`);
    }
    if (axis.label.length < 1 || axis.label.length > 14) at(`${name}.label은 1~14자여야 합니다.`);
    if (axis.unit.length > 8) at(`${name}.unit은 8자 이하여야 합니다.`);
  }
  if (chartType === 'bar_line') {
    const lines = series.filter((entry) => entry.render === 'line');
    const bars = series.filter((entry) => entry.render !== 'line');
    if (lines.length === 0 || bars.length === 0) at('bar_line은 render "bar" 계열과 render "line" 계열이 하나 이상씩 있어야 합니다.');
    if (series.some((entry) => entry.axis === 'right') && spec.secondaryAxis === undefined) {
      at('오른쪽 축(axis "right") 계열이 있으면 secondaryAxis가 있어야 합니다.');
    }
    if (spec.secondaryAxis !== undefined && !series.some((entry) => entry.axis === 'right')) {
      at('secondaryAxis를 쓰려면 axis "right" 계열이 있어야 합니다.');
    }
  } else if (spec.secondaryAxis !== undefined) {
    at('secondaryAxis는 bar_line에서만 쓸 수 있습니다.');
  }
  // 값 범위
  if (chartType === 'stacked_bar' || chartType === 'stacked_hbar') {
    if (series.length < 2) at('누적 막대는 계열이 2개 이상이어야 합니다.');
    for (let index = 0; index < categories.length; index += 1) {
      const total = series.reduce((sum, entry) => sum + (entry.values[index] ?? 0), 0);
      if (total > spec.valueAxis.max + 1e-9) at(`범주 "${categories[index]}"의 누적 합 ${num(total)}이 축 최댓값 ${num(spec.valueAxis.max)}을 넘습니다.`);
      if (spec.percent === true && Math.abs(total - 100) > PERCENT_TOLERANCE) {
        at(`100% 누적 막대인데 범주 "${categories[index]}"의 합이 ${num(total)}입니다(100±0.5).`);
      }
    }
    if (series.some((entry) => entry.values.some((value) => value < 0))) at('누적 막대에 음수 값이 있습니다.');
  } else if (chartType === 'pie') {
    const values = series[0]?.values ?? [];
    const total = values.reduce((sum, value) => sum + value, 0);
    if (values.some((value) => value <= 0)) at('원그래프 조각 값은 모두 0보다 커야 합니다.');
    if (Math.abs(total - 100) > PERCENT_TOLERANCE) at(`원그래프 조각 합이 ${num(total)}%입니다(100±0.5여야 함).`);
  }
  if (chartType !== 'pie') {
    for (const entry of series) {
      const axis = entry.axis === 'right' && spec.secondaryAxis !== undefined ? spec.secondaryAxis : spec.valueAxis;
      const outside = entry.values.filter((value) => value < axis.min - 1e-9 || value > axis.max + 1e-9);
      if (outside.length > 0) {
        at(`계열 "${entry.name}"의 값 ${outside.map(num).join(', ')}이(가) 축 범위 ${num(axis.min)}~${num(axis.max)} 밖입니다.`);
      }
    }
  }
  if (spec.title !== undefined && spec.title.length > 40) at('title은 40자 이하여야 합니다.');
  if (spec.categoryLabel !== undefined && spec.categoryLabel.length > 12) at('categoryLabel은 12자 이하여야 합니다.');
  return problems;
}

function validateScene(spec: SceneFigureSpec): string[] {
  const problems: string[] = [];
  const expected = spec.layout === 'pair' ? 2 : 1;
  if (spec.people.length !== expected) {
    problems.push(`${spec.id}: layout "${spec.layout}"은(는) 인물 ${expected}명이어야 합니다(현재 ${spec.people.length}명).`);
  }
  const speakers = spec.people.map((person) => person.speaker);
  if (speakers.some((speaker) => speaker === '')) problems.push(`${spec.id}: people[].speaker가 비었습니다.`);
  if (new Set(speakers).size !== speakers.length) problems.push(`${spec.id}: 같은 화자가 두 번 나옵니다.`);
  return problems;
}

function checkNames(names: readonly string[], label: string, at: (message: string) => void): void {
  for (const name of names) {
    if (name.length < 1 || name.length > NAME_MAX) at(`${label} 이름 "${name}"은(는) 1~${NAME_MAX}자여야 합니다.`);
  }
  if (new Set(names).size !== names.length) at(`${label} 이름이 중복됩니다.`);
}

/** step을 주지 않았을 때 쓰는 눈금 간격: 칸 수가 4~10이 되는 1·2·2.5·5×10^k 중 가장 큰 것 */
export function niceStep(min: number, max: number): number {
  const span = max - min;
  if (!(span > 0)) return 1;
  const candidates: number[] = [];
  for (let power = -2; power <= 7; power += 1) {
    for (const base of [1, 2, 2.5, 5]) candidates.push(base * 10 ** power);
  }
  const fits = candidates.filter((step) => {
    const ticks = span / step;
    return Math.abs(ticks - Math.round(ticks)) < 1e-6 && ticks >= 4 && ticks <= 10;
  });
  if (fits.length > 0) return fits[fits.length - 1];
  return span / 5;
}

export function axisStep(axis: ChartAxis): number {
  return axis.step ?? niceStep(axis.min, axis.max);
}

/** 축 제목: "비율(%)", 단위가 없으면 이름만 */
export function axisTitle(axis: ChartAxis): string {
  return axis.unit === '' ? axis.label : `${axis.label}(${axis.unit})`;
}

const CHART_NAMES: Readonly<Record<ChartType, string>> = {
  bar: '세로 막대그래프',
  hbar: '가로 막대그래프',
  stacked_bar: '세로 누적 막대그래프',
  stacked_hbar: '가로 누적 막대그래프',
  line: '꺾은선 그래프',
  bar_line: '막대그래프와 꺾은선 그래프를 겹친 그래프(이중 축)',
  pie: '원그래프',
  radar: '방사형 그래프',
};

/**
 * 그림 설명문(alt): 기출 description 규칙처럼 그래프는 축·단위·범주·계열별 수치를 모두 적어
 * 블라인드 검토자와 화면 낭독기가 그림 없이도 같은 정보를 얻게 한다.
 */
export function figureAlt(spec: FigureSpec): string {
  if (spec.kind === 'scene') return sceneAlt(spec);
  if (spec.kind === 'diagram') return diagramAlt(spec);
  if (!isCategoricalChart(spec)) return extChartAlt(spec as ExtChartSpec);
  const parts: string[] = [];
  const name = spec.percent === true && spec.chartType.startsWith('stacked') ? `100% ${CHART_NAMES[spec.chartType]}` : CHART_NAMES[spec.chartType];
  parts.push(spec.title === undefined ? `${name}.` : `${name}. 제목 ‘${spec.title}’.`);
  const axisText = (axis: ChartAxis) => `${axisTitle(axis)} ${num(axis.min)}～${num(axis.max)}(${num(axisStep(axis))} 간격)`;
  const categoryText = `${spec.categoryLabel === undefined ? '' : `${spec.categoryLabel}: `}${spec.categories.join(', ')}`;
  switch (spec.chartType) {
    case 'pie': {
      const values = spec.series[0]?.values ?? [];
      parts.push(`조각(${spec.series[0]?.name ?? ''}, 12시 방향부터 시계 방향): ${spec.categories.map((category, index) => `${category} ${num(values[index] ?? 0)}%`).join(', ')}.`);
      return parts.join(' ');
    }
    case 'radar':
      parts.push(`꼭짓점(위부터 시계 방향): ${spec.categories.join(', ')}. 눈금: 중심 ${num(spec.valueAxis.min)}에서 바깥 ${num(spec.valueAxis.max)}까지 ${num(axisStep(spec.valueAxis))} 간격(${axisTitle(spec.valueAxis)}).`);
      break;
    case 'hbar':
    case 'stacked_hbar':
      parts.push(`세로축(범주) ${categoryText}. 가로축: ${axisText(spec.valueAxis)}.`);
      break;
    case 'bar_line':
      parts.push(`가로축(범주) ${categoryText}. 왼쪽 세로축: ${axisText(spec.valueAxis)}.`);
      if (spec.secondaryAxis !== undefined) parts.push(`오른쪽 세로축: ${axisText(spec.secondaryAxis)}.`);
      break;
    default:
      parts.push(`가로축(범주) ${categoryText}. 세로축: ${axisText(spec.valueAxis)}.`);
  }
  for (const entry of spec.series) {
    const shape = spec.chartType === 'bar_line'
      ? `${entry.render === 'line' ? '꺾은선' : '막대'} ‘${entry.name}’${entry.axis === 'right' ? '(오른쪽 축)' : '(왼쪽 축)'}`
      : spec.chartType === 'line' || spec.chartType === 'radar'
        ? `선 ‘${entry.name}’`
        : `${spec.series.length > 1 ? '계열' : '막대'} ‘${entry.name}’`;
    parts.push(`${shape}: ${spec.categories.map((category, index) => `${category} ${num(entry.values[index] ?? 0)}`).join(', ')}.`);
  }
  return parts.join(' ');
}

function sceneAlt(spec: SceneFigureSpec): string {
  const who = (person: ScenePerson) => `${person.speaker}(${ROLE_LABELS[person.role]})`;
  const [first, second] = spec.people;
  if (first === undefined) return '장식용 인물 그림.';
  if (spec.layout === 'pair' && second !== undefined) {
    // 괄호 뒤 조사는 괄호를 빼고 읽은 앞말(화자명)에 맞춘다("A 씨(시민)가", "상담원(직업 상담사)과").
    const and = josa(first.speaker, '이/가').endsWith('이') ? '과' : '와';
    const subject = josa(second.speaker, '이/가').endsWith('이') ? '이' : '가';
    return `장식용. ${who(first)}${and} ${who(second)}${subject} 마주 보고 이야기하는 인물 그림. 대화 내용은 이어지는 대화 블록에 있음.`;
  }
  if (spec.layout === 'presenter') {
    return `장식용. 연단 앞에서 빈 보드를 가리키며 발표하는 ${who(first)} 인물 그림. 발표 내용은 이어지는 대화 블록에 있음.`;
  }
  return `장식용. ${who(first)} 인물 그림. 말한 내용은 이어지는 대화 블록에 있음.`;
}

/** 학생이 그림에서 읽는 글자(정답 개념 노출·라벨·중복 검사용). 인물 그림에는 글자가 없다. */
export function figureVisibleText(spec: FigureSpec): string {
  if (spec.kind === 'scene') return '';
  if (!isCategoricalChart(spec)) return collectFigureStrings(spec).join(' ');
  return [
    spec.title ?? '',
    spec.categoryLabel ?? '',
    ...spec.categories,
    ...spec.series.map((entry) => entry.name),
    axisTitle(spec.valueAxis),
    spec.secondaryAxis === undefined ? '' : axisTitle(spec.secondaryAxis),
  ].filter((value) => value !== '').join(' ');
}

/** 제시문 분량 계산용: 그래프는 학생이 읽어야 하는 라벨·수치 글자 수, 인물 그림은 0 */
export function figureReadingLength(spec: FigureSpec): number {
  if (spec.kind === 'scene') return 0;
  if (!isCategoricalChart(spec)) {
    return figureVisibleText(spec).replace(/\s+/gu, '').length + countFigureNumbers(spec) * 2;
  }
  const values = spec.series.flatMap((entry) => entry.values.map((value) => num(value).length + 1));
  return figureVisibleText(spec).replace(/\s+/gu, '').length + values.reduce((sum, value) => sum + value, 0);
}

function parseAxis(value: unknown): ChartAxis | null {
  if (!isRecord(value)) return null;
  const min = value.min;
  const max = value.max;
  if (typeof min !== 'number' || typeof max !== 'number') return null;
  const step = typeof value.step === 'number' ? value.step : undefined;
  return { label: str(value.label), unit: str(value.unit), min, max, ...(step === undefined ? {} : { step }) };
}

function str(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
