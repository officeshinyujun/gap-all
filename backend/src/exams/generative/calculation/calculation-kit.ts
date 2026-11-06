import type {
  CalculationFormat,
  CalculationPlan,
  CalculationScenario,
  CalculationStatement,
  NumericQuestion,
  StatementTemplate,
} from './calculation.types';

export type Rng = () => number;

export function pick<T>(values: readonly T[], rng: Rng): T {
  return values[Math.floor(rng() * values.length)] ?? values[0];
}

export function shuffle<T>(values: readonly T[], rng: Rng): T[] {
  const result = [...values];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(rng() * (index + 1));
    [result[index], result[swap]] = [result[swap], result[index]];
  }
  return result;
}

export function randInt(min: number, max: number, rng: Rng): number {
  return min + Math.floor(rng() * (max - min + 1));
}

/** 부동소수 오차를 없앤 소수 둘째 자리 반올림 */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function num(value: number): string {
  return round2(value).toLocaleString('ko-KR', { maximumFractionDigits: 2 });
}

export function won(value: number): string {
  return `${Math.round(value).toLocaleString('ko-KR')}원`;
}

/** 단위가 붙은 수치. "원"은 천 단위 구분, " PPM"처럼 앞 공백도 그대로 둔다. */
export function formatValue(value: number, unit: string): string {
  if (unit === '원') return won(value);
  if (unit === '만 원') return manwon(value);
  return `${num(value)}${unit}`;
}

/** 만 원 단위 금액: 1억 이상은 "3억 2,500만 원"처럼 쓴다. */
export function manwon(value: number): string {
  const eok = Math.floor(value / 10_000);
  const rest = round2(value - eok * 10_000);
  if (eok === 0) return `${num(rest)}만 원`;
  return rest === 0 ? `${num(eok)}억 원` : `${num(eok)}억 ${num(rest)}만 원`;
}

export type SimpleDate = Readonly<{ year: number; month: number; day: number }>;

export function addDays(date: SimpleDate, days: number): SimpleDate {
  const value = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() };
}

export function addMonths(date: SimpleDate, months: number): SimpleDate {
  const value = new Date(Date.UTC(date.year, date.month - 1 + months, date.day));
  return { year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate() };
}

export function formatDate(date: SimpleDate): string {
  return `${date.year}년 ${date.month}월 ${date.day}일`;
}

export function daysBetween(from: SimpleDate, to: SimpleDate): number {
  return Math.round(
    (Date.UTC(to.year, to.month - 1, to.day) - Date.UTC(from.year, from.month - 1, from.day)) / 86_400_000,
  );
}

export function clock(minutes: number): string {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  return `${String(Math.floor(normalized / 60)).padStart(2, '0')}:${String(normalized % 60).padStart(2, '0')}`;
}

/** 거짓 문장이 참 문장과 같아지지 않을 때만 템플릿을 만든다. */
export function template(trueText: string, falseText: string, rationale: string): StatementTemplate | undefined {
  return trueText === falseText ? undefined : { trueText, falseText, rationale };
}

export function compactTemplates(
  entries: Readonly<Record<string, StatementTemplate | undefined>>,
): Record<string, StatementTemplate> {
  const result: Record<string, StatementTemplate> = {};
  for (const [id, value] of Object.entries(entries)) {
    if (value !== undefined) result[id] = value;
  }
  return result;
}

/**
 * 오름차순 수치 선지 5개를 정답이 answerIndex에 오도록 만든다.
 * 기출처럼 대표 계산 실수 값을 먼저 쓰고, 모자라면 정답에서 step 간격으로 채운다.
 * 정답 아래에 필요한 개수만큼 min 이상의 값을 만들 수 없으면 undefined.
 */
export function placeNumericChoices(
  correct: number,
  mistakes: readonly number[],
  answerIndex: number,
  step: number,
  min: number,
  rng: Rng,
): number[] | undefined {
  const below = answerIndex - 1;
  const above = 5 - answerIndex;
  const target = round2(correct);
  const pool = [...new Set(mistakes.map(round2))].filter((value) => value !== target && value >= min);
  const lower = shuffle(pool.filter((value) => value < target), rng).slice(0, below);
  const upper = shuffle(pool.filter((value) => value > target), rng).slice(0, above);
  for (let k = 1; lower.length < below; k += 1) {
    const value = round2(target - k * step);
    if (value < min) return undefined;
    if (!lower.includes(value)) lower.push(value);
  }
  for (let k = 1; upper.length < above; k += 1) {
    const value = round2(target + k * step);
    if (!upper.includes(value)) upper.push(value);
  }
  return [...lower.sort((a, b) => a - b), target, ...upper.sort((a, b) => a - b)];
}

