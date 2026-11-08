/**
 * 에이전트 스킬(exam-question-generator)용 출제 엔진 진입점.
 *
 * 서버 파이프라인은 LLM API를 직접 부르지만, 스킬에서는 스킬을 쓰는 에이전트가 출제·검토 모델 역할을 한다.
 * 여기에는 API·DB·Nest 의존이 없는 결정론적 부분만 모은다:
 * 출제 계획 → 출제 지시서 → 후보 검증·서버 확정값 반영·조립 → 블라인드 검토 지시서 → 검토 판정 → 앱 형식 변환.
 */
import { Difficulty } from '../../../entities/difficulty';
import {
  GenerativeOutputError,
  applyCalculationPlan,
  assembleGenerativeQuestion,
  duplicateCheckText,
  parseGenerativeCandidate,
  renderForSolver,
  repairUnusedLabels,
  validateGenerativeCandidate,
  type AssembledGenerativeQuestion,
} from '../generative-item-assembler';
import { blindSolveRejection, parseBlindSolveResult, type BlindSolveRejection } from '../generative-gates';
import {
  planGenerativeExam,
  replanGenerativeItem,
  type GenerativePlanRequest,
} from '../generative-item-planner';
import {
  blindSolveResponseFormat,
  blindSolveSystemPrompt,
  blindSolveUserPrompt,
  selfCheck,
  buildGenerativeItemPrompt,
  generativeItemResponseFormat,
  generativeSystemPrompt,
} from '../generative-item-prompt';
import type { GenerativeItemSpec, GenerativeSubject } from '../generative.types';
import { loadExamStyleProfile, loadUnitGuide } from '../exam-style-knowledge';
import { legalReviewRules } from '../legal-review-rules';
import { similarity } from '../text-similarity';

export { Difficulty };
export type { AssembledGenerativeQuestion, GenerativeItemSpec, GenerativePlanRequest };

export const SKILL_ENGINE_VERSION = 'exam-skill-engine-v5';
const NEAR_DUPLICATE_THRESHOLD = 0.55;

export type PlanArgs = Readonly<{
  subject: GenerativeSubject;
  startUnit: number;
  endUnit: number;
  count: number;
  difficulty: Difficulty;
  seed?: string;
  concepts?: readonly string[];
  /** 초고난도 모드: 난이도는 HIGH로 고정 */
  ultra?: boolean;
}>;

export function toPlanRequest(args: PlanArgs): GenerativePlanRequest {
  if (args.startUnit < 1 || args.endUnit > 20 || args.startUnit > args.endUnit) {
    throw new Error('단원 범위는 1~20 사이에서 시작 ≤ 끝이어야 합니다.');
  }
  if (!Number.isInteger(args.count) || args.count < 1 || args.count > 30) {
    throw new Error('문항 수는 1~30이어야 합니다.');
  }
  return {
    subject: args.subject,
    startUnitNum: args.startUnit,
    endUnitNum: args.endUnit,
    questionCount: args.count,
    difficulty: args.ultra ? Difficulty.HIGH : args.difficulty,
    seed: args.seed ?? `skill-${Date.now()}`,
    ...(args.ultra ? { ultra: true } : {}),
    ...(args.concepts === undefined || args.concepts.length === 0 ? {} : { targetConcepts: args.concepts }),
  };
}

export function planExam(request: GenerativePlanRequest): GenerativeItemSpec[] {
  return planGenerativeExam(request);
}

/** 같은 형식·정답 위치로 개념·자료를 바꾼 대체 명세(같은 명세로 계속 실패할 때) */
export function replanItem(
  request: GenerativePlanRequest,
  failed: GenerativeItemSpec,
  attempt: number,
  usedConcepts: readonly string[],
): GenerativeItemSpec {
  return replanGenerativeItem(request, failed, attempt, usedConcepts);
}

export type Brief = Readonly<{ system: string; user: string; schema: unknown }>;

/** 출제 지시서: 에이전트가 이 지시와 JSON 스키마에 맞춰 후보 JSON 하나를 쓴다. */
export function writingBrief(spec: GenerativeItemSpec, repairNotes: readonly string[] = []): Brief {
  return {
    system: generativeSystemPrompt(),
    user: [buildGenerativeItemPrompt(spec, repairNotes), ...selfCheck(spec)].join('\n'),
    schema: generativeItemResponseFormat(spec).json_schema.schema,
  };
}

