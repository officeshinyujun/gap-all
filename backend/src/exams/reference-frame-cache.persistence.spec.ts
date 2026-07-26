import { InternalServerErrorException } from '@nestjs/common';
import { ExamSourceType, Difficulty } from '../entities/exam-record.entity';
import { Question } from '../entities/question.entity';
import { ReferenceFrameCache } from '../entities/reference-frame-cache.entity';
import { Unit } from '../entities/unit.entity';
import { ExamsService } from './exams.service';
import { ReferenceJobDeadlineExceededError } from './reference-job-deadline';

type Failure = 'items' | 'unique';

function cacheMutation(index: number) {
  return {
    sourceId: `source-${index}`,
    sourceHash: `hash-${index}`,
    model: 'gpt-5.6',
    contractVersion: 301,
    archetypeFingerprint: `3:fingerprint-${index}`,
    frame: {
      source: { sourceId: `source-${index}`, sourceHash: `hash-${index}` },
      subject: 'success',
      unitRange: { start: 1, end: 1 },
      archetype: { version: 3, fingerprint: `3:fingerprint-${index}` },
    },
  };
}

function draft(index: number) {
  return {
    cacheMutation: cacheMutation(index),
    lineage: {},
    result: {
      metadata: {
        unit_name: '1단원',
        target_concept: `concept-${index}`,
        item_type: 'reference_variant',
        difficulty: Difficulty.MIDDLE,
        recommended_template: 'TPL_COMPARATIVE_MATRIX',
      },
      render_ready: {
        question_stem: `Question ${index}`,
        stimulus_data: { index },
        options_list: ['1', '2', '3', '4', '5'],
        combo_block: null,
      },
      explanation: { judgment: 'valid' },
      correct_answer: 1,
    },
  };
}

function makeService(drafts: readonly unknown[], failure?: Failure) {
  const cacheRows: unknown[] = [];
  const questionRows: unknown[] = [];
  const examRows: unknown[] = [];
  const itemRows: unknown[] = [];
  let inTransaction = false;
  let questionIndex = 0;

  const questionRepo = {
    create: jest.fn((value) => value),
    save: jest.fn(async (value) => {
      if (!inTransaction) throw new Error('question write escaped transaction');
      questionRows.push(value);
      questionIndex += 1;
      return { ...value, id: `question-${questionIndex}` };
    }),
  };
  const unitRepo = {
    findOne: jest.fn().mockResolvedValue({ id: 'unit-1' }),
  };
  const cacheRepo = {
    save: jest.fn(async (value) => {
      if (!inTransaction) throw new Error('cache write escaped transaction');
      if (failure === 'unique') throw new Error('unique cache conflict');
      cacheRows.push(value);
      return value;
    }),
  };
  const managerSave = jest.fn(async (value: unknown) => {
    if (!inTransaction) throw new Error('exam write escaped transaction');
    if (examRows.length === 0) {
      examRows.push(value);
      return { id: 'exam-1' };
    }
    if (failure === 'items') throw new Error('item write failed');
    itemRows.push(value);
    return value;
  });
  const manager = {
    getRepository: jest.fn((entity: unknown) => {
      if (entity === Question) return questionRepo;
      if (entity === Unit) return unitRepo;
      if (entity === ReferenceFrameCache) return cacheRepo;
      throw new Error('unexpected repository');
    }),
    save: managerSave,
  };
  const transaction = jest.fn(
    async (work: (value: typeof manager) => Promise<unknown>) => {
      const counts = [
        cacheRows.length,
        questionRows.length,
        examRows.length,
        itemRows.length,
      ];
      inTransaction = true;
      try {
        return await work(manager);
      } catch (error) {
        cacheRows.length = counts[0] ?? 0;
        questionRows.length = counts[1] ?? 0;
        examRows.length = counts[2] ?? 0;
        itemRows.length = counts[3] ?? 0;
        throw error;
      } finally {
        inTransaction = false;
      }
    },
  );
  const service = {
    subjectRepo: {
      findOne: jest.fn().mockResolvedValue({
        id: 'subject-1',
        slug: 'success',
        title: 'Success',
      }),
    },
    referenceFrameGenerationService: {
      generate: jest.fn().mockResolvedValue(drafts),
    },
    examRepo: {
      create: jest.fn((value) => value),
      manager: { transaction },
    },
    examItemRepo: { create: jest.fn((value) => value) },
    findOne: jest.fn().mockResolvedValue({ id: 'exam-1' }),
    createReferenceFrameExam:
      ExamsService.prototype['createReferenceFrameExam'],
  };

  return {
    cacheRepo,
    cacheRows,
    examRows,
    itemRows,
    manager,
    questionRows,
    service,
    transaction,
  };
}

function request(questionCount: number) {
  return {
    subjectId: 'subject-1',
    startUnitNum: 1,
    endUnitNum: 1,
    difficulty: Difficulty.MIDDLE,
    questionCount,
    sourceType: ExamSourceType.REFERENCE,
  };
}

