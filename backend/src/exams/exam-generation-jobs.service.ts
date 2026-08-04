import {
  ConflictException,
  Injectable,
  NotFoundException,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import type { Repository } from 'typeorm';
import { GenerationJob } from '../entities/generation-job.entity';
import { CreateExamDto } from './dto/create-exam.dto';
import type {
  AiGenerationProgress,
  AiGenerationStage,
} from './ai-blueprint.types';
import type {
  ExamGenerationProgressUpdate,
  ExamGenerationReferenceProgress,
} from './exam-generation.utils';

export type ExamGenerationJobStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'canceled';

export interface ExamGenerationJobLog extends ExamGenerationProgressUpdate {
  timestamp: string;
}

export type ExamGenerationJobFailure = Readonly<{
  code: string;
  message: string;
  shortfall?: ExamGenerationShortfall;
}>;

export type ExamGenerationShortfall = Readonly<{
  requestedCount: number;
  generatedCount: number;
  stageCounts: Readonly<{
    source: number;
    planner: number;
    fidelity: number;
    admission?: number;
  }>;
  candidateCounts?: Readonly<{
    attempted: number;
    eligible: number;
    generated: number;
    omittedEligibleCount: number;
  }>;
  rejectionsByTemplate?: Readonly<Record<string, number>>;
}>;

export type ExamGenerationJobReceipt = Readonly<{
  jobId: string;
  status: ExamGenerationJobStatus;
  progress: number;
  stage: string;
  message: string;
  completed?: number;
  total?: number;
  attempt?: number;
  maxAttempts?: number;
  aiProgress?: AiGenerationProgress;
  errorCode?: string;
  shortfall?: ExamGenerationShortfall;
  examId?: string;
  sourceType?: CreateExamDto['sourceType'];
  createdAt: string;
  updatedAt: string;
}>;

export interface ExamGenerationJobState {
  id: string;
  userId: string;
  status: ExamGenerationJobStatus;
  progress: number;
  stage: string;
  message: string;
  error?: string;
  errorCode?: string;
  shortfall?: ExamGenerationShortfall;
  examId?: string;
  request: CreateExamDto;
  logs: ExamGenerationJobLog[];
  referenceProgress?: ExamGenerationReferenceProgress;
  aiProgress?: AiGenerationProgress;
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class ExamGenerationJobsService implements OnModuleInit {
  private readonly jobs = new Map<string, ExamGenerationJobState>();

  constructor(
    @Optional()
    @InjectRepository(GenerationJob)
    private readonly durableRepo?: Pick<
      Repository<GenerationJob>,
      'findOne' | 'find' | 'save'
    >,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.recoverStaleJobs();
  }

  private static readonly referenceStageOrder: readonly string[] = [
    'queued',
    'starting',
    'selection',
    'planner',
    'fidelity',
    'final',
    'completed',
    'failed',
  ] as const;

  private static readonly aiStageOrder: readonly AiGenerationStage[] = [
    'queued',
    'profile',
    'blueprint',
    'candidate',
    'validation',
    'saving',
    'completed',
    'failed',
    'canceled',
  ] as const;

  private static readonly referenceReceiptMessage =
    '참조 시험 생성 진행 중입니다.';

  private static readonly aiReceiptMessage = 'AI 시험 생성 준비 중입니다.';

  create(userId: string, request: CreateExamDto): ExamGenerationJobState {
    this.assertNoActiveJobForUser(userId);
    const now = new Date().toISOString();
    const referenceProgress =
      request.sourceType !== 'ai' && request.sourceType !== 'ai_blueprint'
        ? {
            stage: 'queued',
            completed: 0,
            total: request.questionCount,
            attempt: 0,
            maxAttempts: 0,
          }
        : undefined;
    const aiProgress: AiGenerationProgress | undefined =
      request.sourceType === 'ai_blueprint'
        ? {
            stage: 'queued',
            completed: 0,
            total: request.questionCount,
            attempt: 0,
            maxAttempts: 0,
            accepted: 0,
            rejected: 0,
          }
        : undefined;
    const job: ExamGenerationJobState = {
      id: randomUUID(),
      userId,
      status: 'pending',
      progress: 0,
      stage: 'queued',
      message: '생성 작업이 대기열에 등록되었습니다.',
      request: { ...request },
      logs: [
        {
          stage: 'queued',
          progress: 0,
          message: '생성 작업이 대기열에 등록되었습니다.',
          status: 'info',
          timestamp: now,
        },
      ],
      ...(referenceProgress === undefined ? {} : { referenceProgress }),
      ...(aiProgress === undefined ? {} : { aiProgress }),
      createdAt: now,
      updatedAt: now,
    };

    this.jobs.set(job.id, job);
    return job;
  }

  async persistNow(job: ExamGenerationJobState): Promise<void> {
    await this.persist(job);
  }

  assertNoActiveJobForUser(userId: string): void {
    const activeJob = [...this.jobs.values()].find(
      (job) =>
        job.userId === userId &&
        (job.status === 'pending' || job.status === 'running'),
    );
    if (activeJob) {
      throw new ConflictException('이미 시험 생성 작업이 진행 중입니다.');
    }
  }

  getForUser(jobId: string, userId: string): ExamGenerationJobState {
    const job = this.jobs.get(jobId);
    if (!job || job.userId !== userId) {
      throw new NotFoundException('생성 작업을 찾을 수 없습니다.');
    }

    return job;
  }

  async getForUserAsync(
    jobId: string,
    userId: string,
  ): Promise<ExamGenerationJobState> {
    await this.recoverStaleJobs();
    const inMemory = this.jobs.get(jobId);
    if (inMemory !== undefined) {
      if (inMemory.userId !== userId) {
        throw new NotFoundException('생성 작업을 찾을 수 없습니다.');
      }
      return inMemory;
    }
    if (this.durableRepo === undefined) {
      throw new NotFoundException('생성 작업을 찾을 수 없습니다.');
    }
    const row = await this.durableRepo.findOne({ where: { id: jobId } });
    if (row === null || row.userId !== userId) {
      throw new NotFoundException('생성 작업을 찾을 수 없습니다.');
    }
    const state = row.state as unknown as ExamGenerationJobState;
    this.jobs.set(state.id, state);
    return state;
  }

  toReceipt(job: ExamGenerationJobState): ExamGenerationJobReceipt {
    const referenceProgress = job.referenceProgress;
    const aiProgress = job.aiProgress;
    const receiptStage = aiProgress
      ? this.safeAiStage(aiProgress.stage)
      : referenceProgress === undefined
        ? job.stage
        : this.safeReferenceStage(referenceProgress.stage);
    const receiptMessage = aiProgress
      ? this.aiReceiptMessageForStatus(job.status)
      : referenceProgress === undefined
        ? job.message
        : this.referenceReceiptMessageForStatus(job.status);
    return {
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      stage: receiptStage,
      message: receiptMessage,
      ...(job.request.sourceType === undefined
        ? {}
        : { sourceType: job.request.sourceType }),
      ...(referenceProgress === undefined
        ? aiProgress === undefined
          ? {}
          : {
              completed: aiProgress.completed,
              total: aiProgress.total,
              attempt: aiProgress.attempt,
              maxAttempts: aiProgress.maxAttempts,
              aiProgress,
            }
        : {
            completed: referenceProgress.completed,
            total: referenceProgress.total,
            attempt: referenceProgress.attempt,
            maxAttempts: referenceProgress.maxAttempts,
          }),
      ...(job.errorCode === undefined ? {} : { errorCode: job.errorCode }),
      ...(job.shortfall === undefined ? {} : { shortfall: job.shortfall }),
      ...(job.examId === undefined ? {} : { examId: job.examId }),
      createdAt: job.createdAt,
      updatedAt: job.updatedAt,
    };
  }

  removeForUser(jobId: string, userId: string): void {
    this.getForUser(jobId, userId);
    this.jobs.delete(jobId);
  }

  start(jobId: string, userId: string) {
    const job = this.getForUser(jobId, userId);
    if (job.status === 'canceled') return;
    const now = new Date().toISOString();
    job.status = 'running';
    job.stage = 'starting';
    job.progress = 5;
    job.message = '생성 작업을 시작했습니다.';
    if (job.aiProgress !== undefined) {
      job.aiProgress = {
        ...job.aiProgress,
        stage: 'profile',
      };
      job.message = ExamGenerationJobsService.aiReceiptMessage;
    } else if (job.referenceProgress !== undefined) {
      job.referenceProgress = {
        ...job.referenceProgress,
        stage: 'starting',
      };
      job.message = ExamGenerationJobsService.referenceReceiptMessage;
    }
    job.updatedAt = now;
    job.logs.push({
      stage: 'starting',
      progress: 5,
      message: '생성 작업을 시작했습니다.',
      status: 'info',
      timestamp: now,
    });
    void this.persist(job);
  }

  push(jobId: string, userId: string, update: ExamGenerationProgressUpdate) {
    const job = this.getForUser(jobId, userId);
    if (
      job.status === 'completed' ||
      job.status === 'failed' ||
      job.status === 'canceled'
    ) {
      return;
    }
    const now = new Date().toISOString();
    if (job.aiProgress !== undefined) {
      const updateProgress = update.aiProgress ?? {
        stage: this.safeAiStage(update.stage),
        completed:
          update.completed === undefined
            ? job.aiProgress.completed
            : update.completed,
        total: update.total === undefined ? job.aiProgress.total : update.total,
        attempt:
          update.attempt === undefined
            ? job.aiProgress.attempt
            : update.attempt,
        maxAttempts:
          update.maxAttempts === undefined
            ? job.aiProgress.maxAttempts
            : update.maxAttempts,
        accepted: job.aiProgress.accepted,
        rejected: job.aiProgress.rejected,
      };
      const nextStage = this.monotonicAiStage(
        job.aiProgress.stage,
        updateProgress.stage,
      );
      const total = Math.max(job.aiProgress.total, updateProgress.total);
      job.aiProgress = {
        stage: nextStage,
        completed: Math.min(
          total,
          Math.max(job.aiProgress.completed, updateProgress.completed),
        ),
        total,
        attempt: Math.max(job.aiProgress.attempt, updateProgress.attempt),
        maxAttempts: Math.max(
          job.aiProgress.maxAttempts,
          updateProgress.maxAttempts,
        ),
        accepted: Math.max(job.aiProgress.accepted, updateProgress.accepted),
        rejected: Math.max(job.aiProgress.rejected, updateProgress.rejected),
      };
      job.stage = nextStage;
      job.progress = Math.max(job.progress, Math.min(100, update.progress));
      job.message = ExamGenerationJobsService.aiReceiptMessage;
      job.updatedAt = now;
      job.logs.push({
        stage: nextStage,
        progress: job.progress,
        message: ExamGenerationJobsService.aiReceiptMessage,
        completed: job.aiProgress.completed,
        total: job.aiProgress.total,
        attempt: job.aiProgress.attempt,
        maxAttempts: job.aiProgress.maxAttempts,
        timestamp: now,
      });
      void this.persist(job);
      return;
    }
    if (job.referenceProgress !== undefined) {
      const updateProgress: ExamGenerationReferenceProgress =
        update.referenceProgress ?? {
          stage: update.stage,
          completed:
            update.completed === undefined
              ? job.referenceProgress.completed
              : update.completed,
          total:
            update.total === undefined
              ? job.referenceProgress.total
              : update.total,
          attempt:
            update.attempt === undefined
              ? job.referenceProgress.attempt
              : update.attempt,
          maxAttempts:
            update.maxAttempts === undefined
              ? job.referenceProgress.maxAttempts
              : update.maxAttempts,
        };
      const nextStage = this.monotonicReferenceStage(
        job.referenceProgress.stage,
        updateProgress.stage,
      );
      const total = Math.max(job.referenceProgress.total, updateProgress.total);
      job.referenceProgress = {
        stage: nextStage,
        completed: Math.min(
          total,
          Math.max(job.referenceProgress.completed, updateProgress.completed),
        ),
        total,
        attempt: Math.max(
          job.referenceProgress.attempt,
          updateProgress.attempt,
        ),
        maxAttempts: Math.max(
          job.referenceProgress.maxAttempts,
          updateProgress.maxAttempts,
        ),
      };
      job.stage = nextStage;
      job.progress = Math.max(job.progress, Math.min(100, update.progress));
      job.message = ExamGenerationJobsService.referenceReceiptMessage;
      job.updatedAt = now;
      const safeReferenceProgress = job.referenceProgress;
      job.logs.push({
        stage: nextStage,
        progress: job.progress,
        message: ExamGenerationJobsService.referenceReceiptMessage,
        completed: safeReferenceProgress.completed,
        total: safeReferenceProgress.total,
        attempt: safeReferenceProgress.attempt,
        maxAttempts: safeReferenceProgress.maxAttempts,
        timestamp: now,
      });
      void this.persist(job);
      return;
    }
    job.stage = update.stage;
    job.progress = update.progress;
    job.message = update.message;
    job.updatedAt = now;
    job.logs.push({
      ...update,
      timestamp: now,
    });
    void this.persist(job);
  }

  complete(
    jobId: string,
    userId: string,
    examId: string,
    completedCount?: number,
    shortfall?: ExamGenerationShortfall,
  ) {
    const job = this.getForUser(jobId, userId);
    if (job.status === 'canceled') return;
    const now = new Date().toISOString();
    job.status = 'completed';
    job.stage = 'completed';
    job.progress = 100;
    job.message = '시험 생성이 완료되었습니다.';
    job.examId = examId;
    if (job.aiProgress !== undefined) {
      job.aiProgress = {
        ...job.aiProgress,
        stage: 'completed',
        completed: completedCount ?? job.aiProgress.total,
        accepted: completedCount ?? job.aiProgress.total,
      };
    } else if (job.referenceProgress !== undefined) {
      job.referenceProgress = {
        ...job.referenceProgress,
        stage: 'completed',
        completed: job.referenceProgress.total,
      };
    }
    if (shortfall !== undefined) job.shortfall = shortfall;
    job.updatedAt = now;
    job.logs.push({
      stage: 'completed',
      progress: 100,
      message: '시험 생성이 완료되었습니다.',
      status: 'success',
      timestamp: now,
    });
    void this.persist(job);
  }

  fail(jobId: string, userId: string, failure: ExamGenerationJobFailure) {
    const job = this.getForUser(jobId, userId);
    if (job.status === 'canceled') return;
    const now = new Date().toISOString();
    const referenceProgress = job.referenceProgress;
    const aiProgress = job.aiProgress;
    job.status = 'failed';
    job.stage = aiProgress
      ? aiProgress.stage
      : referenceProgress === undefined
        ? 'failed'
        : referenceProgress.stage;
    job.message = '시험 생성 중 오류가 발생했습니다.';
    job.error = failure.message;
    job.errorCode = failure.code;
    if (aiProgress !== undefined) {
      job.aiProgress = { ...aiProgress };
    } else if (referenceProgress !== undefined) {
      job.referenceProgress = {
        ...referenceProgress,
      };
    }
    if (failure.shortfall !== undefined) {
      job.shortfall = failure.shortfall;
    }
    job.updatedAt = now;
    if (aiProgress === undefined && referenceProgress === undefined) {
      job.logs.push({
        stage: 'failed',
        progress: job.progress,
        message: '시험 생성 중 오류가 발생했습니다.',
        status: 'error',
        detail: failure.code,
        timestamp: now,
      });
      void this.persist(job);
    } else {
      job.logs.push({
        stage: aiProgress?.stage ?? referenceProgress?.stage ?? 'failed',
        progress: job.progress,
        message: '시험 생성 중 오류가 발생했습니다.',
        status: 'error',
        timestamp: now,
      });
      void this.persist(job);
    }
  }

  cancel(jobId: string, userId: string): ExamGenerationJobState {
    const job = this.getForUser(jobId, userId);
    if (job.status === 'completed' || job.status === 'failed') return job;
    const now = new Date().toISOString();
    job.status = 'canceled';
    job.stage = 'canceled';
    job.message = '시험 생성이 취소되었습니다.';
    if (job.aiProgress !== undefined) {
      job.aiProgress = { ...job.aiProgress, stage: 'canceled' };
    }
    job.updatedAt = now;
    job.logs.push({
      stage: 'canceled',
      progress: job.progress,
      message: job.message,
      status: 'info',
      timestamp: now,
    });
    void this.persist(job);
    return job;
  }

  async cancelAsync(
    jobId: string,
    userId: string,
  ): Promise<ExamGenerationJobState> {
    const job = await this.getForUserAsync(jobId, userId);
    return this.cancel(job.id, userId);
  }

  isCanceled(jobId: string, userId: string): boolean {
    return this.getForUser(jobId, userId).status === 'canceled';
  }

  async recoverStaleJobs(maxAgeMs = 5 * 60_000): Promise<number> {
    if (this.durableRepo === undefined) return 0;
    const rows = await this.durableRepo.find({
      where: [{ status: 'pending' }, { status: 'running' }],
    });
    const cutoff = Date.now() - maxAgeMs;
    let recovered = 0;
    for (const row of rows) {
      if (row.heartbeatAt.getTime() >= cutoff) continue;
      const state = row.state as unknown as ExamGenerationJobState;
      state.status = 'failed';
      state.stage = 'failed';
      state.errorCode = 'AI_JOB_TIMEOUT';
      state.error = '작업자가 응답하지 않아 생성 작업을 종료했습니다.';
      state.updatedAt = new Date().toISOString();
      await this.persist(state);
      recovered += 1;
    }
    return recovered;
  }

  private async persist(job: ExamGenerationJobState): Promise<void> {
    if (this.durableRepo === undefined) return;
    const now = new Date();
    await this.durableRepo.save({
      id: job.id,
      userId: job.userId,
      status: job.status,
      request: job.request as unknown as Record<string, unknown>,
      state: job as unknown as Record<string, unknown>,
      heartbeatAt: now,
    });
  }

  private monotonicReferenceStage(current: string, next: string): string {
    const safeCurrent = this.safeReferenceStage(current);
    const safeNext = this.safeReferenceStage(next);
    const currentOrder =
      ExamGenerationJobsService.referenceStageOrder.indexOf(safeCurrent);
    const nextOrder =
      ExamGenerationJobsService.referenceStageOrder.indexOf(safeNext);
    return nextOrder >= currentOrder ? safeNext : safeCurrent;
  }

  private safeReferenceStage(stage: string): string {
    return ExamGenerationJobsService.referenceStageOrder.includes(stage)
      ? stage
      : 'unknown';
  }

  private monotonicAiStage(
    current: AiGenerationStage,
    next: AiGenerationStage,
  ): AiGenerationStage {
    const currentOrder =
      ExamGenerationJobsService.aiStageOrder.indexOf(current);
    const nextOrder = ExamGenerationJobsService.aiStageOrder.indexOf(next);
    return nextOrder >= currentOrder ? next : current;
  }

  private safeAiStage(stage: string): AiGenerationStage {
    return ExamGenerationJobsService.aiStageOrder.includes(
      stage as AiGenerationStage,
    )
      ? (stage as AiGenerationStage)
      : 'queued';
  }

  private referenceReceiptMessageForStatus(
    status: ExamGenerationJobStatus,
  ): string {
    const messages: Readonly<Record<ExamGenerationJobStatus, string>> = {
      pending: ExamGenerationJobsService.referenceReceiptMessage,
      running: ExamGenerationJobsService.referenceReceiptMessage,
      completed: '시험 생성이 완료되었습니다.',
      failed: '시험 생성 중 오류가 발생했습니다.',
      canceled: '시험 생성이 취소되었습니다.',
    };
    return messages[status];
  }

  private aiReceiptMessageForStatus(status: ExamGenerationJobStatus): string {
    const messages: Readonly<Record<ExamGenerationJobStatus, string>> = {
      pending: ExamGenerationJobsService.aiReceiptMessage,
      running: ExamGenerationJobsService.aiReceiptMessage,
      completed: '시험 생성이 완료되었습니다.',
      failed: '시험 생성 중 오류가 발생했습니다.',
      canceled: '시험 생성이 취소되었습니다.',
    };
    return messages[status];
  }
}
