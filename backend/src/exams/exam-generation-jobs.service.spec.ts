import { ConflictException } from '@nestjs/common';
import { Difficulty } from '../entities/exam-record.entity';
import {
  ExamGenerationJobsService,
  type ExamGenerationJobReceipt,
} from './exam-generation-jobs.service';

describe('ExamGenerationJobsService receipt contract', () => {
  it('rejects a second pending or running job for the same user', () => {
    const service = new ExamGenerationJobsService();
    const request = {
      subjectId: 'subject-1',
      startUnitNum: 1,
      endUnitNum: 1,
      difficulty: Difficulty.MIDDLE,
      questionCount: 1,
      sourceType: 'ai' as const,
    };
    const job = service.create('user-1', request);

    expect(() => service.create('user-1', request)).toThrow(ConflictException);

    service.fail(job.id, 'user-1', { code: 'FAILED', message: 'failed' });
    expect(() => service.create('user-1', request)).not.toThrow();
  });

  it('characterizes the existing pending receipt as an allowlisted projection', () => {
    const service = new ExamGenerationJobsService();
    const job = service.create('user-1', {
      subjectId: 'subject-1',
      startUnitNum: 1,
      endUnitNum: 1,
      difficulty: Difficulty.MIDDLE,
      questionCount: 2,
      sourceType: 'ai',
      customPrompt: 'private prompt',
      referenceSourceIds: ['private-source-id'],
    });

    const receipt: ExamGenerationJobReceipt = service.toReceipt(job);

    expect(receipt).toEqual(
      expect.objectContaining({
        jobId: job.id,
        status: 'pending',
        progress: 0,
        stage: 'queued',
        message: '생성 작업이 대기열에 등록되었습니다.',
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
      }),
    );
    expect(receipt).not.toHaveProperty('request');
    expect(receipt).not.toHaveProperty('logs');
    expect(receipt).not.toHaveProperty('error');
    expect(JSON.stringify(receipt)).not.toContain('private prompt');
    expect(JSON.stringify(receipt)).not.toContain('private-source-id');
  });

  it('cancels a running job and keeps it terminal against later progress', () => {
    const service = new ExamGenerationJobsService();
    const job = service.create('user-1', {
      subjectId: 'subject-1',
      startUnitNum: 1,
      endUnitNum: 1,
      difficulty: Difficulty.MIDDLE,
      questionCount: 2,
      sourceType: 'ai_blueprint',
    });
    service.start(job.id, 'user-1');
    const canceled = service.cancel(job.id, 'user-1');

    expect(service.toReceipt(canceled)).toEqual(
      expect.objectContaining({
        status: 'canceled',
        stage: 'canceled',
        message: '시험 생성이 취소되었습니다.',
      }),
    );
    service.push(job.id, 'user-1', {
      stage: 'saving',
      progress: 99,
      message: 'late update',
    });
    service.complete(job.id, 'user-1', 'exam-1');
    const receipt = service.toReceipt(service.getForUser(job.id, 'user-1'));
    expect(receipt).toEqual(expect.objectContaining({ status: 'canceled' }));
    expect(receipt).not.toHaveProperty('examId');
  });

  it('characterizes the legacy shortfall receipt before bounded recovery counters', () => {
    const service = new ExamGenerationJobsService();
    const job = service.create('user-1', {
      subjectId: 'subject-1',
      startUnitNum: 1,
      endUnitNum: 1,
      difficulty: Difficulty.MIDDLE,
      questionCount: 2,
      sourceType: 'reference',
    });

    service.fail(job.id, 'user-1', {
      code: 'REFERENCE_GENERATION_SHORTFALL',
      message: 'private provider detail',
      shortfall: {
        requestedCount: 2,
        generatedCount: 1,
        stageCounts: { source: 0, planner: 1, fidelity: 0 },
      },
    });

    expect(service.toReceipt(service.getForUser(job.id, 'user-1'))).toEqual(
      expect.objectContaining({
        errorCode: 'REFERENCE_GENERATION_SHORTFALL',
        shortfall: {
          requestedCount: 2,
          generatedCount: 1,
          stageCounts: { source: 0, planner: 1, fidelity: 0 },
        },
      }),
    );
  });

  it('reports redacted reference progress with monotonic weighted updates', () => {
    const service = new ExamGenerationJobsService();
    const job = service.create('user-1', {
      subjectId: 'subject-1',
      startUnitNum: 1,
      endUnitNum: 1,
      difficulty: Difficulty.MIDDLE,
      questionCount: 3,
      sourceType: 'reference',
      referenceSourceIds: ['source-secret'],
    });

    service.push(job.id, 'user-1', {
      stage: 'planner',
      progress: 45,
      message: 'source-secret provider response should not be public',
      detail: 'source-secret prompt provider response',
      completed: 1,
      total: 3,
      attempt: 1,
      maxAttempts: 3,
    });

    const firstReceipt = service.toReceipt(
      service.getForUser(job.id, 'user-1'),
    );

    expect(firstReceipt).toEqual(
      expect.objectContaining({
        status: 'pending',
        progress: 45,
        stage: 'planner',
        completed: 1,
        total: 3,
        attempt: 1,
        maxAttempts: 3,
        message: '참조 시험 생성 진행 중입니다.',
      }),
    );
    expect(JSON.stringify(firstReceipt)).not.toContain('source-secret');
    expect(JSON.stringify(firstReceipt)).not.toContain('provider response');
    expect(JSON.stringify(job.logs)).not.toContain('source-secret');
    expect(JSON.stringify(job.logs)).not.toContain('provider response');
    expect(JSON.stringify(job.logs)).not.toContain('prompt');

    service.push(job.id, 'user-1', {
      stage: 'selection',
      progress: 20,
      message: 'stale source text',
      referenceProgress: {
        stage: 'selection',
        completed: 0,
        total: 2,
        attempt: 0,
        maxAttempts: 1,
      },
    });

    expect(service.toReceipt(service.getForUser(job.id, 'user-1'))).toEqual(
      expect.objectContaining({
        progress: 45,
        stage: 'planner',
        completed: 1,
        total: 3,
        attempt: 1,
        maxAttempts: 3,
      }),
    );
  });

  it('retains the last reference work stage when failing and redacts failure log content', () => {
    const service = new ExamGenerationJobsService();
    const job = service.create('user-1', {
      subjectId: 'subject-1',
      startUnitNum: 1,
      endUnitNum: 1,
      difficulty: Difficulty.MIDDLE,
      questionCount: 1,
      sourceType: 'reference',
      referenceSourceIds: ['source-secret'],
    });

    service.push(job.id, 'user-1', {
      stage: 'planner',
      progress: 45,
      message: 'source-secret planner response',
      detail: 'source-secret prompt provider response',
      completed: 0,
      total: 1,
      attempt: 1,
      maxAttempts: 3,
    });
    service.fail(job.id, 'user-1', {
      code: 'REFERENCE_TIMEOUT',
      message: 'raw provider error with source-secret prompt',
    });

    const failedReceipt = service.toReceipt(
      service.getForUser(job.id, 'user-1'),
    );
    const failureLog = job.logs.at(-1);

    expect(failedReceipt).toEqual(
      expect.objectContaining({
        status: 'failed',
        stage: 'planner',
        errorCode: 'REFERENCE_TIMEOUT',
      }),
    );
    expect(failureLog).toEqual(
      expect.objectContaining({
        stage: 'planner',
        status: 'error',
        message: '시험 생성 중 오류가 발생했습니다.',
      }),
    );
    expect(failureLog).not.toHaveProperty('detail');
    expect(JSON.stringify(job.logs)).not.toContain('source-secret');
    expect(JSON.stringify(job.logs)).not.toContain('provider response');
    expect(JSON.stringify(job.logs)).not.toContain('raw provider error');
  });

  it('does not allow progress callbacks to mutate a terminal reference job', () => {
    const service = new ExamGenerationJobsService();
    const job = service.create('user-1', {
      subjectId: 'subject-1',
      startUnitNum: 1,
      endUnitNum: 1,
      difficulty: Difficulty.MIDDLE,
      questionCount: 1,
      sourceType: 'reference',
    });

    service.complete(job.id, 'user-1', 'exam-1');
    service.push(job.id, 'user-1', {
      stage: 'selection',
      progress: 10,
      message: 'late provider response',
      referenceProgress: {
        stage: 'selection',
        completed: 0,
        total: 1,
        attempt: 1,
        maxAttempts: 3,
      },
    });

    expect(service.toReceipt(service.getForUser(job.id, 'user-1'))).toEqual(
      expect.objectContaining({
        status: 'completed',
        progress: 100,
        stage: 'completed',
        completed: 1,
        total: 1,
        examId: 'exam-1',
      }),
    );
  });

  it('keeps gated AI stages monotonic and exposes only safe progress counters', () => {
    const service = new ExamGenerationJobsService();
    const job = service.create('user-1', {
      subjectId: 'subject-1',
      startUnitNum: 1,
      endUnitNum: 1,
      difficulty: Difficulty.MIDDLE,
      questionCount: 2,
      sourceType: 'ai_blueprint',
      aiQuestionFamily: 'concept',
      customPrompt: 'private prompt',
    });

    service.start(job.id, 'user-1');
    service.push(job.id, 'user-1', {
      stage: 'validation',
      progress: 70,
      message: 'private provider output',
      aiProgress: {
        stage: 'validation',
        completed: 1,
        total: 2,
        attempt: 2,
        maxAttempts: 3,
        accepted: 1,
        rejected: 1,
      },
    });
    service.push(job.id, 'user-1', {
      stage: 'candidate',
      progress: 30,
      message: 'stale provider output',
      aiProgress: {
        stage: 'candidate',
        completed: 0,
        total: 1,
        attempt: 1,
        maxAttempts: 1,
        accepted: 0,
        rejected: 0,
      },
    });

    const receipt = service.toReceipt(service.getForUser(job.id, 'user-1'));

    expect(receipt).toEqual(
      expect.objectContaining({
        sourceType: 'ai_blueprint',
        stage: 'validation',
        progress: 70,
        completed: 1,
        total: 2,
        attempt: 2,
        maxAttempts: 3,
        aiProgress: {
          stage: 'validation',
          completed: 1,
          total: 2,
          attempt: 2,
          maxAttempts: 3,
          accepted: 1,
          rejected: 1,
        },
      }),
    );
    expect(JSON.stringify(receipt)).not.toContain('private prompt');
    expect(JSON.stringify(receipt)).not.toContain('provider output');
  });
});
