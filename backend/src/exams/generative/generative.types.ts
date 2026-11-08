import type { Difficulty } from '../../entities/difficulty';
import type { FigureSpec, FigureType } from './figures/figure-spec';

export const GENERATIVE_SPEC_VERSION = 'generative-spec-v1' as const;
export const GENERATIVE_PROMPT_VERSION = 'generative-prompt-v1' as const;
export const GENERATIVE_VALIDATOR_VERSION = 'generative-validator-v1' as const;

export type GenerativeSubject = 'kongil' | 'success';

/** 실제 기출 응답 형식. sequence(순서 배열)는 0.3% 미만이라 생성하지 않는다. */
export const GENERATIVE_RESPONSE_MODES = [
  'truth_combination',
  'statement',
  'short_label',
  'pair_table',
] as const;
export type GenerativeResponseMode = (typeof GENERATIVE_RESPONSE_MODES)[number];

export type GenerativePolarity = 'positive' | 'negative';

/** 글·표·대화로 쓰는 제시문 블록 구성(그림 없음). */
export const GENERATIVE_TEXTUAL_SHAPES = [
  'text',
  'table+text',
  'table',
  'dialogue',
  'dialogue+text',
] as const;

/**
 * 엔진이 그림을 그리는 제시문 구성: 그래프(chart)는 figure spec 수치로, 인물 그림(scene)은 배치·역할로 그린다.
 * 기출의 도식·사진처럼 엔진이 못 그리는 그림은 계획하지 않는다(글·표로 바꾸어 쓴다).
 */
export const GENERATIVE_FIGURE_SHAPES = ['chart+text', 'chart', 'diagram+text', 'diagram', 'scene+dialogue'] as const;

export const GENERATIVE_STIMULUS_SHAPES = [...GENERATIVE_TEXTUAL_SHAPES, ...GENERATIVE_FIGURE_SHAPES] as const;
export type GenerativeStimulusShape = (typeof GENERATIVE_STIMULUS_SHAPES)[number];
export type GenerativeFigureShape = (typeof GENERATIVE_FIGURE_SHAPES)[number];

export function isFigureShape(shape: GenerativeStimulusShape): shape is GenerativeFigureShape {
  return (GENERATIVE_FIGURE_SHAPES as readonly string[]).includes(shape);
}

export type ComboKey = 'ㄱ' | 'ㄴ' | 'ㄷ' | 'ㄹ';

export type UnitConcept = Readonly<{
  name: string;
  definition: string;
  keyFacts: readonly string[];
  diagnosticCues: readonly string[];
  confusableWith: readonly string[];
  weight: number;
}>;

export type ConfusionPair = Readonly<{ a: string; b: string; boundary: string }>;

/** 다른 단원에서 가져와 함께 엮는 개념(에이전트 스킬의 개념 고정 계획 전용). */
export type MixConcept = UnitConcept & Readonly<{ unitNumber: number; unitTitle: string }>;

export type MaterialGenre = Readonly<{
  genre: string;
  blockShape: string;
  construction: string;
  labelling: string;
  share: number;
}>;

export type UnitStyleGuide = Readonly<{
  subject: GenerativeSubject;
  unitNumber: number;
  unitTitle: string;
  examFocus: string;
  concepts: readonly UnitConcept[];
  confusionPairs: readonly ConfusionPair[];
  materialGenres: readonly MaterialGenre[];
  scenarioArchetypes: readonly string[];
  trueStatementPatterns: readonly string[];
  falseStatementTechniques: readonly string[];
  responseFormats: Readonly<Record<string, string>>;
  stemVariants: readonly string[];
  numericConventions: string;
  toneAndRegister: string;
  difficultyLevers: readonly string[];
  pitfallsToAvoid: readonly string[];
}>;

export type LengthBand = Readonly<{ p25: number; median: number; p75: number }>;