export type CheckResult =
  | Readonly<{ ok: true; question: AssembledGenerativeQuestion; duplicateText: string }>
  | Readonly<{ ok: false; issues: readonly Readonly<{ code: string; message: string }>[] }>;

/**
 * 후보 검증: 문체 보정 → 묻지 않는 라벨 정리 → 서버 확정값(계산 표·진술·수치 선지) 반영 → 결정론적 검증 → 조립.
 * otherTexts는 이미 통과한 문항들의 duplicateText(지문 중복 검사용).
 */
export function checkCandidate(
  spec: GenerativeItemSpec,
  content: string,
  otherTexts: readonly string[] = [],
): CheckResult {
  try {
    const candidate = applyCalculationPlan(spec, repairUnusedLabels(parseGenerativeCandidate(content, spec), { keepTableHeadLabels: true }));
    const issues = validateGenerativeCandidate(spec, candidate, { precheck: true });
    if (issues.length > 0) return { ok: false, issues };
    const question = assembleGenerativeQuestion(spec, candidate);
    const duplicateText = duplicateCheckText(spec, candidate.blocks, candidate.figures);
    if (otherTexts.some((other) => similarity(other, duplicateText) >= NEAR_DUPLICATE_THRESHOLD)) {
      return { ok: false, issues: [{ code: 'GEN_DUPLICATE', message: '이미 통과한 문항과 제시문이 거의 같습니다. 다른 상황·소재·수치로 새로 쓰십시오.' }] };
    }
    return { ok: true, question, duplicateText };
  } catch (error) {
    if (error instanceof GenerativeOutputError) return { ok: false, issues: error.issues };
    throw error;
  }
}

/** 블라인드 검토 지시서: 정답·해설 없이 학생 화면과 같은 정보 + (법·제도 단원) 정합성 점검 항목 */
export function reviewBrief(spec: GenerativeItemSpec, question: AssembledGenerativeQuestion): Brief {
  return {
    system: blindSolveSystemPrompt({ dataFree: true }),
    user: blindSolveUserPrompt(renderForSolver(question), legalReviewRules(spec.subject, spec.unitNumber), spec.ultra === true),
    schema: blindSolveResponseFormat({ dataFree: true }).json_schema.schema,
  };
}

export type ReviewJudgement =
  | Readonly<{ accepted: true }>
  | Readonly<{ accepted: false; rejection: BlindSolveRejection }>
  | Readonly<{ accepted: false; invalid: string }>;

/** 검토 결과(JSON 문자열)를 서버 파이프라인과 같은 기준으로 판정한다. */
export function judgeReview(spec: GenerativeItemSpec, content: string): ReviewJudgement {
  let solve;
  try {
    solve = parseBlindSolveResult(content);
  } catch (error) {
    return { accepted: false, invalid: error instanceof Error ? error.message : String(error) };
  }
  const rejection = blindSolveRejection(spec, solve);
  return rejection === null ? { accepted: true } : { accepted: false, rejection };
}

/** 앱(questions 테이블·시험지 렌더러)과 같은 문항 형식 */
export function toAppQuestion(spec: GenerativeItemSpec, question: AssembledGenerativeQuestion, orderIndex: number) {
  return {
    orderIndex,
    subject: spec.subject,
    unitNumber: spec.unitNumber,
    unitTitle: spec.unitTitle,
    targetConcept: question.targetConcept,
    itemType: question.itemType,
    difficulty: question.difficulty,
    points: question.points,
    recommendedTemplate: question.recommendedTemplate,
    questionStem: question.questionStem,
    stimulusData: question.stimulusData,
    optionsList: question.optionsList,
    comboBlock: question.comboBlock,
    correctAnswer: question.correctAnswer,
    explanation: question.explanation,
    fingerprint: question.fingerprint,
    generation: { engine: SKILL_ENGINE_VERSION, specId: spec.id, profileVersion: loadExamStyleProfile().version },
  };
}

export function unitTitle(subject: GenerativeSubject, unitNumber: number): string {
  return loadUnitGuide(subject, unitNumber).unitTitle;
}
