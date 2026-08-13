import type { AiQuestionBlueprint } from './ai-blueprint.types';
import {
  AiQuestionGenerationService,
  aiQuestionStructuralFingerprint,
} from './ai-question-generation.service';
import { classifyReferenceArchetype } from './reference-archetype';

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
        template: 'TPL_CASE_DIAGNOSTIC_FRAME',
        attempt: 1,
        code: 'AI_PROVIDER_MALFORMED_OUTPUT',
        message: 'malformed',
      },
    ]);
    expect(result.shortfall).toBeUndefined();
    expect(progress).toHaveBeenCalled();
  });

  it('keeps the stimulus when provider choices violate the answer rule', async () => {
    const generate = jest.fn().mockResolvedValue({
      ...candidate(),
      choiceTexts: [
        '첫 번째 판단 문장입니다.',
        '둘째 판단 문장입니다.',
        '셋째 판단 문장입니다.',
        '넷째 판단 문장입니다.',
        '다섯째 판단 문장입니다.',
      ],
    });
    const service = new AiQuestionGenerationService({ generate });

    const result = await service.generate([blueprint('blueprint-1')]);

    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]?.question.optionsList).toEqual([
      '① 이 사례는 직무 분석의 핵심 조건에 부합한다.',
      '② 이 사례는 직업 윤리의 핵심 조건에 부합한다.',
      '③ 이 사례는 직업 훈련의 핵심 조건에 부합한다.',
      '④ 이 사례는 인사 평가의 핵심 조건에 부합한다.',
      '⑤ 이 사례는 경력 개발의 핵심 조건에 부합한다.',
    ]);
    expect(result.rejected[0]?.code).toBe('AI_ANSWER_RULE_MISMATCH');
  });

  it('keeps generated choices only after semantic verification', async () => {
    const choices = [
      '① 직무 분석에 해당한다.',
      '② 직업 윤리에 해당한다.',
      '③ 직업 훈련에 해당한다.',
      '④ 인사 평가에 해당한다.',
      '⑤ 경력 개발에 해당한다.',
    ];
    const generate = jest.fn().mockResolvedValue({
      ...candidate(),
      stemText: '근로자 3명이 기업과 계약을 체결하였다.',
      choiceTexts: choices,
    });
    const verifyChoices = jest.fn().mockResolvedValue({
      passed: true,
      answerIndex: 1,
      choices: choices.map((_, index) => ({
        index: (index + 1) as 1 | 2 | 3 | 4 | 5,
        correct: index === 0,
        reason:
          index === 0 ? 'target condition matches' : 'distractor condition',
      })),
    });

    const classified = classifyReferenceArchetype({
      stem: '다음 사례에 대한 설명으로 옳은 것은?',
      stimulus: 'A씨는 직무에 필요한 능력을 분석하였다.',
      viewItems: [],
      choices: ['① 하나', '② 둘', '③ 셋', '④ 넷', '⑤ 다섯'],
      targetConcepts: ['직무 분석'],
    });
    if (classified.kind !== 'classified') throw new Error('invalid fixture');
    const result = await new AiQuestionGenerationService({
      generate,
      verifyChoices,
    }).generate([
      {
        ...blueprint('blueprint-verified'),
        sourceArchetype: { ...classified.value, stimulusRole: 'prose' },
      },
    ]);

    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]?.question.optionsList).toEqual(choices);
    expect(verifyChoices).toHaveBeenCalledTimes(1);
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
      rejectionsByCode: {
        AI_PROVIDER_MALFORMED_OUTPUT: 3,
      },
    });
    expect(result.rejectionsByTemplate).toEqual({
      TPL_CASE_DIAGNOSTIC_FRAME: 3,
    });
  });

  it('runs independent blueprints concurrently within the worker limit', async () => {
    let active = 0;
    let maximumActive = 0;
    let call = 0;
    const generate = jest.fn(async () => {
      const currentCall = ++call;
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      return {
        ...candidate(),
        stemText: `기업이 ${currentCall}번째 직무를 분석하였다.`,
      };
    });

    const result = await new AiQuestionGenerationService({ generate }).generate(
      [
        blueprint('blueprint-1'),
        blueprint('blueprint-2'),
        blueprint('blueprint-3'),
      ],
    );

    expect(result.accepted).toHaveLength(3);
    expect(maximumActive).toBeGreaterThan(1);
    expect(maximumActive).toBeLessThanOrEqual(3);
  });

  it('passes source-anchor validation failures into the next repair attempt', async () => {
    const anchored = {
      ...blueprint('blueprint-1'),
      sourceFactAnchors: ['42%'],
    };
    const generate = jest
      .fn()
      .mockResolvedValueOnce(candidate())
      .mockResolvedValueOnce({
        stemText: '기업의 취업률은 42%로 조사되었다.',
        explanationText: '직무 분석은 직무에 필요한 능력을 파악하는 것이다.',
      });
    const service = new AiQuestionGenerationService({ generate });

    const result = await service.generate([anchored]);

    expect(result.accepted).toHaveLength(1);
    expect(generate.mock.calls[1]?.[3]).toEqual({
      failureReason: 'source fact anchor missing: 42%',
      requiredAnchors: ['42%'],
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

  it('uses a later certified blueprint when the first source is exhausted', async () => {
    const generate = jest
      .fn()
      .mockRejectedValueOnce(new Error('source-1 unavailable'))
      .mockRejectedValueOnce(new Error('source-1 unavailable'))
      .mockRejectedValueOnce(new Error('source-1 unavailable'))
      .mockResolvedValueOnce(candidate('직무 분석'));
    const service = new AiQuestionGenerationService({ generate });

    const result = await service.generate(
      [blueprint('source-1'), blueprint('source-2', '직무 분석')],
      undefined,
      1,
    );

    expect(result.accepted).toHaveLength(1);
    expect(result.accepted[0]?.blueprint.id).toBe('source-2');
    expect(result.requestedCount).toBe(1);
    // Workers may already have claimed the next blueprint before the first one succeeds.
    expect(generate.mock.calls.length).toBeGreaterThanOrEqual(4);
  });

  it('rejects a final question fingerprint used by a previous AI exam', async () => {
    const first = await new AiQuestionGenerationService({
      generate: jest.fn().mockResolvedValue(candidate()),
    }).generate([blueprint('blueprint-1')]);
    const generate = jest.fn().mockResolvedValue(candidate());

    const result = await new AiQuestionGenerationService({ generate }).generate(
      [blueprint('blueprint-2')],
      undefined,
      1,
      undefined,
      undefined,
      undefined,
      [first.accepted[0]!.fingerprint],
      [
        aiQuestionStructuralFingerprint(
          first.accepted[0]!.blueprint,
          first.accepted[0]!.candidate,
        ),
      ],
    );

    expect(result.accepted).toEqual([]);
    expect(result.rejectionsByCode).toEqual({ AI_DUPLICATE_REJECTED: 3 });
  });
});