/** 플래너가 정한 한 문항의 출제 명세. 정답 위치·참 보기·형식은 모두 서버가 정한다. */
export type GenerativeItemSpec = Readonly<{
  id: string;
  ordinal: number;
  subject: GenerativeSubject;
  unitNumber: number;
  unitTitle: string;
  examFocus: string;
  targetConcept: UnitConcept;
  /** 보기·선지에 함께 등장할 같은 단원 개념(정답 개념 제외). */
  companionConcepts: readonly UnitConcept[];
  confusionPairs: readonly ConfusionPair[];
  responseMode: GenerativeResponseMode;
  polarity: GenerativePolarity;
  /** 발문은 반드시 이 문구로 끝나야 한다. */
  stemEnding: string;
  stemOpening: 'direct' | 'declarative';
  stemExamples: readonly string[];
  conditionClause: boolean;
  material: MaterialGenre;
  stimulusShape: GenerativeStimulusShape;
  /** 그림형 문항의 그림 종류(기출 단원 비율로 뽑음): categorical·gantt·control·scatter·curve·flow·network·… ·scene */
  figureType?: FigureType;
  scenarioArchetype: string;
  /** truth_combination 전용 */
  viewKeys?: readonly ComboKey[];
  comboChoiceSet?: readonly string[];
  trueViewKeys?: readonly ComboKey[];
  /** pair_table 전용 */
  pairHeaders?: readonly [string, string];
  /** 단원 특징 문항: 서버가 규칙으로 확정한 자료 표·[조건]과 계산 진술·수치 선지 */
  calculation?: import('./calculation/calculation.types').CalculationPlan;
  answerIndex: 1 | 2 | 3 | 4 | 5;
  falseTechniques: readonly string[];
  trueStatementPatterns: readonly string[];
  difficulty: Difficulty;
  points: 2 | 3;
  difficultyLevers: readonly string[];
  lengths: Readonly<{
    stem: LengthBand;
    stimulus: LengthBand;
    viewItem: LengthBand;
    choice: LengthBand;
  }>;
  toneAndRegister: string;
  numericConventions: string;
  pitfallsToAvoid: readonly string[];
  /** 같은 시험 안 사례가 겹치지 않도록 주는 소재 힌트. */
  diversityHint: string;
  /** 기출 배점·문항 위치·계산 비율로 매긴 단원 난도 */
  unitDifficultyTier: 'easy' | 'standard' | 'hard';
  /**
   * 초고난도: 모든 <보기>·선지가 두 단계 이상 판단을 거쳐야 하고, 선지 조합에 소거 지름길이 없다
   * (어느 <보기> 하나라도 판정하지 않으면 정답 후보가 둘 이상 남는다). 서버 계산 고정 진술은 쓰지 않는다.
   */
  ultra?: boolean;
  /**
   * 함께 엮을 개념(에이전트 스킬의 개념 고정 계획 전용, 서버 파이프라인은 쓰지 않는다).
   * 제시문 단서와 진술 하나 이상에서 실제 판정 요소로 쓰여야 한다.
   */
  mixConcepts?: readonly MixConcept[];
  /** 개념 고정: 반려되어 대체 명세를 만들 때도 중심 개념·엮을 개념을 유지하고 자료·소재만 바꾼다. */
  conceptLocked?: boolean;
}>;

export type GeneratedBlock = Readonly<{
  type: 'text' | 'table' | 'dialogue' | 'figure';
  text: string;
  title: string;
  headers: readonly string[];
  rows: readonly (readonly string[])[];
  lines: readonly Readonly<{ speaker: string; text: string }>[];
  /** figure 블록 전용: candidate.figures[].id */
  figureId?: string;
}>;

/** LLM 출력(정답 위치 없음). 서버가 명세에 맞춰 조립한다. */
export type GenerativeCandidate = Readonly<{
  design: Readonly<{
    scenario: string;
    clues: readonly string[];
    difficultyDevices: readonly string[];
    /** 엮을 개념마다 판정 요소로 쓴 진술 표지(ㄱ~ㄹ, 정답·오답1~4). spec.mixConcepts가 있을 때만 쓴다. */
    mixUse?: readonly Readonly<{ concept: string; statements: readonly string[] }>[];
  }>;
  blocks: readonly GeneratedBlock[];
  /** 그림형 문항의 그림 명세(엔진이 SVG로 그린다). figure 블록이 id로 가리킨다. */
  figures?: readonly FigureSpec[];
  stem: string;
  viewItems?: readonly Readonly<{ key: ComboKey; text: string; truth: boolean; basis: string }>[];
  keyedChoice?: Readonly<{ text: string; basis: string }>;
  otherChoices?: readonly Readonly<{ text: string; basis: string }>[];
  pairTable?: Readonly<{
    headers: readonly [string, string];
    keyedRow: readonly [string, string];
    otherRows: readonly (readonly [string, string])[];
  }>;
  explanation: Readonly<{
    intent: string;
    solution: string;
    distractorNotes: readonly string[];
    /** 단계별 해설(공부 화면 conceptHighlightV2 재료): 제시문 인용 단서, 풀이 순서, 핵심 정리 */
    clues: readonly Readonly<{ quote: string; why: string }>[];
    steps: readonly string[];
    takeaway: string;
  }>;
}>;

