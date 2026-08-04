import { validate } from 'class-validator';
import { Difficulty } from '../../entities/exam-record.entity';
import { CreateExamDto } from './create-exam.dto';

describe('CreateExamDto bounds', () => {
  it('rejects oversized generation inputs and unknown source types', async () => {
    const dto = Object.assign(new CreateExamDto(), {
      subjectId: '5d0199c5-6bf6-4a92-a3f8-dbd8679bf9e7',
      startUnitNum: 1,
      endUnitNum: 21,
      difficulty: Difficulty.MIDDLE,
      questionCount: 1,
      customPrompt: 'x'.repeat(4001),
      targetConcepts: Array.from({ length: 21 }, () => 'concept'),
      referenceSourceIds: Array.from({ length: 101 }, () => 'source'),
      sourceType: 'unknown',
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toEqual(
      expect.arrayContaining([
        'endUnitNum',
        'customPrompt',
        'targetConcepts',
        'referenceSourceIds',
        'sourceType',
      ]),
    );
  });

  it('accepts the gated ai_blueprint mode and a supported family', async () => {
    const dto = Object.assign(new CreateExamDto(), {
      subjectId: '5d0199c5-6bf6-4a92-a3f8-dbd8679bf9e7',
      startUnitNum: 1,
      endUnitNum: 1,
      difficulty: Difficulty.MIDDLE,
      questionCount: 1,
      sourceType: 'ai_blueprint',
      aiQuestionFamily: 'concept',
    });

    await expect(validate(dto)).resolves.toEqual([]);
  });

  it('rejects an unsupported ai blueprint family', async () => {
    const dto = Object.assign(new CreateExamDto(), {
      subjectId: '5d0199c5-6bf6-4a92-a3f8-dbd8679bf9e7',
      startUnitNum: 1,
      endUnitNum: 1,
      difficulty: Difficulty.MIDDLE,
      questionCount: 1,
      sourceType: 'ai_blueprint',
      aiQuestionFamily: 'combination',
    });

    const errors = await validate(dto);

    expect(errors.map((error) => error.property)).toContain('aiQuestionFamily');
  });
});
