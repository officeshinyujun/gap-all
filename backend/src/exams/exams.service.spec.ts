import { InternalServerErrorException } from '@nestjs/common';
import { Difficulty, ExamSourceType } from '../entities/exam-record.entity';
import { ExamGenerationJobsService } from './exam-generation-jobs.service';
import { ExamsService } from './exams.service';
import { ReferenceJobDeadlineExceededError } from './reference-job-deadline';
import { ReferenceFidelitySpecError } from './reference-fidelity-spec';

describe('ExamsService legacy AI compatibility', () => {
  it('rejects the gated ai_blueprint mode before starting a job while disabled', async () => {
    const subjectLookup = jest.fn();
    const service = {
      subjectRepo: { findOne: subjectLookup },
    };
    const previousFlag = process.env.ENABLE_AI_BLUEPRINT_GENERATION;
    delete process.env.ENABLE_AI_BLUEPRINT_GENERATION;

    try {
      await expect(
        ExamsService.prototype.createJob.call(service, 'user-1', {
          subjectId: 'subject-1',
          startUnitNum: 1,
          endUnitNum: 1,
          difficulty: Difficulty.MIDDLE,
          questionCount: 1,
          sourceType: 'ai_blueprint',
        }),
      ).rejects.toMatchObject({
        response: {
          code: 'AI_FEATURE_DISABLED',
        },
      });
      expect(subjectLookup).not.toHaveBeenCalled();
    } finally {
      if (previousFlag === undefined) {
        delete process.env.ENABLE_AI_BLUEPRINT_GENERATION;
      } else {
        process.env.ENABLE_AI_BLUEPRINT_GENERATION = previousFlag;
      }
    }
  });

  it('starts an ai_blueprint job instead of falling back to simply_reference when enabled', async () => {
    const job = { id: 'job-ai-1' };
    const jobs = {
      assertNoActiveJobForUser: jest.fn(),
      create: jest.fn().mockReturnValue(job),
      toReceipt: jest.fn().mockReturnValue({
        jobId: job.id,
        status: 'pending',
        sourceType: 'ai_blueprint',
      }),
    };
    const runJob = jest.fn().mockResolvedValue(undefined);
    const service = {
      subjectRepo: {
        findOne: jest.fn().mockResolvedValue({
          id: 'subject-1',
          slug: 'success',
          title: 'Success',
        }),
      },
      examGenerationJobsService: jobs,
      examGenerationCooldownService: { reserve: jest.fn() },
      runJob,
    };
    const previousFlag = process.env.ENABLE_AI_BLUEPRINT_GENERATION;
    process.env.ENABLE_AI_BLUEPRINT_GENERATION = 'true';

    try {
      await expect(
        ExamsService.prototype.createJob.call(service, 'user-1', {
          subjectId: 'subject-1',
          startUnitNum: 1,
          endUnitNum: 1,
          difficulty: Difficulty.MIDDLE,
          questionCount: 1,
          sourceType: 'ai_blueprint',
        }),
      ).resolves.toEqual(expect.objectContaining({ jobId: job.id }));
      expect(jobs.create).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ sourceType: 'ai_blueprint' }),
      );
      expect(runJob).toHaveBeenCalledWith(
        job.id,
        'user-1',
        expect.objectContaining({ sourceType: 'ai_blueprint' }),
      );
    } finally {
      if (previousFlag === undefined) {
        delete process.env.ENABLE_AI_BLUEPRINT_GENERATION;
      } else {
        process.env.ENABLE_AI_BLUEPRINT_GENERATION = previousFlag;
      }
    }
  });

  it('routes simply_reference requests to the lightweight reference path', async () => {
    const createReferenceFrameExam = jest.fn();
    const createSimplyReferenceExam = jest
      .fn()
      .mockResolvedValue({ id: 'simply-reference-exam-1' });
    const service = {
      examGenerationCooldownService: { reserve: jest.fn() },
      subjectRepo: {
        findOne: jest.fn().mockResolvedValue({
          id: 'subject-1',
          slug: 'success',
          title: 'Success',
        }),
      },
      createReferenceFrameExam,
      createSimplyReferenceExam,
      examGeneratorService: { generate: jest.fn() },
    };

    const result = await ExamsService.prototype.create.call(service, 'user-1', {
      subjectId: 'subject-1',
      startUnitNum: 1,
      endUnitNum: 1,
      difficulty: Difficulty.MIDDLE,
      questionCount: 1,
      sourceType: 'simply_reference',
    });

    expect(createSimplyReferenceExam).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ sourceType: 'simply_reference' }),
      'Success',
      'success',
    );
    expect(createReferenceFrameExam).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 'simply-reference-exam-1' });
  });

  it('reads prior simply_reference sources only from the same user and exact range', async () => {
    const service = {
      examRepo: {
        find: jest.fn().mockResolvedValue([{ id: 'exam-1' }]),
      },
      examItemRepo: {
        find: jest.fn().mockResolvedValue([
          {
            question: {
              itemType: 'simply_reference',
              questionStem: '이전 문항',
              stimulusData: { narrative: '이전 자료' },
              optionsList: ['① 하나', '② 둘', '③ 셋', '④ 넷', '⑤ 다섯'],
              comboBlock: null,
              generationLineage: {
                generationPath: 'simply_reference',
                generationNonce: 'prior-nonce',
                source: {
                  sourceId: 'success:1:source-1.pdf:1',
                  sourceHash: 'hash-1',
                },
                batchOrdinal: 1,
                selectedTemplate: 'TPL_CASE_DIAGNOSTIC_FRAME',
                adapterVersion: 0,
                validation: 'passed',
              },
            },
          },
          {
            question: {
              itemType: 'normal_ai',
              questionStem: '일반 문항',
              stimulusData: {},
              optionsList: [],
              comboBlock: null,
              generationLineage: null,
            },
          },
        ]),
      },
    };

    const history = await ExamsService.prototype[
      'getSimplyReferenceHistory'
    ].call(service, 'user-1', 'subject-1', 1, 1);

    expect(service.examRepo.find).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        subjectId: 'subject-1',
        startUnitNum: 1,
        endUnitNum: 1,
      },
    });
    expect(history.sourceIds).toEqual(['success:1:source-1.pdf:1']);
    expect(history.fingerprints).toHaveLength(1);
  });

  it.each([
    ['planner', 'planner'],
    ['final_generator', 'final'],
    ['semantic_verifier', 'final'],
  ] as const)(
    'maps a %s deadline into a stable redacted job receipt',
    async (deadlineStage, receiptStage) => {
      const jobs = new ExamGenerationJobsService();
      const sourceSecret = 'source-secret';
      const providerSecret = 'provider-response-secret';
      const createWithProgress = jest.fn(
        async (
          _userId: string,
          _dto: unknown,
          reportProgress: (update: unknown) => void,
        ) => {
          reportProgress({
            stage: receiptStage,
            progress: 65,
            message: `${sourceSecret} ${providerSecret}`,
            detail: `${sourceSecret} ${providerSecret}`,
            completed: 2,
            total: 3,
            attempt: 2,
            maxAttempts: 3,
          });
          throw new ReferenceJobDeadlineExceededError(deadlineStage, 100);
        },
      );
      const service = {
        examGenerationCooldownService: { reserve: jest.fn() },
        subjectRepo: {
          findOne: jest.fn().mockResolvedValue({
            id: 'subject-1',
            slug: 'success',
            title: 'Success',
          }),
        },
        examGenerationJobsService: jobs,
        createWithProgress,
        notificationsService: { createAndPushNotification: jest.fn() },
        logger: { error: jest.fn() },
        runJob: ExamsService.prototype['runJob'],
      };
      const response = await ExamsService.prototype.createJob.call(
        service,
        'user-1',
        {
          subjectId: 'subject-1',
          startUnitNum: 1,
          endUnitNum: 1,
          difficulty: Difficulty.MIDDLE,
          questionCount: 3,
          sourceType: ExamSourceType.REFERENCE,
          referenceSourceIds: [sourceSecret],
        },
      );
      await new Promise<void>((resolve) => setImmediate(resolve));

      const receipt = ExamsService.prototype.getJob.call(
        service,
        'user-1',
        response.jobId,
      );
      expect(receipt).toEqual(
        expect.objectContaining({
          status: 'failed',
          errorCode: 'REFERENCE_GENERATION_TIMEOUT',
          stage: receiptStage,
          progress: 65,
          completed: 2,
          total: 3,
          attempt: 2,
          maxAttempts: 3,
        }),
      );
      expect(JSON.stringify(receipt)).not.toContain(sourceSecret);
      expect(JSON.stringify(receipt)).not.toContain(providerSecret);
    },
  );

  it('maps bounded shortfall counters into a redacted job receipt', async () => {
    const jobs = new ExamGenerationJobsService();
    const sourceSecret = 'source-secret';
    const providerSecret = 'provider-response-secret';
    const createWithProgress = jest.fn(async () => {
      throw new InternalServerErrorException({
        code: 'REFERENCE_GENERATION_SHORTFALL',
        requestedCount: 10,
        generatedCount: 7,
        candidateCounts: {
          attempted: 12,
          eligible: 15,
          generated: 7,
          omittedEligibleCount: 3,
        },
        stageCounts: { source: 1, planner: 2, fidelity: 1, admission: 1 },
        sourceSecret,
        providerSecret,
      });
    });
    const service = {
      examGenerationCooldownService: { reserve: jest.fn() },
      subjectRepo: {
        findOne: jest.fn().mockResolvedValue({
          id: 'subject-1',
          slug: 'success',
          title: 'Success',
        }),
      },
      examGenerationJobsService: jobs,
      createWithProgress,
      notificationsService: { createAndPushNotification: jest.fn() },
      logger: { error: jest.fn() },
      runJob: ExamsService.prototype['runJob'],
    };

    const response = await ExamsService.prototype.createJob.call(
      service,
      'user-1',
      {
        subjectId: 'subject-1',
        startUnitNum: 1,
        endUnitNum: 1,
        difficulty: Difficulty.MIDDLE,
        questionCount: 10,
        sourceType: ExamSourceType.REFERENCE,
      },
    );
    await new Promise<void>((resolve) => setImmediate(resolve));

    expect(service.examGenerationCooldownService.reserve).toHaveBeenCalledWith(
      'user-1',
    );

    const receipt = ExamsService.prototype.getJob.call(
      service,
      'user-1',
      response.jobId,
    );
    expect(receipt).toEqual(
      expect.objectContaining({
        status: 'failed',
        errorCode: 'REFERENCE_GENERATION_SHORTFALL',
        shortfall: {
          requestedCount: 10,
          generatedCount: 7,
          candidateCounts: {
            attempted: 12,
            eligible: 15,
            generated: 7,
            omittedEligibleCount: 3,
          },
          stageCounts: { source: 1, planner: 2, fidelity: 1, admission: 1 },
        },
      }),
    );
    expect(JSON.stringify(receipt)).not.toContain(sourceSecret);
    expect(JSON.stringify(receipt)).not.toContain(providerSecret);
  });

  it('maps a fidelity-spec failure into a stable redacted job receipt', async () => {
    const jobs = new ExamGenerationJobsService();
    const sourceSecret = 'source-secret';
    const createWithProgress = jest.fn(async () => {
      throw new ReferenceFidelitySpecError({
        code: 'INCOMPLETE_OPTION_MAPPING',
        path: sourceSecret,
      });
    });
    const service = {
      examGenerationCooldownService: { reserve: jest.fn() },
      subjectRepo: {
        findOne: jest.fn().mockResolvedValue({
          id: 'subject-1',
          slug: 'success',
          title: 'Success',
        }),
      },
      examGenerationJobsService: jobs,
      createWithProgress,
      notificationsService: { createAndPushNotification: jest.fn() },
      logger: { error: jest.fn() },
      runJob: ExamsService.prototype['runJob'],
    };
    const response = await ExamsService.prototype.createJob.call(
      service,
      'user-1',
      {
        subjectId: 'subject-1',
        startUnitNum: 1,
        endUnitNum: 1,
        difficulty: Difficulty.MIDDLE,
        questionCount: 3,
        sourceType: ExamSourceType.REFERENCE,
        referenceSourceIds: [sourceSecret],
      },
    );
    await new Promise<void>((resolve) => setImmediate(resolve));

    const receipt = ExamsService.prototype.getJob.call(
      service,
      'user-1',
      response.jobId,
    );
    expect(receipt).toEqual(
      expect.objectContaining({
        status: 'failed',
        errorCode: 'REFERENCE_FIDELITY_FAILED',
      }),
    );
    expect(JSON.stringify(receipt)).not.toContain(sourceSecret);
  });

  it.each(['notification row creation failed', 'push delivery failed'])(
    'keeps a completed job terminal when %s',
    async (notificationError) => {
      const jobs = new ExamGenerationJobsService();
      const service = {
        examGenerationCooldownService: { reserve: jest.fn() },
        subjectRepo: {
          findOne: jest.fn().mockResolvedValue({
            id: 'subject-1',
            slug: 'success',
            title: 'Success',
          }),
        },
        examGenerationJobsService: jobs,
        createWithProgress: jest.fn().mockResolvedValue({
          id: 'exam-1',
          subject: { slug: 'success' },
          title: 'Success exam',
        }),
        notificationsService: {
          createAndPushNotification: jest
            .fn()
            .mockRejectedValue(new Error(notificationError)),
        },
        logger: { error: jest.fn() },
        runJob: ExamsService.prototype['runJob'],
      };

      const response = await ExamsService.prototype.createJob.call(
        service,
        'user-1',
        {
          subjectId: 'subject-1',
          startUnitNum: 1,
          endUnitNum: 1,
          difficulty: Difficulty.MIDDLE,
          questionCount: 1,
          sourceType: ExamSourceType.REFERENCE,
        },
      );
      await new Promise<void>((resolve) => setImmediate(resolve));

      const receipt = ExamsService.prototype.getJob.call(
        service,
        'user-1',
        response.jobId,
      );
      expect(receipt).toEqual(
        expect.objectContaining({
          status: 'completed',
          progress: 100,
          examId: 'exam-1',
        }),
      );
      expect(service.logger.error).toHaveBeenCalled();
    },
  );
});
