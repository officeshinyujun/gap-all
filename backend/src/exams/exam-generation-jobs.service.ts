import { Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CreateExamDto } from './dto/create-exam.dto';
import { ExamGenerationProgressUpdate } from './exam-generation.utils';

export type ExamGenerationJobStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed';

export interface ExamGenerationJobLog extends ExamGenerationProgressUpdate {
  timestamp: string;
}

export interface ExamGenerationJobState {
  id: string;
  userId: string;
  status: ExamGenerationJobStatus;
  progress: number;
  stage: string;
  message: string;
  error?: string;
  examId?: string;
  request: CreateExamDto;
  logs: ExamGenerationJobLog[];
  createdAt: string;
  updatedAt: string;
}

@Injectable()
export class ExamGenerationJobsService {
  private readonly jobs = new Map<string, ExamGenerationJobState>();

  create(userId: string, request: CreateExamDto): ExamGenerationJobState {
    const now = new Date().toISOString();
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

  start(jobId: string, userId: string) {
    const job = this.getForUser(jobId, userId);
    const now = new Date().toISOString();
    job.status = 'running';
    job.stage = 'starting';
    job.progress = 5;
    job.message = '생성 작업을 시작했습니다.';
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
    const now = new Date().toISOString();
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
    job.updatedAt = now;
    job.logs.push({
      stage: 'completed',
      progress: 100,
      message: '시험 생성이 완료되었습니다.',
      status: 'success',
      timestamp: now,
    });
  }

  fail(jobId: string, userId: string, error: string) {
    const job = this.getForUser(jobId, userId);
    const now = new Date().toISOString();
    job.status = 'failed';
    job.stage = 'failed';
    job.message = '시험 생성 중 오류가 발생했습니다.';
    job.error = error;
    job.updatedAt = now;
    job.logs.push({
      stage: 'failed',
      progress: job.progress,
      message: '시험 생성 중 오류가 발생했습니다.',
      status: 'error',
      detail: error,
      timestamp: now,
    });
  }
}
