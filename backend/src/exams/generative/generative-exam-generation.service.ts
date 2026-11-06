import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { In, Repository } from 'typeorm';
import { AiGenerationCandidate } from '../../entities/ai-generation-candidate.entity';
import { AiGenerationRun } from '../../entities/ai-generation-run.entity';
import { ExamItem } from '../../entities/exam-item.entity';
import { ExamRecord, ExamSourceType } from '../../entities/exam-record.entity';
import { Question } from '../../entities/question.entity';
import { Unit } from '../../entities/unit.entity';
import type { CreateExamDto } from '../dto/create-exam.dto';
import type { ExamGenerationProgressReporter } from '../exam-generation.utils';
import { generativeSubjectFromSlug, loadExamStyleProfile } from './exam-style-knowledge';
import {
  planGenerativeExam,
  planGenerativeReserves,
  replanGenerativeItem,
  type GenerativePlanRequest,
} from './generative-item-planner';
import {
  generativeMaxAttempts,
  runGenerativePipeline,
  type GenerativeAcceptedItem,
  type GenerativeRejectedAttempt,
} from './generative-item-pipeline';
import { GenerativeLlmClient, generativeModelForRole } from './generative-llm.client';
import {
  GENERATIVE_PROMPT_VERSION,
  GENERATIVE_SPEC_VERSION,
  GENERATIVE_VALIDATOR_VERSION,
} from './generative.types';

const ENABLED_VALUES = new Set(['1', 'true', 'yes', 'on']);
const JOB_TIMEOUT_MS = Number(process.env.AI_GENERATIVE_JOB_TIMEOUT_MS) || 900_000;

export function isAiGenerativeEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return ENABLED_VALUES.has((env.ENABLE_AI_GENERATIVE_GENERATION ?? '').trim().toLowerCase());
}

export function assertAiGenerativeEnabled(env: NodeJS.ProcessEnv = process.env): void {
  if (isAiGenerativeEnabled(env)) return;
  throw new BadRequestException({
    code: 'AI_FEATURE_DISABLED',
    message: '참조 없는 완전 AI 문항 생성은 아직 활성화되지 않았습니다. (ENABLE_AI_GENERATIVE_GENERATION)',
  });
}

/**
 * 동시 진행 수. 비우거나 "auto"면 본 문항+예비 문항 전부를 한 번에 진행한다(최대 26).
 * OpenAI 분당 사용량 한도가 낮아 429가 잦으면 숫자로 제한한다.
 */
export function generativeConcurrency(slots: number, environment: NodeJS.ProcessEnv = process.env): number {
  const raw = environment.AI_GENERATIVE_CONCURRENCY?.trim().toLowerCase();
  const configured = Number(raw);
  const limit = raw === undefined || raw === '' || raw === 'auto' || !Number.isInteger(configured) || configured <= 0
    ? slots
    : configured;
  return Math.max(1, Math.min(limit, slots, 26));
}

@Injectable()
export class GenerativeExamGenerationService {
  private readonly logger = new Logger(GenerativeExamGenerationService.name);

  constructor(
    @InjectRepository(AiGenerationRun)
    private readonly runRepo: Repository<AiGenerationRun>,
    @InjectRepository(AiGenerationCandidate)
    private readonly candidateRepo: Repository<AiGenerationCandidate>,
    @InjectRepository(ExamRecord)
    private readonly examRepo: Repository<ExamRecord>,
    @InjectRepository(ExamItem)
    private readonly examItemRepo: Repository<ExamItem>,
    private readonly llm: GenerativeLlmClient,
  ) {}

