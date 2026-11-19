import { InternalServerErrorException } from '@nestjs/common';
import { Difficulty, ExamSourceType } from '../entities/exam-record.entity';
import { ExamGenerationJobsService } from './exam-generation-jobs.service';
import { ExamsService } from './exams.service';

describe('ExamsService legacy AI compatibility', () => {
  it('keeps explicit AI requests on the existing generator and exam record path', async () => {
    const generate = jest.fn().mockResolvedValue([{ id: 'question-1' }]);
    const savedExam = { id: 'exam-1' };
    const manager = {
      save: jest.fn().mockResolvedValue(savedExam),
    };
    const service = {
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
});
