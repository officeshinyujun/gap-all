// ============================================================
// ExamQuestion 타입 정의
// exam.json + ex2am.json 실사용 데이터 기반 완전 정의
// ============================================================

import type {
  TPL_COMPARATIVE_MATRIX,
  TPL_FORMAL_DOCUMENT,
  TPL_CONVERSATIONAL_FLOW,
  TPL_CASE_DIAGNOSTIC_FRAME,
  TPL_SEQUENTIAL_WORKFLOW,
  TPL_INSTRUCTIONAL_SCENE,
  TPL_DIGITAL_FORUM_INTERFACE,
  TPL_QUANTITATIVE_CHART,
  TPL_PROMOTIONAL_CANVAS,
} from './stemTypes';

// ------------------------------------------------------------
// 템플릿 이름 상수
// ------------------------------------------------------------
export const TEMPLATE_NAMES = {
  COMPARATIVE_MATRIX: 'TPL_COMPARATIVE_MATRIX',
  FORMAL_DOCUMENT: 'TPL_FORMAL_DOCUMENT',
  CONVERSATIONAL_FLOW: 'TPL_CONVERSATIONAL_FLOW',
  CASE_DIAGNOSTIC_FRAME: 'TPL_CASE_DIAGNOSTIC_FRAME',
  SEQUENTIAL_WORKFLOW: 'TPL_SEQUENTIAL_WORKFLOW',
  INSTRUCTIONAL_SCENE: 'TPL_INSTRUCTIONAL_SCENE',
  DIGITAL_FORUM_INTERFACE: 'TPL_DIGITAL_FORUM_INTERFACE',
  QUANTITATIVE_CHART: 'TPL_QUANTITATIVE_CHART',
  PROMOTIONAL_CANVAS: 'TPL_PROMOTIONAL_CANVAS',
} as const;

export type TemplateName = typeof TEMPLATE_NAMES[keyof typeof TEMPLATE_NAMES];

// ------------------------------------------------------------
// Discriminated Union — 파싱된 stimulus
// parseStimulus() 반환 타입
// ------------------------------------------------------------
export type ParsedStimulus =
  | { template: 'TPL_COMPARATIVE_MATRIX';      data: TPL_COMPARATIVE_MATRIX }
  | { template: 'TPL_FORMAL_DOCUMENT';         data: TPL_FORMAL_DOCUMENT }
  | { template: 'TPL_CONVERSATIONAL_FLOW';     data: TPL_CONVERSATIONAL_FLOW }
  | { template: 'TPL_CASE_DIAGNOSTIC_FRAME';   data: TPL_CASE_DIAGNOSTIC_FRAME }
  | { template: 'TPL_SEQUENTIAL_WORKFLOW';     data: TPL_SEQUENTIAL_WORKFLOW }
  | { template: 'TPL_INSTRUCTIONAL_SCENE';     data: TPL_INSTRUCTIONAL_SCENE }
  | { template: 'TPL_DIGITAL_FORUM_INTERFACE'; data: TPL_DIGITAL_FORUM_INTERFACE }
  | { template: 'TPL_QUANTITATIVE_CHART';      data: TPL_QUANTITATIVE_CHART }
  | { template: 'TPL_PROMOTIONAL_CANVAS';      data: TPL_PROMOTIONAL_CANVAS }
  | { template: 'TPL_PLAIN_TEXT';              data: string };

// ------------------------------------------------------------
// 선택지
// exam.json:  { id: number, text: string }
// ex2am.json: { idx: number, text: string }
// exam3.json: options_list: string[] (번호 없음, 인덱스+1이 번호)
// ------------------------------------------------------------
export interface ExamQuestionOption {
  /** exam.json 방식 */
  id?: number;
  /** ex2am.json 방식 */
  idx?: number;
  text: string;
}

// ------------------------------------------------------------
// 해설
// exam.json:  string
// ex2am.json: { correct_answer: string }
// exam3.json: { judgment: string, distractor_1?: string, distractor_2?: string, ... }
// ------------------------------------------------------------
export type ExamExplanation =
  | string
  | { correct_answer: string }
  | { judgment: string; [key: string]: string };

// ------------------------------------------------------------
// 메타데이터
// ------------------------------------------------------------
export interface ExamQuestionMetadata {
  unit_name: string;
  target_concept: string;
  /**
   * exam.json: "단일 단원 원리 적용 (중)" 형식
   * ex2am.json / exam3.json: "하" | "중" | "상" | "극상"
   */
  item_type: string;
  /** exam3.json에 추가된 난이도 필드 */
  difficulty?: string;
  /** exam.json에만 존재. 없으면 inferTemplate()으로 자동 추론 */
  recommended_template?: string;
  /** 출처 시험명 (e.g. "2024학년도 대학수학능력시험 9월 모의평가") */
  source_exam?: string;
  /** 문항 번호 */
  question_number?: number;
}

// ------------------------------------------------------------
// 문항 (최상위 타입)
// ------------------------------------------------------------
export interface ComboBlockItem {
  key: string;
  text: string;
}

export interface ComboBlock {
  title: string;
  items: ComboBlockItem[];
}

export interface ExamQuestion {
  metadata: ExamQuestionMetadata;
  render_ready: {
    question_stem: string;
    stimulus_data: unknown;
    /**
     * exam.json / ex2am.json: options 배열
     * exam3.json: options_list 문자열 배열 (인덱스+1이 번호)
     */
    options?: ExamQuestionOption[];
    options_list?: string[];
    /**
     * exam.json / ex2am.json: render_ready 내부에 위치
     * exam3.json: 최상위에 위치 (아래 explanation 필드 참조)
     */
    explanation?: ExamExplanation;
  };
  /** exam3.json: render_ready 밖 최상위에 위치 */
  explanation?: ExamExplanation;
  /** 백엔드 API에서 반환하는 정답 번호 */
  correct_answer?: number;
  /** 조합형 문항의 ㄱ~ㄹ 보기 블록 */
  combo_block?: ComboBlock | null;
}

// ------------------------------------------------------------
// 헬퍼 함수
// ------------------------------------------------------------

/**
 * explanation에서 텍스트를 추출합니다.
 */
export function getExplanationText(explanation: ExamExplanation): string {
  if (typeof explanation === 'string') return explanation;
  if ('correct_answer' in explanation) return explanation.correct_answer;
  if ('judgment' in explanation) {
    const judgment = explanation.judgment ?? '';
    const distractors = (explanation as any).distractors;
    if (distractors && typeof distractors === 'object') {
      const distractorEntries = Object.entries(distractors)
        .map(([key, val]) => `${key}번: ${val}`)
        .join('\n');
      return distractorEntries ? `${judgment}\n\n${distractorEntries}` : judgment;
    }
    const { judgment: _, ...rest } = explanation;
    const restText = Object.values(rest).filter((v) => typeof v === 'string').join('\n');
    return restText ? `${judgment}\n\n${restText}` : judgment;
  }
  return '';
}

/**
 * option에서 번호를 추출합니다.
 */
export function getOptionNumber(option: ExamQuestionOption): number {
  return option.id ?? option.idx ?? 0;
}

/**
 * options 또는 options_list를 통일된 ExamQuestionOption[] 형태로 변환합니다.
 * exam3.json의 options_list: string[] → { id: number, text: string }[]
 */
export function normalizeOptions(
  options?: ExamQuestionOption[],
  options_list?: string[],
): ExamQuestionOption[] {
  if (options && options.length > 0) return options;
  if (options_list && options_list.length > 0) {
    return options_list.map((text, i) => ({ id: i + 1, text }));
  }
  return [];
}
