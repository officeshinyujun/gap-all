import type { GenerationItemState } from '../exam-generation.utils';
import {
  GenerativeOutputError,
  assembleGenerativeQuestion,
  applyCalculationPlan,
  parseGenerativeCandidate,
  repairUnusedLabels,
  duplicateCheckText,
  validateGenerativeCandidate,
  type AssembledGenerativeQuestion,
} from './generative-item-assembler';
import { GenerativeProviderError, type GenerativeLlmClient } from './generative-llm.client';
import { blindSolveRejection } from './generative-gates';
import { similarity } from './text-similarity';

export { similarity };
import { legalReviewRules } from './legal-review-rules';
import type {
  BlindSolveResult,
  GenerativeCandidate,
  GenerativeFailureCode,
  GenerativeItemSpec,
  LlmTelemetry,
} from './generative.types';

/** 문항(슬롯)당 최대 시도 수. 기본 4 (AI_GENERATIVE_MAX_ATTEMPTS, 2~6). */
export function generativeMaxAttempts(environment: NodeJS.ProcessEnv = process.env): number {
  const configured = Number(environment.AI_GENERATIVE_MAX_ATTEMPTS);
  return Number.isInteger(configured) ? Math.min(6, Math.max(2, configured)) : 3;
}

/**
 * 예비 문항을 언제 시작할지. 기본은 본 문항이 마지막 시도에 들어갈 때(비용 우선).
 * AI_GENERATIVE_HEDGE_RESERVES=true면 본 문항이 처음 반려되는 순간 병렬로 시작한다(속도 우선, 목표를 채우면
 * 진행 중이던 호출이 중단되지만 그때까지 쓴 토큰은 과금된다).
 */
export function hedgeReservesEnabled(environment: NodeJS.ProcessEnv = process.env): boolean {
  return environment.AI_GENERATIVE_HEDGE_RESERVES?.trim().toLowerCase() === 'true';
}

/** 이 시도부터 개념·자료를 바꾼 대체 명세로 출제한다(앞 절반은 같은 명세를 수정 지시로 재출제). */
export function replanFromAttempt(maxAttempts: number): number {
  return Math.floor(maxAttempts / 2) + 1;
}
const NEAR_DUPLICATE_THRESHOLD = 0.55;

export type GenerativeAcceptedItem = Readonly<{
  spec: GenerativeItemSpec;
  question: AssembledGenerativeQuestion;
  candidate: GenerativeCandidate;
  solve: BlindSolveResult;
  attempt: number;
  promptHash: string;
  telemetry: readonly LlmTelemetry[];
}>;

export type GenerativeRejectedAttempt = Readonly<{
  spec: GenerativeItemSpec;
  attempt: number;
  code: GenerativeFailureCode;
  message: string;
  candidate?: GenerativeCandidate;
  solve?: BlindSolveResult;
  telemetry: readonly LlmTelemetry[];
}>;

export type GenerativePipelineOptions = Readonly<{
  /** 동시에 진행할 최대 슬롯 수. 생략하면 본 문항 + 예비 문항 전부를 한 번에 진행한다. */
  concurrency?: number;
  maxAttempts?: number;
  signal?: AbortSignal;
  isCanceled?: () => boolean;
  deadlineAtMs?: number;
  previousFingerprints?: readonly string[];
  /** 같은 슬롯이 연속 실패하면 개념·자료를 바꾼 대체 명세를 받는다. */
  replan?: (failed: GenerativeItemSpec, attempt: number, usedConcepts: readonly string[]) => GenerativeItemSpec;
  /**
   * 예비 명세. 기본은 본 문항이 끝내 실패하면 그 자리를 채우려고 시작한다.
   * hedgeReserves면 본 문항이 처음 반려되는 순간 병렬로 시작해 꼬리 시간을 줄인다(대신 중단된 호출 비용이 든다).
   */
  reserves?: readonly GenerativeItemSpec[];
  hedgeReserves?: boolean;
  /** 이만큼 통과하면 남은 호출을 중단하고 끝낸다. 기본값은 specs.length */
  targetCount?: number;
  onProgress?: (state: GenerativePipelineProgress) => void | Promise<void>;
}>;

