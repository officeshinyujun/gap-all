import { InternalServerErrorException } from '@nestjs/common';
import { Difficulty, ExamSourceType } from '../entities/exam-record.entity';
import { ExamGenerationJobsService } from './exam-generation-jobs.service';
import { ExamsService } from './exams.service';
import {
  ReferenceJobDeadline,
  ReferenceJobDeadlineExceededError,
} from './reference-job-deadline';
import { ReferenceFidelitySpecError } from './reference-fidelity-spec';

describe('ExamsService legacy AI compatibility', () => {
  it('creates isolated absolute deadlines only for reference jobs at job start', async () => {
    const createWithProgress = jest.fn().mockResolvedValue({
      id: 'exam-1',
      subject: { slug: 'success' },
      title: 'Reference exam',
    });
    const service = {
      examGenerationJobsService: {
        start: jest.fn(),
        push: jest.fn(),
        complete: jest.fn(),
      },
      createWithProgress,
      notificationsService: { createAndPushNotification: jest.fn() },
    };
    const referenceDto = {
      subjectId: 'subject-1',
      startUnitNum: 1,
      endUnitNum: 1,
      difficulty: Difficulty.MIDDLE,
      questionCount: 1,
      sourceType: ExamSourceType.REFERENCE,
    };

    await Promise.all([
      ExamsService.prototype['runJob'].call(
        service,
        'reference-job-1',
        'user-1',
        referenceDto,
      ),
      ExamsService.prototype['runJob'].call(
        service,
        'reference-job-2',
        'user-2',
        referenceDto,
      ),
      ExamsService.prototype['runJob'].call(service, 'ai-job', 'user-3', {
        ...referenceDto,
        sourceType: ExamSourceType.AI,
      }),
    ]);

    const firstDeadline = createWithProgress.mock.calls[0]?.[3];
    const secondDeadline = createWithProgress.mock.calls[1]?.[3];
    const aiDeadline = createWithProgress.mock.calls[2]?.[3];
    expect(firstDeadline).toBeInstanceOf(ReferenceJobDeadline);
    expect(secondDeadline).toBeInstanceOf(ReferenceJobDeadline);
    expect(firstDeadline).not.toBe(secondDeadline);
    expect(aiDeadline).toBeUndefined();
  });

  it('keeps explicit AI requests on the existing generator and exam record path', async () => {
    const generate = jest.fn().mockResolvedValue([{ id: 'question-1' }]);
    const savedExam = { id: 'exam-1' };
    const manager = {
      save: jest.fn().mockResolvedValue(savedExam),
    };
    const service = {
      examGenerationCooldownService: { reserve: jest.fn() },
      subjectRepo: {
        findOne: jest.fn().mockResolvedValue({
          id: 'subject-1',
          slug: 'success',
          title: 'Success',
        }),
      },
      examRepo: {
        create: jest.fn().mockImplementation((value) => value),
        manager: {
          transaction: async (
            work: (current: typeof manager) => Promise<unknown>,
          ) => work(manager),
        },
      },
      examItemRepo: { create: jest.fn().mockImplementation((value) => value) },
      examGeneratorService: { generate },
      findOne: jest
        .fn()
        .mockResolvedValue({ id: 'exam-1', sourceType: ExamSourceType.AI }),
    };

    const result = await ExamsService.prototype.create.call(service, 'user-1', {
      subjectId: 'subject-1',
      startUnitNum: 1,
      endUnitNum: 1,
      difficulty: Difficulty.MIDDLE,
      questionCount: 1,
      sourceType: ExamSourceType.AI,
    });

    expect(generate).toHaveBeenCalledTimes(1);
    expect(service.examGenerationCooldownService.reserve).toHaveBeenCalledWith(
      'user-1',
    );
    expect(service.examRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: ExamSourceType.AI }),
    );
    expect(result).toEqual({ id: 'exam-1', sourceType: ExamSourceType.AI });
  });

  it.each([
    ['explicit reference', ExamSourceType.REFERENCE],
    ['omitted source type', undefined],
  ])(
    'keeps %s requests on the reference generation path',
    async (_description, sourceType) => {
      const createReferenceFrameExam = jest
        .fn()
        .mockResolvedValue({ id: 'reference-exam-1' });
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
        examGeneratorService: { generate: jest.fn() },
      };

      const result = await ExamsService.prototype.create.call(
        service,
        'user-1',
        {
          subjectId: 'subject-1',
          startUnitNum: 1,
          endUnitNum: 1,
          difficulty: Difficulty.MIDDLE,
          questionCount: 1,
          sourceType,
        },
      );

      expect(createReferenceFrameExam).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ sourceType }),
        'Success',
        'success',
      );
      expect(service.examGeneratorService.generate).not.toHaveBeenCalled();
      expect(result).toEqual({ id: 'reference-exam-1' });
    },
  );

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

  it('maps synchronous reference deadline failures to the same stable error code', async () => {
    const service = {
      examGenerationCooldownService: { reserve: jest.fn() },
      subjectRepo: {
        findOne: jest.fn().mockResolvedValue({
          id: 'subject-1',
          slug: 'success',
          title: 'Success',
        }),
      },
      createReferenceFrameExam: jest
        .fn()
        .mockRejectedValue(
          new ReferenceJobDeadlineExceededError('planner', 100),
        ),
    };

    await expect(
      ExamsService.prototype.create.call(service, 'user-1', {
        subjectId: 'subject-1',
        startUnitNum: 1,
        endUnitNum: 1,
        difficulty: Difficulty.MIDDLE,
        questionCount: 1,
        sourceType: ExamSourceType.REFERENCE,
      }),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'REFERENCE_GENERATION_TIMEOUT',
      }),
    });
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