describe('reference frame cache transaction boundary', () => {
  it('does not write cache or exam rows for a 9/10 generation shortfall', async () => {
    const harness = makeService([
      { ...draft(1), cacheMutation: cacheMutation(1) },
    ]);

    await expect(
      ExamsService.prototype.create.call(
        harness.service,
        'user-1',
        request(10),
      ),
    ).rejects.toBeInstanceOf(InternalServerErrorException);

    expect(harness.transaction).not.toHaveBeenCalled();
    expect(harness.cacheRepo.save).not.toHaveBeenCalled();
    expect(harness.cacheRows).toHaveLength(0);
    expect(harness.questionRows).toHaveLength(0);
    expect(harness.examRows).toHaveLength(0);
    expect(harness.itemRows).toHaveLength(0);
  });

  it.each(['planner', 'final_generator'] as const)(
    'does not write cache or exam rows when %s times out',
    async (stage) => {
      const harness = makeService([]);
      harness.service.referenceFrameGenerationService.generate = jest
        .fn()
        .mockRejectedValue(new ReferenceJobDeadlineExceededError(stage, 100));

      await expect(
        ExamsService.prototype.create.call(
          harness.service,
          'user-1',
          request(10),
        ),
      ).rejects.toMatchObject({
        response: { code: 'REFERENCE_GENERATION_TIMEOUT' },
      });

      expect(harness.transaction).not.toHaveBeenCalled();
      expect(harness.cacheRepo.save).not.toHaveBeenCalled();
      expect(harness.cacheRows).toHaveLength(0);
    },
  );

  it('does not write cache or exam rows for a bounded candidate shortfall', async () => {
    const harness = makeService([]);
    harness.service.referenceFrameGenerationService.generate = jest
      .fn()
      .mockRejectedValue(
        new InternalServerErrorException({
          code: 'REFERENCE_GENERATION_SHORTFALL',
          requestedCount: 10,
          generatedCount: 7,
          candidateCounts: {
            attempted: 15,
            eligible: 20,
            generated: 7,
            omittedEligibleCount: 5,
          },
          stageCounts: { source: 2, planner: 3, fidelity: 2, admission: 1 },
        }),
      );

    await expect(
      ExamsService.prototype.create.call(
        harness.service,
        'user-1',
        request(10),
      ),
    ).rejects.toMatchObject({
      response: { code: 'REFERENCE_GENERATION_SHORTFALL' },
    });

    expect(harness.transaction).not.toHaveBeenCalled();
    expect(harness.cacheRows).toHaveLength(0);
    expect(harness.questionRows).toHaveLength(0);
    expect(harness.examRows).toHaveLength(0);
    expect(harness.itemRows).toHaveLength(0);
  });

  it('writes every staged cache and exam row in one successful transaction', async () => {
    const harness = makeService(
      Array.from({ length: 10 }, (_, index) => draft(index + 1)),
    );

    await ExamsService.prototype.create.call(
      harness.service,
      'user-1',
      request(10),
    );

    expect(harness.transaction).toHaveBeenCalledTimes(1);
    expect(harness.manager.getRepository).toHaveBeenCalledWith(
      ReferenceFrameCache,
    );
    expect(harness.cacheRepo.save).toHaveBeenCalledTimes(10);
    expect(harness.cacheRows[0]).toEqual(
      expect.objectContaining({
        sourceId: 'source-1',
        sourceHash: 'hash-1',
        contractVersion: 301,
        archetypeFingerprint: '3:fingerprint-1',
        frame: cacheMutation(1).frame,
      }),
    );
    expect(harness.questionRows).toHaveLength(10);
    expect(harness.examRows).toHaveLength(1);
    expect(harness.itemRows).toHaveLength(1);
  });

  it('rolls back staged cache and exam rows when a later transaction write fails', async () => {
    const harness = makeService([draft(1)], 'items');

    await expect(
      ExamsService.prototype.create.call(harness.service, 'user-1', request(1)),
    ).rejects.toBeInstanceOf(InternalServerErrorException);

    expect(harness.cacheRepo.save).toHaveBeenCalledTimes(1);
    expect(harness.cacheRows).toHaveLength(0);
    expect(harness.questionRows).toHaveLength(0);
    expect(harness.examRows).toHaveLength(0);
    expect(harness.itemRows).toHaveLength(0);
  });

  it('rolls back exam rows when a concurrent cache key conflicts', async () => {
    const harness = makeService([draft(1)], 'unique');

    await expect(
      ExamsService.prototype.create.call(harness.service, 'user-1', request(1)),
    ).rejects.toBeInstanceOf(InternalServerErrorException);

    expect(harness.cacheRepo.save).toHaveBeenCalledTimes(1);
    expect(harness.cacheRows).toHaveLength(0);
    expect(harness.questionRows).toHaveLength(0);
    expect(harness.examRows).toHaveLength(0);
    expect(harness.itemRows).toHaveLength(0);
  });
});