/** <보기>형: 참 보기 하나·거짓 보기 하나에 서로 다른 계산 진술을 넣는다. */
export function statementAssignments(
  templates: Readonly<Record<string, StatementTemplate>>,
  rng: Rng,
  viewKeys: readonly string[],
  trueKeys: readonly string[],
): CalculationStatement[] {
  const ids = shuffle(Object.keys(templates), rng);
  const trueSet = new Set(trueKeys);
  const trueKey = shuffle(viewKeys.filter((key) => trueSet.has(key)), rng)[0];
  const falseKey = shuffle(viewKeys.filter((key) => !trueSet.has(key)), rng)[0];
  const statements: CalculationStatement[] = [];
  for (const [key, truth] of [[trueKey, true], [falseKey, false]] as const) {
    const id = ids[statements.length];
    if (key === undefined || id === undefined) continue;
    const entry = templates[id];
    statements.push({
      key,
      text: truth ? entry.trueText : entry.falseText,
      truth,
      rationale: truth ? entry.rationale : `옳지 않다. ${entry.rationale}`,
    });
  }
  return statements.sort((left, right) => viewKeys.indexOf(left.key) - viewKeys.indexOf(right.key));
}

export type PlanContext = Readonly<{
  viewKeys?: readonly string[];
  trueViewKeys?: readonly string[];
  answerIndex: number;
  polarity: 'positive' | 'negative';
}>;

/** 시나리오를 형식에 맞는 계획으로 바꾼다. 형식에 필요한 재료가 없으면 undefined. */
export function scenarioToPlan(
  scenario: CalculationScenario,
  format: CalculationFormat,
  rng: Rng,
  context: PlanContext,
): CalculationPlan | undefined {
  const base = {
    kind: scenario.kind,
    format,
    genre: scenario.genre,
    context: scenario.context,
    otherHint: scenario.otherHint,
    tables: scenario.tables,
    conditions: scenario.conditions,
    ...(scenario.facts === undefined ? {} : { facts: scenario.facts }),
  };
  if (format === 'statements') {
    if (context.viewKeys === undefined || context.trueViewKeys === undefined) return undefined;
    if (Object.keys(scenario.templates).length < 2) return undefined;
    const statements = statementAssignments(scenario.templates, rng, context.viewKeys, context.trueViewKeys);
    return statements.length === 0 ? undefined : { ...base, statements };
  }
  if (format === 'choices') {
    const ids = shuffle(Object.keys(scenario.templates), rng);
    if (ids.length < 2) return undefined;
    const keyedTemplate = scenario.templates[ids[0]];
    const otherTemplate = scenario.templates[ids[1]];
    // 옳은 것 고르기: 정답 = 참 진술, 오답 하나 = 거짓 진술 / 옳지 않은 것 고르기: 반대
    const positive = context.polarity === 'positive';
    return {
      ...base,
      statements: [],
      choices: {
        keyed: {
          text: positive ? keyedTemplate.trueText : keyedTemplate.falseText,
          truth: positive,
          rationale: positive ? keyedTemplate.rationale : `옳지 않다. ${keyedTemplate.rationale}`,
        },
        distractor: {
          text: positive ? otherTemplate.falseText : otherTemplate.trueText,
          truth: !positive,
          rationale: positive ? `옳지 않다. ${otherTemplate.rationale}` : otherTemplate.rationale,
        },
      },
    };
  }
  if (context.polarity !== 'positive') return undefined;
  for (const question of shuffle(scenario.numeric, rng)) {
    const numeric = numericChoices(question, context.answerIndex, rng);
    if (numeric !== undefined) return { ...base, statements: [], numeric };
  }
  return undefined;
}

function numericChoices(question: NumericQuestion, answerIndex: number, rng: Rng): CalculationPlan['numeric'] {
  const values = placeNumericChoices(
    question.correct,
    question.mistakes.map((mistake) => mistake.value),
    answerIndex,
    question.step,
    question.min,
    rng,
  );
  if (values === undefined) return undefined;
  const reasons = new Map(question.mistakes.map((mistake) => [round2(mistake.value), mistake.reason]));
  return {
    stem: question.stem,
    choices: values.map((value) => formatValue(value, question.unit)),
    rationale: question.rationale,
    distractorNotes: values
      .filter((value) => value !== round2(question.correct) && reasons.has(value))
      .map((value) => `${josa(formatValue(value, question.unit), '은/는')} ${reasons.get(value)}`),
  };
}

type JosaPair = '을/를' | '은/는' | '이/가' | '와/과' | '으로/로';

/** 받침에 맞는 조사를 붙인다. 숫자·영문은 읽는 소리 기준(1·3·6·7·8·0, L·M·N은 받침). */
export function josa(word: string, pair: JosaPair): string {
  const last = word.trim().slice(-1);
  const code = last.charCodeAt(0);
  let batchim = false;
  let rieul = false;
  if (code >= 0xac00 && code <= 0xd7a3) {
    const final = (code - 0xac00) % 28;
    batchim = final > 0;
    rieul = final === 8;
  } else if (/[0-9]/u.test(last)) {
    batchim = '013678'.includes(last);
    rieul = '178'.includes(last);
  } else if (/[LMNlmn]/u.test(last)) {
    batchim = true;
    rieul = /[Ll]/u.test(last);
  }
  const [withBatchim, without] = pair.split('/');
  if (pair === '으로/로') return `${word}${batchim && !rieul ? withBatchim : without}`;
  return `${word}${batchim ? withBatchim : without}`;
}