export type GenerativePipelineProgress = Readonly<{
  completed: number;
  total: number;
  accepted: number;
  rejected: number;
  attempt: number;
  /** 0~1. 목표 문항 수 기준, 진행 중인 문항의 단계(출제 0.15 → 검토 0.6 → 완료 1)까지 반영한 진척도 */
  fraction: number;
  /** 사용자에게 보여 줄 현재 활동 (예: "3번 문항 검토 중") */
  activity: string;
  /** 본 문항(specs 순서)의 현재 상태 */
  items: readonly GenerationItemState[];
  /** 시작된 예비 문항의 현재 상태 */
  reserveItems: readonly GenerationItemState[];
}>;

/** 진행 문구에는 모델이 쓴 사유 대신 서버가 정한 고정 문구만 쓴다(모델 출력 비노출). */
const REJECTION_LABELS: Readonly<Record<GenerativeFailureCode, string>> = {
  GEN_PROVIDER_ERROR: 'AI 호출 오류',
  GEN_PROVIDER_TIMEOUT: 'AI 응답 지연',
  GEN_CANCELED: '취소됨',
  GEN_SCHEMA_INVALID: '형식 오류',
  GEN_STEM_INVALID: '발문 형식',
  GEN_STIMULUS_INVALID: '제시문 형식',
  GEN_FIGURE_INVALID: '그림 명세 오류',
  GEN_TRUTH_PLAN_MISMATCH: '보기 참/거짓 불일치',
  GEN_CHOICES_INVALID: '선지 결함',
  GEN_ANSWER_LEAK: '정답 노출',
  GEN_TOO_EASY: '난도 부족',
  GEN_LENGTH_OUT_OF_RANGE: '분량 기준 벗어남',
  GEN_EXPLANATION_INVALID: '해설 결함',
  GEN_BLIND_SOLVE_MISMATCH: '검토 풀이 정답 불일치',
  GEN_AMBIGUOUS: '모호·사실 오류',
  GEN_DUPLICATE: '중복',
};

/** 문항 하나 안에서의 단계별 진척도. 재시도해도 뒤로 가지 않게 최댓값을 유지한다. */
const SLOT_STAGE_FRACTION = { generating: 0.15, verifying: 0.6, done: 1 } as const;

type Slot = {
  spec: GenerativeItemSpec;
  reserveIndex: number | null;
  state: GenerationItemState;
  fraction: number;
  hedged: boolean;
};