  async generate(
    userId: string,
    dto: CreateExamDto,
    subjectTitle: string,
    subjectSlug: string,
    idempotencyKey: string,
    reportProgress?: ExamGenerationProgressReporter,
    isCanceled?: () => boolean,
  ): Promise<string> {
    assertAiGenerativeEnabled();
    const subject = generativeSubjectFromSlug(subjectSlug);
    const run = await this.getOrCreateRun(userId, dto, idempotencyKey);
    if (run.status === 'completed' && run.examId !== null) return run.examId;
    if (run.status === 'running') {
      throw new ConflictException('AI 시험 생성 작업이 이미 실행 중입니다.');
    }
    run.status = 'running';
    run.stage = 'blueprint';
    run.progress = 5;
    await this.runRepo.save(run);

    const abortController = new AbortController();
    const deadlineAtMs = Date.now() + JOB_TIMEOUT_MS;
    const timeout = setTimeout(() => abortController.abort(), JOB_TIMEOUT_MS);
    const cancellationPoll = setInterval(() => {
      if (isCanceled?.()) abortController.abort();
    }, 250);
    try {
      const planRequest: GenerativePlanRequest = {
        subject,
        startUnitNum: dto.startUnitNum,
        endUnitNum: dto.endUnitNum,
        questionCount: dto.questionCount,
        difficulty: dto.difficulty,
        targetConcepts: dto.targetConcepts,
        seed: run.idempotencyKey,
      };
      const specs = planGenerativeExam(planRequest);
      const reserves = planGenerativeReserves(planRequest, specs);
      const maxAttempts = generativeMaxAttempts();
      await this.report(run, reportProgress, {
        stage: 'blueprint',
        progress: 10,
        message: '실제 기출 특징으로 출제 계획을 세웠습니다.',
        completed: 0,
        total: specs.length,
        attempt: 0,
        maxAttempts,
      });
      const previousFingerprints = await this.previousFingerprints(userId, dto.subjectId);
      const result = await runGenerativePipeline(specs, this.llm, {
        concurrency: generativeConcurrency(specs.length + reserves.length),
        reserves,
        targetCount: specs.length,
        maxAttempts,
        signal: abortController.signal,
        isCanceled,
        deadlineAtMs,
        previousFingerprints,
        replan: (failed, attempt, used) => replanGenerativeItem(planRequest, failed, attempt, used),
        onProgress: (state) =>
          this.report(run, reportProgress, {
            stage: 'candidate',
            progress: 10 + Math.floor(state.fraction * 85),
            message: state.activity,
            itemStates: state.items,
            reserveStates: state.reserveItems,
            completed: state.completed,
            total: state.total,
            attempt: state.attempt,
            maxAttempts,
            aiProgress: {
              stage: 'candidate',
              completed: state.completed,
              total: state.total,
              attempt: state.attempt,
              maxAttempts,
              accepted: state.accepted,
              rejected: state.rejected,
            },
          }),
      });
      this.recordTelemetry(run, result.accepted, result.rejected);
      await this.saveCandidates(run, result.accepted, result.rejected);

      if (isCanceled?.()) {
        throw new InternalServerErrorException({ code: 'AI_JOB_CANCELED', message: 'AI 시험 생성 작업이 취소되었습니다.' });
      }
      if (result.accepted.length === 0) {
        throw new InternalServerErrorException({
          code: 'AI_RETRY_EXHAUSTED',
          message: '검증을 통과한 AI 문항이 없어 시험을 저장하지 않았습니다.',
          requestedCount: dto.questionCount,
          generatedCount: 0,
          rejectionsByCode: run.rejectionsByCode,
        });
      }
      await this.report(run, reportProgress, {
        stage: 'saving',
        progress: 96,
        message: '검증된 AI 문항을 저장하고 있습니다.',
        completed: result.accepted.length,
        total: dto.questionCount,
        attempt: 1,
        maxAttempts: 1,
      });
      let examId: string;
      try {
        examId = await this.saveExam(userId, dto, subjectTitle, result.accepted, run.idempotencyKey);
      } catch (error: unknown) {
        this.logger.error(`AI generative exam persistence failed: ${error instanceof Error ? error.message : 'unknown'}`);
        throw new InternalServerErrorException({
          code: 'AI_PERSISTENCE_FAILED',
          message: '검증된 AI 문항은 생성됐지만 시험 저장에 실패했습니다.',
        });
      }
      const isPartial = result.accepted.length < dto.questionCount;
      run.status = 'completed';
      run.stage = 'completed';
      run.progress = 100;
      run.examId = examId;
      if (isPartial) {
        run.failureCode = 'AI_RETRY_EXHAUSTED';
        run.failureReason = `검증 통과 문항 ${result.accepted.length}/${dto.questionCount}개만 저장했습니다.`;
      }
      await this.runRepo.save(run);
      await reportProgress?.({
        stage: 'saving',
        progress: 100,
        status: 'success',
        message: isPartial
          ? `검증 통과 문항 ${result.accepted.length}/${dto.questionCount}개를 저장했습니다.`
          : 'AI가 새로 출제한 문항을 저장했습니다.',
        completed: dto.questionCount,
        total: dto.questionCount,
        attempt: 1,
        maxAttempts: 1,
      });
      return examId;
    } catch (error: unknown) {
      run.status = 'failed';
      run.stage = 'failed';
      run.failureCode = failureCode(error);
      run.failureReason = '완전 AI 시험 생성에 실패했습니다.';
      await this.runRepo.save(run);
      throw error;
    } finally {
      clearInterval(cancellationPoll);
      clearTimeout(timeout);
    }
  }

