import { InternalServerErrorException } from '@nestjs/common';
import { Difficulty, ExamSourceType } from '../entities/exam-record.entity';
import { ExamGenerationJobsService } from './exam-generation-jobs.service';
import { ExamsService } from './exams.service';

describe('ExamsService reference generation persistence', () => {
  it('Given an accepted reference draft, When creating an exam, Then persists its complete non-sensitive fidelity receipt', async () => {
    const lineage = {
      generationPath: 'reference_frame' as const,
      source: { sourceId: 'source-1', sourceHash: 'hash-1' },
      archetype: {},
      frame: {},
      payload: {},
      selectedTemplate: 'TPL_COMPARATIVE_MATRIX',
      fidelity: {
        contractVersion: 1,
        sourceHash: 'hash-1',
        response: {
          choiceCount: 5,
          viewItemCount: 2,
          choiceTopology: 'combo_sets' as const,
          responseMode: 'truth_combination' as const,
        },
        density: {
          stimulusLength: 180,
          paragraphCount: 2,
          numericFactCount: 2,
          conditionSignalCount: 2,
        },
        receipt: {
          deterministic: 'passed' as const,
          copyPolicy: 'passed' as const,
          semanticVerifier: {
            model: 'gpt-5.6',
            verdict: 'accepted' as const,
            reasonCode: 'SOURCE_RELATIONS_PRESERVED',
          },
          retryCount: 1,
        },
      },
      validation: 'passed' as const,
    };
    const questionRepo = {
      create: jest.fn().mockImplementation((value) => value),
      save: jest.fn().mockResolvedValue({ id: 'question-1' }),
    };
    const unitRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'unit-1' }),
      create: jest.fn(),
      save: jest.fn(),
    };
    const manager = {
      getRepository: jest
        .fn()
        .mockReturnValueOnce(questionRepo)
        .mockReturnValueOnce(unitRepo),
      save: jest
        .fn()
        .mockResolvedValueOnce({ id: 'exam-1' })
        .mockResolvedValueOnce(undefined),
    };
    const service = {
      subjectRepo: {
        findOne: jest.fn().mockResolvedValue({
          id: 'subject-1',
          slug: 'success',
          title: 'Success',
        }),
      },
      referenceFrameGenerationService: {
        generate: jest.fn().mockResolvedValue([
          {
            lineage,
            result: {
              metadata: {
                unit_name: '1단원',
                target_concept: 'concept-1',
                item_type: 'reference_variant',
                difficulty: Difficulty.MIDDLE,
                recommended_template: 'TPL_COMPARATIVE_MATRIX',
              },
              render_ready: {
                question_stem: 'Variant question',
                stimulus_data: {},
                options_list: ['1', '2', '3', '4', '5'],
                combo_block: null,
              },
              explanation: { judgment: 'Explanation' },
              correct_answer: 1,
            },
          },
        ]),
      },
      examRepo: {
        create: jest.fn().mockImplementation((value) => value),
        manager: {
          transaction: async (
            work: (current: typeof manager) => Promise<unknown>,
          ) => work(manager),
        },
      },
      examItemRepo: {
        create: jest.fn().mockImplementation((value) => value),
        find: jest.fn().mockResolvedValue([]),
      },
      findOne: jest.fn().mockResolvedValue({ id: 'exam-1' }),
      createReferenceFrameExam:
        ExamsService.prototype['createReferenceFrameExam'],
    };

    await ExamsService.prototype.create.call(service, 'user-1', {
      subjectId: 'subject-1',
      startUnitNum: 1,
      endUnitNum: 1,
      difficulty: Difficulty.MIDDLE,
      questionCount: 1,
      sourceType: ExamSourceType.REFERENCE,
    });

    const persistedLineage =
      questionRepo.create.mock.calls[0]?.[0].generationLineage;
    expect(persistedLineage).toEqual(lineage);
    expect(questionRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        generationLineage: expect.objectContaining({
          fidelity: expect.objectContaining({
            receipt: lineage.fidelity.receipt,
          }),
        }),
      }),
    );
    expect(persistedLineage.fidelity.receipt).toEqual({
      deterministic: 'passed',
      copyPolicy: 'passed',
      semanticVerifier: {
        model: 'gpt-5.6',
        verdict: 'accepted',
        reasonCode: 'SOURCE_RELATIONS_PRESERVED',
      },
      retryCount: 1,
    });
    expect(JSON.stringify(persistedLineage)).not.toContain('referenceSource');
    expect(JSON.stringify(persistedLineage)).not.toContain('raw completion');
  });

  it('Given a simply_reference draft, When creating an exam, Then persists the selected source lineage with standard Question and ExamItem records', async () => {
    const questionRepo = {
      create: jest.fn().mockImplementation((value) => value),
      save: jest.fn().mockResolvedValue({ id: 'question-1' }),
    };
    const unitRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'unit-1' }),
      create: jest.fn(),
      save: jest.fn(),
    };
    const manager = {
      getRepository: jest
        .fn()
        .mockReturnValueOnce(questionRepo)
        .mockReturnValueOnce(unitRepo),
      save: jest
        .fn()
        .mockResolvedValueOnce({ id: 'exam-1' })
        .mockResolvedValueOnce(undefined),
    };
    const lineage = {
      generationPath: 'simply_reference' as const,
      generationNonce: 'prior-nonce',
      source: { sourceId: 'success:1:source.pdf:1', sourceHash: 'hash-1' },
      batchOrdinal: 1,
      selectedTemplate: 'TPL_REGENERATION_REQUIRED',
      validation: 'passed' as const,
    };
    const service = {
      subjectRepo: {
        findOne: jest.fn().mockResolvedValue({
          id: 'subject-1',
          slug: 'success',
          title: 'Success',
        }),
      },
      simplyReferenceGenerationService: {
        generate: jest.fn().mockResolvedValue([
          {
            lineage,
            result: {
              metadata: {
                unit_name: '1단원',
                target_concept: 'Career values',
                item_type: 'simply_reference',
                difficulty: Difficulty.MIDDLE,
                recommended_template: 'TPL_REGENERATION_REQUIRED',
              },
              render_ready: {
                question_stem: 'Generated question',
                stimulus_data: { body: 'Generated stimulus' },
                options_list: ['① one', '② two', '③ three', '④ four', '⑤ five'],
                combo_block: null,
              },
              explanation: { judgment: 'Explanation' },
              correct_answer: 1,
            },
          },
        ]),
      },
      examRepo: {
        find: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockImplementation((value) => value),
        manager: {
          transaction: async (
            work: (current: typeof manager) => Promise<unknown>,
          ) => work(manager),
        },
      },
      examItemRepo: { create: jest.fn().mockImplementation((value) => value) },
      findOne: jest.fn().mockResolvedValue({ id: 'exam-1' }),
      getSimplyReferenceHistory:
        ExamsService.prototype['getSimplyReferenceHistory'],
      createSimplyReferenceExam:
        ExamsService.prototype['createSimplyReferenceExam'],
    };

    await ExamsService.prototype.create.call(service, 'user-1', {
      subjectId: 'subject-1',
      startUnitNum: 1,
      endUnitNum: 1,
      difficulty: Difficulty.MIDDLE,
      questionCount: 1,
      sourceType: 'simply_reference',
    });

    expect(questionRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ generationLineage: lineage }),
    );
    expect(
      service.simplyReferenceGenerationService.generate,
    ).toHaveBeenCalledWith(
      'success',
      1,
      1,
      Difficulty.MIDDLE,
      1,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      expect.objectContaining({
        previousFingerprints: [],
        previousSourceIds: [],
      }),
    );
    expect(service.examRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ sourceType: ExamSourceType.REFERENCE }),
    );
    expect(service.examItemRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ examId: 'exam-1', questionId: 'question-1' }),
    );
  });

  it('Given a mixed semantic batch failure, When the background job runs, Then it writes no Question or ExamItem and exposes a sanitized failure code', async () => {
    const jobs = new ExamGenerationJobsService();
    const sourceText = 'UNIQUE_REFERENCE_SOURCE_TEXT_MUST_NOT_REACH_JOB_LOGS';
    const sourceId = 'UNIQUE_REFERENCE_SOURCE_ID_MUST_NOT_REACH_RECEIPTS';
    const questionRepo = { create: jest.fn(), save: jest.fn() };
    const manager = {
      getRepository: jest.fn().mockReturnValue(questionRepo),
      save: jest.fn(),
    };
    const transaction = jest.fn();
    const service = {
      subjectRepo: {
        findOne: jest.fn().mockResolvedValue({
          id: 'subject-1',
          slug: 'success',
          title: 'Success',
        }),
      },
      examGenerationJobsService: jobs,
      referenceFrameGenerationService: {
        generate: jest.fn().mockRejectedValue(
          new InternalServerErrorException({
            code: 'REFERENCE_GENERATION_SHORTFALL',
            generatedCount: 1,
            requestedCount: 2,
            stageCounts: { source: 1, planner: 0, fidelity: 0 },
            sourceId,
            sourceText,
          }),
        ),
      },
      examRepo: {
        manager: {
          transaction,
        },
      },
      examItemRepo: { create: jest.fn() },
      logger: { error: jest.fn() },
      runJob: ExamsService.prototype['runJob'],
      createWithProgress: ExamsService.prototype['createWithProgress'],
      createReferenceFrameExam:
        ExamsService.prototype['createReferenceFrameExam'],
    };

    const response = await ExamsService.prototype.createJob.call(
      service,
      'user-1',
      {
        subjectId: 'subject-1',
        startUnitNum: 1,
        endUnitNum: 1,
        difficulty: Difficulty.MIDDLE,
        questionCount: 2,
        sourceType: ExamSourceType.REFERENCE,
        referenceSourceIds: [sourceId],
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
        errorCode: 'REFERENCE_GENERATION_SHORTFALL',
        shortfall: {
          requestedCount: 2,
          generatedCount: 1,
          stageCounts: { source: 1, planner: 0, fidelity: 0 },
        },
      }),
    );
    expect(service.examRepo.manager.transaction).not.toHaveBeenCalled();
    expect(manager.getRepository).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
    expect(questionRepo.save).not.toHaveBeenCalled();
    expect(service.examItemRepo.create).not.toHaveBeenCalled();
    expect(JSON.stringify(response)).not.toContain(sourceId);
    expect(JSON.stringify(receipt)).not.toContain(sourceId);
    expect(JSON.stringify(receipt)).not.toContain(sourceText);
    expect(receipt).not.toHaveProperty('request');
    expect(receipt).not.toHaveProperty('logs');
    expect(receipt).not.toHaveProperty('error');
  });

  it('Given an incomplete synchronous reference batch, When creating an exam, Then it opens no transaction and writes no rows', async () => {
    const transaction = jest.fn();
    const manager = {
      getRepository: jest.fn(),
      save: jest.fn(),
    };
    const service = {
      subjectRepo: {
        findOne: jest.fn().mockResolvedValue({
          id: 'subject-1',
          slug: 'success',
          title: 'Success',
        }),
      },
      referenceFrameGenerationService: {
        generate: jest.fn().mockResolvedValue([{ slotId: 'slot-1' }]),
      },
      examRepo: {
        create: jest.fn(),
        manager: { transaction },
      },
      examItemRepo: { create: jest.fn() },
      createReferenceFrameExam:
        ExamsService.prototype['createReferenceFrameExam'],
    };

    const sourceId = 'UNIQUE_REFERENCE_SOURCE_ID_MUST_NOT_REACH_SYNC_ERROR';
    let errorResponse: unknown;
    try {
      await ExamsService.prototype.create.call(service, 'user-1', {
        subjectId: 'subject-1',
        startUnitNum: 1,
        endUnitNum: 1,
        difficulty: Difficulty.MIDDLE,
        questionCount: 2,
        sourceType: ExamSourceType.REFERENCE,
        referenceSourceIds: [sourceId],
      });
    } catch (error) {
      errorResponse =
        error instanceof InternalServerErrorException
          ? error.getResponse()
          : error;
    }

    expect(errorResponse).toEqual(
      expect.objectContaining({
        code: 'REFERENCE_GENERATION_SHORTFALL',
        requestedCount: 2,
        generatedCount: 1,
        stageCounts: { source: 0, planner: 0, fidelity: 0 },
      }),
    );
    expect(JSON.stringify(errorResponse)).not.toContain(sourceId);

    expect(transaction).not.toHaveBeenCalled();
    expect(manager.getRepository).not.toHaveBeenCalled();
    expect(manager.save).not.toHaveBeenCalled();
    expect(service.examRepo.create).not.toHaveBeenCalled();
    expect(service.examItemRepo.create).not.toHaveBeenCalled();
  });
});
