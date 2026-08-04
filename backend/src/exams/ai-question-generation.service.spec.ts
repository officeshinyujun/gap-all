import type { AiQuestionBlueprint } from './ai-blueprint.types';
import { AiQuestionGenerationService } from './ai-question-generation.service';

function blueprint(id: string, concept = '직무 분석'): AiQuestionBlueprint {
  return {
    id,
    family: 'case',
    subjectId: 'subject-1',
    unitNumber: 1,
    targetConcept: concept,
    template: 'TPL_CASE_DIAGNOSTIC_FRAME',
    invariantFacts: [],
    mutableSlots: [],
    answerRule: { id: 'answer-v1', description: 'server' },
    answerIndex: 1,
    distractorRule: { id: 'distractor-v1', description: 'server' },
    distractorConcepts: ['직업 윤리', '직업 훈련', '인사 평가', '경력 개발'],
    difficulty: 'MIDDLE',
    sourceEvidence: [{ sourceId: id, sourceHash: 'hash', unitNumber: 1 }],
    blueprintVersion: 'v1',
  };
}

function candidate(concept = '직무 분석') {
  return {
    stemText: '기업이 직무에 필요한 능력을 조사하였다.',
    explanationText: `${concept}은 직무에 필요한 능력을 파악하는 것이다.`,
  };
}

describe('AiQuestionGenerationService', () => {
  it('retries rejected candidates and admits only fully validated questions', async () => {
    const generate = jest
      .fn()
      .mockRejectedValueOnce(new Error('malformed'))
      .mockResolvedValueOnce(candidate());
    const progress = jest.fn();
    const service = new AiQuestionGenerationService({ generate });

    const result = await service.generate([blueprint('blueprint-1')], progress);

    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]?.attempt).toBe(2);
    expect(result.rejected).toEqual([
      {
        blueprintId: 'blueprint-1',
        attempt: 1,
        code: 'AI_PROVIDER_MALFORMED_OUTPUT',
        message: 'malformed',
      },
    ]);
    expect(result.shortfall).toBeUndefined();
    expect(progress).toHaveBeenCalled();
  });

  it('returns a shortfall after the bounded retry budget', async () => {
    const generate = jest.fn().mockRejectedValue(new Error('provider down'));
    const service = new AiQuestionGenerationService({ generate });

    const result = await service.generate([blueprint('blueprint-1')]);

    expect(result.accepted).toEqual([]);
    expect(generate).toHaveBeenCalledTimes(3);
    expect(result.shortfall).toEqual({
      requestedCount: 1,
      generatedCount: 0,
      reason: 'AI_RETRY_EXHAUSTED',
    });
  });

  it('rejects duplicate admitted questions instead of reusing them', async () => {
    const generate = jest.fn().mockResolvedValue(candidate());
    const service = new AiQuestionGenerationService({ generate });

    const result = await service.generate([
      blueprint('blueprint-1'),
      blueprint('blueprint-2'),
    ]);

    expect(result.accepted).toHaveLength(1);
    expect(result.shortfall?.generatedCount).toBe(1);
    expect(
      result.rejected.filter((item) => item.code === 'AI_DUPLICATE_REJECTED'),
    ).toHaveLength(3);
  });
});