export async function runGenerativePipeline(
  specs: readonly GenerativeItemSpec[],
  llm: GenerativeLlmClient,
  options: GenerativePipelineOptions,
): Promise<Readonly<{ accepted: GenerativeAcceptedItem[]; rejected: GenerativeRejectedAttempt[] }>> {
  const accepted: GenerativeAcceptedItem[] = [];
  const rejected: GenerativeRejectedAttempt[] = [];
  const seenFingerprints = new Set(options.previousFingerprints ?? []);
  const acceptedStimuli: string[] = [];
  const target = Math.max(0, Math.min(options.targetCount ?? specs.length, specs.length + (options.reserves?.length ?? 0)));
  const mainSlots: Slot[] = specs.map((spec) => ({ spec, reserveIndex: null, state: 'queued', fraction: 0, hedged: false }));
  const reserveSlots: Slot[] = [];
  const pendingReserves = [...(options.reserves ?? [])];
  const queue: Slot[] = [...mainSlots];
  const running = new Set<Promise<void>>();
  const concurrency = Math.max(1, options.concurrency ?? specs.length + pendingReserves.length);
  let completed = 0;

  // 목표 수를 채우면 남은 호출을 끊기 위한 내부 신호(사용자 취소 신호도 함께 전달).
  const internal = new AbortController();
  const forwardAbort = () => internal.abort();
  options.signal?.addEventListener('abort', forwardAbort, { once: true });
  if (options.signal?.aborted) internal.abort();
  const targetReached = () => accepted.length >= target;
  const stopped = () =>
    internal.signal.aborted ||
    options.isCanceled?.() === true ||
    (options.deadlineAtMs !== undefined && Date.now() > options.deadlineAtMs);

  const label = (slot: Slot) =>
    slot.reserveIndex === null ? `${slot.spec.ordinal}번 문항` : `예비 ${slot.reserveIndex}번 문항`;
  const emit = async (attempt: number, activity: string) => {
    const fractions = [...mainSlots, ...reserveSlots].map((slot) => slot.fraction).sort((a, b) => b - a);
    const top = fractions.slice(0, Math.max(1, target)).reduce((sum, value) => sum + value, 0);
    await options.onProgress?.({
      completed,
      total: specs.length,
      accepted: accepted.length,
      rejected: rejected.length,
      attempt,
      fraction: target === 0 ? 1 : Math.min(1, top / target),
      activity,
      items: mainSlots.map((slot) => slot.state),
      reserveItems: reserveSlots.map((slot) => slot.state),
    });
  };
  const advance = (slot: Slot, stage: keyof typeof SLOT_STAGE_FRACTION) => {
    slot.fraction = Math.max(slot.fraction, SLOT_STAGE_FRACTION[stage]);
  };

  const pump = () => {
    while (running.size < concurrency && queue.length > 0 && !stopped()) {
      const slot = queue.shift() as Slot;
      const task: Promise<void> = runSlot(slot).finally(() => {
        running.delete(task);
        pump();
      });
      running.add(task);
    }
  };

  const hedgeEarly = options.hedgeReserves ?? hedgeReservesEnabled();
  /** 본 문항 대신 예비 문항 하나를 시작한다(시점은 hedgeEarly에 따름). */
  const hedge = (slot: Slot) => {
    if (slot.reserveIndex !== null || slot.hedged || pendingReserves.length === 0 || stopped()) return;
    slot.hedged = true;
    const spec = pendingReserves.shift() as GenerativeItemSpec;
    const reserve: Slot = { spec, reserveIndex: reserveSlots.length + 1, state: 'queued', fraction: 0, hedged: true };
    reserveSlots.push(reserve);
    queue.push(reserve);
    pump();
  };

  const runSlot = async (slot: Slot): Promise<void> => {
    const original = slot.spec;
    let spec = original;
    let repairNotes: string[] = [];
    const maxAttempts = options.maxAttempts ?? generativeMaxAttempts();
    const replanAt = replanFromAttempt(maxAttempts);
    try {
      for (let attempt = 1; attempt <= maxAttempts && !stopped(); attempt += 1) {
        if (attempt === replanAt && options.replan !== undefined) {
          spec = options.replan(original, attempt, accepted.map((item) => item.spec.targetConcept.name));
          repairNotes = [];
        }
        const telemetry: LlmTelemetry[] = [];
        let candidate: GenerativeCandidate | undefined;
        let solve: BlindSolveResult | undefined;
        const reject = (code: GenerativeFailureCode, message: string, notes: readonly string[]) => {
          rejected.push({ spec, attempt, code, message, candidate, solve, telemetry: [...telemetry] });
          repairNotes = [...notes];
          if (code !== 'GEN_CANCELED' && hedgeEarly) hedge(slot);
        };
        // 비용 우선 모드에서도 마지막 시도에 들어가면 예비 문항을 함께 시작해, 끝내 실패할 때의 꼬리 시간을 줄인다.
        if (!hedgeEarly && attempt === maxAttempts && maxAttempts > 1) hedge(slot);
        advance(slot, 'generating');
        slot.state = 'generating';
        const previous = rejected.filter((item) => item.spec.ordinal === original.ordinal).at(-1);
        await emit(attempt, attempt === 1
          ? `${label(slot)} 출제 중`
          : `${label(slot)} 다시 출제 중 (${attempt}/${maxAttempts}회째` +
            `${previous === undefined ? '' : `, 직전 반려: ${REJECTION_LABELS[previous.code]}`})`);
        try {
          const generated = await llm.generateItem(spec, repairNotes, internal.signal);
          telemetry.push(generated.telemetry);
          candidate = applyCalculationPlan(spec, repairUnusedLabels(parseGenerativeCandidate(generated.content, spec)));
          const issues = validateGenerativeCandidate(spec, candidate);
          if (issues.length > 0) {
            reject(issues[0].code, issues.map((issue) => issue.message).join(' / '), issues.map((issue) => issue.message));
            continue;
          }
          const question = assembleGenerativeQuestion(spec, candidate);
          const stimulus = duplicateCheckText(spec, candidate.blocks, candidate.figures);
          if (
            seenFingerprints.has(question.fingerprint) ||
            acceptedStimuli.some((other) => similarity(other, stimulus) >= NEAR_DUPLICATE_THRESHOLD)
          ) {
            reject('GEN_DUPLICATE', '이미 생성된 문항과 거의 같습니다.', ['이전 문항과 다른 상황·소재·수치로 새로 출제하십시오.']);
            continue;
          }
          advance(slot, 'verifying');
          slot.state = 'verifying';
          await emit(attempt, `${label(slot)} 검토 중 (정답을 모르는 상태로 다시 풀기)`);
          const verified = await llm.blindSolve(question, internal.signal, legalReviewRules(spec.subject, spec.unitNumber));
          telemetry.push(verified.telemetry);
          solve = verified.result;
          const gate = blindSolveRejection(spec, solve);
          if (gate !== null) {
            reject(gate.code, gate.message, gate.notes);
            continue;
          }
          if (targetReached()) return; // 다른 슬롯이 먼저 목표를 채웠다.
          seenFingerprints.add(question.fingerprint);
          acceptedStimuli.push(stimulus);
          accepted.push({ spec, question, candidate, solve, attempt, promptHash: generated.promptHash, telemetry });
          slot.state = 'accepted';
          if (targetReached()) internal.abort();
          return;
        } catch (error: unknown) {
          if (error instanceof GenerativeOutputError) {
            reject(error.issues[0]?.code ?? 'GEN_SCHEMA_INVALID', error.message, error.issues.map((issue) => issue.message));
          } else if (error instanceof GenerativeProviderError) {
            reject(error.code, error.message, []);
            if (stopped()) return;
          } else {
            throw error;
          }
        }
      }
    } finally {
      completed += 1;
      advance(slot, 'done');
      if (slot.state !== 'accepted') slot.state = stopped() ? 'skipped' : 'failed';
      if (slot.state === 'failed') hedge(slot);
      await emit(0, slot.state === 'accepted'
        ? `${label(slot)} 완성`
        : slot.state === 'skipped'
          ? targetReached()
            ? `${label(slot)}은 목표 문항 수를 채워 중단`
            : `${label(slot)} 중단`
          : `${label(slot)}은 검증을 통과하지 못해 제외`);
    }
  };

  try {
    pump();
    while (running.size > 0) await Promise.race(running);
  } finally {
    options.signal?.removeEventListener('abort', forwardAbort);
  }
  // 시험지는 단원 순서(같은 단원 안에서는 계획 순서)로 배열한다. 예비 문항도 제 단원 자리에 들어간다.
  accepted.sort((left, right) => left.spec.unitNumber - right.spec.unitNumber || left.spec.ordinal - right.spec.ordinal);
  return { accepted, rejected };
}

