import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CreateExamDto } from './dto/create-exam.dto';
import type {
  ExamGenerationProgressUpdate,
  ExamGenerationReferenceProgress,
} from './exam-generation.utils';

export type ExamGenerationJobStatus =
  'pending' | 'running' | 'completed' | 'failed';

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
  errorCode?: string;
  shortfall?: ExamGenerationShortfall;
  examId?: string;
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
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class ExamGenerationJobsService {
  private readonly jobs = new Map<string, ExamGenerationJobState>();

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

  private static readonly referenceReceiptMessage =
    '참조 시험 생성 진행 중입니다.';

  create(userId: string, request: CreateExamDto): ExamGenerationJobState {
    const now = new Date().toISOString();
    const referenceProgress =
      request.sourceType !== 'ai'
        ? {
            stage: 'queued',
            completed: 0,
            total: request.questionCount,
            attempt: 0,
            maxAttempts: 0,
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
      createdAt: now,
      updatedAt: now,
    };

    this.jobs.set(job.id, job);
    return job;
  }

  getForUser(jobId: string, userId: string): ExamGenerationJobState {
    const job = this.jobs.get(jobId);
    if (!job || job.userId !== userId) {
      throw new NotFoundException('생성 작업을 찾을 수 없습니다.');
    }

    return job;
  }

  toReceipt(job: ExamGenerationJobState): ExamGenerationJobReceipt {
    const referenceProgress = job.referenceProgress;
    const receiptStage =
      referenceProgress === undefined
        ? job.stage
        : this.safeReferenceStage(referenceProgress.stage);
    const receiptMessage =
      referenceProgress === undefined
        ? job.message
        : this.referenceReceiptMessageForStatus(job.status);
    return {
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      stage: receiptStage,
      message: receiptMessage,
      ...(referenceProgress === undefined
        ? {}
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
    const now = new Date().toISOString();
    job.status = 'running';
    job.stage = 'starting';
    job.progress = 5;
    job.message = '생성 작업을 시작했습니다.';
    if (job.referenceProgress !== undefined) {
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
  }

  push(jobId: string, userId: string, update: ExamGenerationProgressUpdate) {
    const job = this.getForUser(jobId, userId);
    if (job.status === 'completed' || job.status === 'failed') {
      return;
    }
    const now = new Date().toISOString();
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
  }

  complete(jobId: string, userId: string, examId: string) {
    const job = this.getForUser(jobId, userId);
    const now = new Date().toISOString();
    job.status = 'completed';
    job.stage = 'completed';
    job.progress = 100;
    job.message = '시험 생성이 완료되었습니다.';
    job.examId = examId;
    if (job.referenceProgress !== undefined) {
      job.referenceProgress = {
        ...job.referenceProgress,
        stage: 'completed',
        completed: job.referenceProgress.total,
      };
    }
    job.updatedAt = now;
    job.logs.push({
      stage: 'completed',
      progress: 100,
      message: '시험 생성이 완료되었습니다.',
      status: 'success',
      timestamp: now,
    });
  }

  fail(jobId: string, userId: string, failure: ExamGenerationJobFailure) {
    const job = this.getForUser(jobId, userId);
    const now = new Date().toISOString();
    const referenceProgress = job.referenceProgress;
    job.status = 'failed';
    job.stage =
      referenceProgress === undefined ? 'failed' : referenceProgress.stage;
    job.message = '시험 생성 중 오류가 발생했습니다.';
    job.error = failure.message;
    job.errorCode = failure.code;
    if (referenceProgress !== undefined) {
      job.referenceProgress = {
        ...referenceProgress,
      };
    }
    if (failure.shortfall !== undefined) {
      job.shortfall = failure.shortfall;
    }
    job.updatedAt = now;
    if (referenceProgress === undefined) {
      job.logs.push({
        stage: 'failed',
        progress: job.progress,
        message: '시험 생성 중 오류가 발생했습니다.',
        status: 'error',
        detail: failure.code,
        timestamp: now,
      });
    } else {
      job.logs.push({
        stage: referenceProgress.stage,
        progress: job.progress,
        message: '시험 생성 중 오류가 발생했습니다.',
        status: 'error',
        timestamp: now,
      });
    }
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

  private referenceReceiptMessageForStatus(
    status: ExamGenerationJobStatus,
  ): string {
    const messages: Readonly<Record<ExamGenerationJobStatus, string>> = {
      pending: ExamGenerationJobsService.referenceReceiptMessage,
      running: ExamGenerationJobsService.referenceReceiptMessage,
      completed: '시험 생성이 완료되었습니다.',
      failed: '시험 생성 중 오류가 발생했습니다.',
    };
    return messages[status];
  }
}