  private recordTelemetry(
    run: AiGenerationRun,
    accepted: readonly GenerativeAcceptedItem[],
    rejected: readonly GenerativeRejectedAttempt[],
  ): void {
    const telemetry = [...accepted.flatMap((item) => item.telemetry), ...rejected.flatMap((item) => item.telemetry)];
    run.acceptedCount = accepted.length;
    run.rejectedCount = rejected.length;
    run.providerLatencyMs = telemetry.reduce((sum, item) => sum + item.latencyMs, 0);
    run.promptTokens = telemetry.reduce((sum, item) => sum + (item.promptTokens ?? 0), 0);
    run.completionTokens = telemetry.reduce((sum, item) => sum + (item.completionTokens ?? 0), 0);
    run.totalTokens = telemetry.reduce((sum, item) => sum + (item.totalTokens ?? 0), 0);
    run.rejectionsByCode = countBy(rejected.map((item) => item.code));
    run.rejectionsByTemplate = countBy(rejected.map((item) => item.spec.responseMode));
  }

  private async saveCandidates(
    run: AiGenerationRun,
    accepted: readonly GenerativeAcceptedItem[],
    rejected: readonly GenerativeRejectedAttempt[],
  ): Promise<void> {
    await this.candidateRepo.save([
      ...rejected.map((item) =>
        this.candidateRepo.create({
          runId: run.id,
          blueprintId: item.spec.id,
          template: item.spec.responseMode,
          attempt: item.attempt,
          status: 'rejected',
          failureCode: item.code,
          fingerprint: null,
          candidate: (item.candidate as unknown as Record<string, unknown>) ?? null,
          validation: { failureCode: item.code, message: item.message, solve: item.solve ?? null, spec: item.spec },
          providerModel: item.telemetry[0]?.model ?? null,
          promptHash: null,
          latencyMs: item.telemetry.reduce((sum, entry) => sum + entry.latencyMs, 0) || null,
          // 반려된 시도도 과금되므로 사용량을 남긴다(비용 분석용).
          providerUsage: item.telemetry.length === 0
            ? null
            : {
                promptTokens: item.telemetry.reduce((sum, entry) => sum + (entry.promptTokens ?? 0), 0),
                completionTokens: item.telemetry.reduce((sum, entry) => sum + (entry.completionTokens ?? 0), 0),
              },
        }),
      ),
      ...accepted.map((item) =>
        this.candidateRepo.create({
          runId: run.id,
          blueprintId: item.spec.id,
          template: item.spec.responseMode,
          attempt: item.attempt,
          status: 'accepted',
          failureCode: null,
          fingerprint: item.question.fingerprint,
          candidate: item.candidate as unknown as Record<string, unknown>,
          validation: { solve: item.solve, spec: item.spec },
          providerModel: item.telemetry[0]?.model ?? null,
          promptHash: item.promptHash,
          latencyMs: item.telemetry.reduce((sum, entry) => sum + entry.latencyMs, 0),
          providerUsage: {
            promptTokens: item.telemetry.reduce((sum, entry) => sum + (entry.promptTokens ?? 0), 0),
            completionTokens: item.telemetry.reduce((sum, entry) => sum + (entry.completionTokens ?? 0), 0),
          },
        }),
      ),
    ]);
  }

  private async previousFingerprints(userId: string, subjectId: string): Promise<string[]> {
    const runs = await this.runRepo.find({
      where: { userId, subjectId, status: 'completed', promptVersion: GENERATIVE_PROMPT_VERSION },
    });
    if (runs.length === 0) return [];
    const candidates = await this.candidateRepo.find({
      where: { runId: In(runs.map((run) => run.id)), status: 'accepted' },
    });
    return candidates
      .map((candidate) => candidate.fingerprint)
      .filter((fingerprint): fingerprint is string => fingerprint !== null);
  }

  private async getOrCreateRun(
    userId: string,
    dto: CreateExamDto,
    idempotencyKey: string,
  ): Promise<AiGenerationRun> {
    const existing = await this.runRepo.findOne({ where: { idempotencyKey } });
    if (existing !== null && existing.status !== 'failed') return existing;
    const key = existing === null ? idempotencyKey : `${idempotencyKey}:retry:${randomUUID()}`;
    return this.runRepo.save(
      this.runRepo.create({
        idempotencyKey: key,
        userId,
        subjectId: dto.subjectId,
        status: 'pending',
        request: { ...dto },
        profileVersion: loadExamStyleProfile().version,
        blueprintVersion: GENERATIVE_SPEC_VERSION,
        promptVersion: GENERATIVE_PROMPT_VERSION,
        validatorVersion: GENERATIVE_VALIDATOR_VERSION,
        progress: 0,
        stage: 'queued',
        acceptedCount: 0,
        rejectedCount: 0,
        providerLatencyMs: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        failureCode: null,
        failureReason: null,
        examId: null,
      }),
    );
  }

