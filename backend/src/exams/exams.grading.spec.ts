import { ExamsService } from './exams.service';

/**
 * 자동 저장(1.5초 지연)이 채점 직후 도착해 is_correct를 덮어쓰던 버그 회귀 테스트.
 * 실제 사례: 3문항 중 2개 정답(점수 67)인데 결과 화면이 33%로 표시됨.
 */
describe('ExamsService grading consistency', () => {
  function examFixture(totalScore: number | null) {
    return {
      id: 'exam-1',
      userId: 'user-1',
      title: '시험',
      difficulty: 'MIDDLE',
      totalScore,
      createdAt: new Date(),
      subject: null,
      items: [
        { id: 'item-1', orderIndex: 1, userAnswer: 1, isCorrect: false, question: question(3) },
        { id: 'item-2', orderIndex: 2, userAnswer: 4, isCorrect: true, question: question(4) },
        // 채점 후 자동 저장이 덮어써서 플래그만 false로 남은 상태
        { id: 'item-3', orderIndex: 3, userAnswer: 5, isCorrect: false, question: question(5) },
      ],
    };
  }

  function question(correctAnswer: number) {
    return {
      id: `q-${correctAnswer}`,
      targetConcept: '개념',
      questionStem: '발문',
      stimulusData: {},
      recommendedTemplate: 'TPL_SOURCE_BLOCKS',
      optionsList: [],
      comboBlock: null,
      correctAnswer,
      explanation: {},
      setGroupId: null,
      setPosition: null,
    };
  }

  it('updates only the answer column while the exam is in progress', async () => {
    const update = jest.fn().mockResolvedValue(undefined);
    const save = jest.fn();
    const service = {
      examRepo: { findOne: jest.fn().mockResolvedValue(examFixture(null)) },
      examItemRepo: { update, save },
    };

    const result = await ExamsService.prototype.saveAnswers.call(service as never, 'user-1', 'exam-1', [
      { examItemId: 'item-3', answer: 2 },
    ]);

    expect(result).toEqual({ saved: 1 });
    expect(update).toHaveBeenCalledWith({ id: 'item-3', examId: 'exam-1' }, { userAnswer: 2 });
    expect(save).not.toHaveBeenCalled();
  });

  it('ignores a late auto-save after the exam was submitted', async () => {
    const update = jest.fn();
    const service = {
      examRepo: { findOne: jest.fn().mockResolvedValue(examFixture(67)) },
      examItemRepo: { update, save: jest.fn() },
    };

    const result = await ExamsService.prototype.saveAnswers.call(service as never, 'user-1', 'exam-1', [
      { examItemId: 'item-3', answer: 5 },
    ]);

    expect(result).toEqual({ saved: 0 });
    expect(update).not.toHaveBeenCalled();
  });

  it('derives correctness from answers for a submitted exam, matching the stored score', async () => {
    const service = {
      examRepo: { findOne: jest.fn().mockResolvedValue(examFixture(67)) },
      normalizer: {
        normalizeStimulusWithTemplate: (stimulusData: unknown, template: string) => ({
          stimulusData,
          effectiveTemplate: template,
        }),
      },
    };

    const result = await ExamsService.prototype.getResult.call(service as never, 'user-1', 'exam-1');

    expect(result.correctCount).toBe(2);
    expect(result.totalCount).toBe(3);
    expect(Math.round((result.correctCount / result.totalCount) * 100)).toBe(result.score);
    expect(result.items.map((item: { isCorrect: boolean }) => item.isCorrect)).toEqual([false, true, true]);
  });
});
