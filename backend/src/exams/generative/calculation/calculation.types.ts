/**
 * 단원 특징 문항(계산·판정형)의 공통 계약.
 *
 * 각 단원 모듈은 기출 자료 구조(표·[조건])와 수치를 결정론적으로 만들고, 정답이 갈리는 진술·수치를
 * 서버 규칙으로 확정한다. LLM은 배경 서술과 나머지 보기·선지만 쓴다.
 */

export type CalculationKind =
  | 'labor'
  | 'critical_path'
  | 'parts_stock'
  | 'abc_inventory'
  | 'six_sigma'
  | 'pareto_defect'
  | 'industrial_accident'
  | 'dismissal_remedy'
  | 'night_work'
  | 'job_seeking_benefit';

/** 계산 진술을 넣는 방식: <보기> 진술, 단일 선지 진술, 수치 선지 */
export type CalculationFormat = 'statements' | 'choices' | 'numeric';

export type CalculationTable = Readonly<{
  title: string;
  headers: readonly string[];
  rows: readonly (readonly string[])[];
}>;

/** 같은 계산에 대한 참·거짓 문장. 거짓 문장은 기출의 대표 계산 실수로 만든다. */
export type StatementTemplate = Readonly<{ trueText: string; falseText: string; rationale: string }>;

export type NumericQuestion = Readonly<{
  id: string;
  /** "다음 …으로 옳은 것은?" 형태의 발문 전체 */
  stem: string;
  correct: number;
  /** 대표 계산 실수 값과 그 이유(오답 선지 후보) */
  mistakes: readonly Readonly<{ value: number; reason: string }>[];
  /** 실수 값이 모자랄 때 채우는 간격과 최솟값 */
  step: number;
  min: number;
  unit: string;
  rationale: string;
}>;

export type CalculationScenario = Readonly<{
  kind: CalculationKind;
  /** 자료 장르(플래너가 material.genre로 쓴다) */
  genre: string;
  /** text 블록에 쓸 배경 안내 */
  context: string;
  /** 나머지 보기·선지 안내 */
  otherHint: string;
  tables: readonly CalculationTable[];
  /** 제시문 끝에 서버가 붙이는 [조건] 줄 */
  conditions: readonly string[];
  templates: Readonly<Record<string, StatementTemplate>>;
  numeric: readonly NumericQuestion[];
  facts?: unknown;
}>;

export type CalculationStatement = Readonly<{ key: string; text: string; truth: boolean; rationale: string }>;

export type CalculationChoice = Readonly<{ text: string; truth: boolean; rationale: string }>;

export type CalculationPlan = Readonly<{
  kind: CalculationKind;
  format: CalculationFormat;
  genre: string;
  context: string;
  otherHint: string;
  tables: readonly CalculationTable[];
  conditions: readonly string[];
  /** statements 형식: 서버가 확정한 <보기> (key → 문장·참거짓·근거) */
  statements: readonly CalculationStatement[];
  /** choices 형식: 정답 선지와 오답 선지 하나를 서버가 확정 */
  choices?: Readonly<{ keyed: CalculationChoice; distractor: CalculationChoice }>;
  /** numeric 형식: 발문과 오름차순 수치 선지 5개(정답 위치 = 명세 answerIndex) */
  numeric?: Readonly<{
    stem: string;
    choices: readonly string[];
    rationale: string;
    distractorNotes: readonly string[];
  }>;
  facts?: unknown;
}>;