  private async report(
    run: AiGenerationRun,
    reportProgress: ExamGenerationProgressReporter | undefined,
    update: Parameters<NonNullable<ExamGenerationProgressReporter>>[0],
  ): Promise<void> {
    run.stage = update.stage;
    run.progress = Math.max(run.progress, Math.min(100, update.progress));
    await this.runRepo.save(run);
    await reportProgress?.(update);
  }

  private async saveExam(
    userId: string,
    dto: CreateExamDto,
    subjectTitle: string,
    accepted: readonly GenerativeAcceptedItem[],
    generationNonce: string,
  ): Promise<string> {
    const title = `${subjectTitle} ${dto.startUnitNum}~${dto.endUnitNum}단원 (AI 출제 ${dto.difficulty})`;
    const generationModel = generativeModelForRole('generation');
    const verificationModel = generativeModelForRole('verification');
    const exam = await this.examRepo.manager.transaction(async (manager) => {
      const questionRepo = manager.getRepository(Question);
      const unitRepo = manager.getRepository(Unit);
      const questions: Question[] = [];
      for (const item of accepted) {
        const { spec, question } = item;
        if (spec.unitNumber < dto.startUnitNum || spec.unitNumber > dto.endUnitNum) {
          throw new ConflictException('생성 문항의 단원이 요청 단원 범위를 벗어났습니다.');
        }
        let unit = await unitRepo.findOne({ where: { subjectId: dto.subjectId, unitNumber: spec.unitNumber } });
        if (unit === null) {
          unit = await unitRepo.save(
            unitRepo.create({ subjectId: dto.subjectId, unitNumber: spec.unitNumber, title: spec.unitTitle }),
          );
        }
        questions.push(
          await questionRepo.save(
            questionRepo.create({
              subjectId: dto.subjectId,
              unitId: unit.id,
              targetConcept: question.targetConcept,
              itemType: question.itemType,
              difficulty: question.difficulty,
              recommendedTemplate: question.recommendedTemplate,
              variantGroupId: `${dto.subjectId}:${unit.id}:${question.targetConcept}:ai_generative`,
              questionStem: question.questionStem,
              stimulusData: question.stimulusData,
              optionsList: [...question.optionsList],
              comboBlock: question.comboBlock as Question['comboBlock'],
              explanation: question.explanation,
              correctAnswer: question.correctAnswer,
              setGroupId: null,
              setPosition: null,
              generationLineage: {
                generationPath: 'ai_generative',
                generationNonce,
                specVersion: GENERATIVE_SPEC_VERSION,
                profileVersion: loadExamStyleProfile().version,
                promptVersion: GENERATIVE_PROMPT_VERSION,
                validatorVersion: GENERATIVE_VALIDATOR_VERSION,
                model: item.telemetry[0]?.model ?? generationModel,
                verificationModel,
                spec: {
                  unitNumber: spec.unitNumber,
                  responseMode: spec.responseMode,
                  polarity: spec.polarity,
                  materialGenre: spec.material.genre,
                  stimulusShape: spec.stimulusShape,
                  stemEnding: spec.stemEnding,
                  points: spec.points,
                },
                blindSolve: { answerIndex: item.solve.answerIndex, ambiguity: item.solve.ambiguity },
                attempt: item.attempt,
                validation: 'passed',
              },
            }),
          ),
        );
      }
      const savedExam = await manager.save(
        this.examRepo.create({
          userId,
          subjectId: dto.subjectId,
          title,
          startUnitNum: dto.startUnitNum,
          endUnitNum: dto.endUnitNum,
          difficulty: dto.difficulty,
          questionCount: questions.length,
          customPrompt: dto.customPrompt ?? null,
          sourceType: ExamSourceType.AI_GENERATIVE,
        }),
      );
      await manager.save(
        questions.map((question, index) =>
          this.examItemRepo.create({ examId: savedExam.id, questionId: question.id, orderIndex: index + 1 }),
        ),
      );
      return savedExam;
    });
    return exam.id;
  }
}

function countBy(values: readonly string[]): Record<string, number> {
  return values.reduce<Record<string, number>>((counts, value) => {
    counts[value] = (counts[value] ?? 0) + 1;
    return counts;
  }, {});
}

function failureCode(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'getResponse' in error && typeof error.getResponse === 'function') {
    const response = error.getResponse() as unknown;
    if (typeof response === 'object' && response !== null && 'code' in response && typeof response.code === 'string') {
      return response.code;
    }
  }
  return 'AI_GENERATION_FAILED';
}