/** 공부 화면과 같은 단계별 해설 형식. verdict는 진술이 옳으면 O, 옳지 않으면 X(정답 판정이 아님). */
export type ConceptHighlightV2 = Readonly<{
  stimulusClues: readonly Readonly<{ quote: string; why: string }>[];
  optionAnalysis: readonly (
    | Readonly<{ optionNum: number; verdict: 'O' | 'X'; reasoning: string }>
    | Readonly<{ optionKey: string; verdict: 'O' | 'X'; reasoning: string }>
  )[];
  solvingFlow: readonly Readonly<{ step: number; action: string }>[];
  takeaway: string;
}>;

export type BlindSolveResult = Readonly<{
  answerIndex: 1 | 2 | 3 | 4 | 5;
  ambiguity: 'none' | 'minor' | 'major';
  /** 교과 오류·내부 모순·언급만 하고 제시하지 않은 자료·범주 오류 */
  curriculumIssues: readonly string[];
  /** 제시문이 정답 개념명이나 정의를 사실상 그대로 알려 주는가 */
  answerGivenAway: boolean;
  /** 검토자가 본 실제 난도 */
  perceivedDifficulty: 'easy' | 'moderate' | 'hard';
  /** 교과 개념 없이 제시문의 값·문장만 읽으면 판정되는 진술의 표지(ㄱ, ②…) */
  trivialStatements: readonly string[];
  /**
   * 제시문(자료)을 전혀 읽지 않고 교과 개념 암기만으로 판정되는 진술의 표지 — 에이전트 스킬 검토에만 있는 필드.
   * 서버 파이프라인 검토 스키마에는 없어 빈 배열로 읽힌다.
   */
  dataFreeStatements?: readonly string[];
  /**
   * 아래는 에이전트 스킬 검토에만 있는 필드(서버 검토 스키마에는 없어 비어 있다).
   * 진술별 최소 사고 단계 수 — 초고난도 판정을 체감 난도 대신 이 수로 한다.
   */
  statementAnalysis?: readonly Readonly<{ label: string; steps: number }>[];
  /** 일부 진술만 판정하고 소거로 정답에 이르는 길이 있는가 */
  eliminationShortcut?: boolean;
  /** 발문이 한 번에 읽히지 않는 문제(정보 과적, 자료·조건 나열 등) */
  stemIssues?: readonly string[];
  /** 함께 엮은 개념 중 실제로 어떤 진술 판정에 필요했던 것 */
  mixConceptsUsed?: readonly string[];
  reasoning: string;
}>;

export type LlmTelemetry = Readonly<{
  model: string;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}>;

export type GenerativeFailureCode =
  | 'GEN_PROVIDER_ERROR'
  | 'GEN_PROVIDER_TIMEOUT'
  /** 사용자 취소·작업 마감으로 호출이 끊김(시간 초과와 구분) */
  | 'GEN_CANCELED'
  | 'GEN_SCHEMA_INVALID'
  | 'GEN_STEM_INVALID'
  | 'GEN_STIMULUS_INVALID'
  /** 그림 명세(그래프 수치·축, 인물 배치·화자) 위반 */
  | 'GEN_FIGURE_INVALID'
  | 'GEN_TRUTH_PLAN_MISMATCH'
  | 'GEN_CHOICES_INVALID'
  | 'GEN_ANSWER_LEAK'
  | 'GEN_TOO_EASY'
  | 'GEN_LENGTH_OUT_OF_RANGE'
  | 'GEN_EXPLANATION_INVALID'
  | 'GEN_BLIND_SOLVE_MISMATCH'
  | 'GEN_AMBIGUOUS'
  | 'GEN_DUPLICATE';
