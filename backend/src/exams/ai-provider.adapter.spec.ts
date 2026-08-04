import {
  AiProviderAdapter,
  AiProviderError,
  buildAiCandidatePrompt,
  parseAiQuestionCandidate,
} from './ai-provider.adapter';
import type { AiQuestionBlueprint } from './ai-blueprint.types';

const blueprint: AiQuestionBlueprint = {
  id: 'blueprint-1',
  family: 'case',
  subjectId: 'subject-1',
  unitNumber: 1,
  targetConcept: '직무 분석',
  template: 'TPL_CASE_DIAGNOSTIC_FRAME',
  invariantFacts: [{ id: 'fact-1', description: '필수 조건' }],
  mutableSlots: [{ name: 'actor', kind: 'text' }],
  answerRule: { id: 'answer-v1', description: '서버가 정답을 계산한다.' },
  answerIndex: 1,
  distractorRule: { id: 'distractor-v1', description: '인접 개념' },
  distractorConcepts: ['직업 윤리', '직업 훈련', '인사 평가', '경력 개발'],
  difficulty: 'MIDDLE',
  sourceEvidence: [
    { sourceId: 'source-1', sourceHash: 'hash-1', unitNumber: 1 },
  ],
  blueprintVersion: 'v1',
};

describe('AiProviderAdapter', () => {
  it('accepts only the two minimal candidate fields', () => {
    expect(
      parseAiQuestionCandidate(
        JSON.stringify({
          stemText: '한 기업이 직무에 필요한 능력을 분석하였다.',
          explanationText:
            '직무 분석은 직무 수행에 필요한 능력을 파악하는 과정이다.',
        }),
      ),
    ).toEqual({
      stemText: '한 기업이 직무에 필요한 능력을 분석하였다.',
      explanationText:
        '직무 분석은 직무 수행에 필요한 능력을 파악하는 과정이다.',
    });
  });

  it('accepts conversation text while keeping speakers and order server-owned', () => {
    const conversationBlueprint: AiQuestionBlueprint = {
      ...blueprint,
      template: 'TPL_CONVERSATIONAL_FLOW',
      conversationContract: {
        participants: [
          { id: 'speaker-1', name: '교사', role: '교사' },
          { id: 'speaker-2', name: '학생', role: '학생' },
        ],
        speakerSequence: ['speaker-1', 'speaker-2'],
        sceneKind: 'dialogue',
      },
    };

    expect(
      parseAiQuestionCandidate(
        JSON.stringify({
          messageTexts: ['조건을 확인해 보자.', '네, 사례를 검토하겠습니다.'],
          explanationText: '대화의 조건을 기준으로 판단한다.',
        }),
        conversationBlueprint,
      ),
    ).toEqual({
      stemText: '조건을 확인해 보자.\n네, 사례를 검토하겠습니다.',
      messageTexts: ['조건을 확인해 보자.', '네, 사례를 검토하겠습니다.'],
      explanationText: '대화의 조건을 기준으로 판단한다.',
    });
  });

  it('rejects the legacy speaker-bearing conversation shape', () => {
    const conversationBlueprint: AiQuestionBlueprint = {
      ...blueprint,
      template: 'TPL_CONVERSATIONAL_FLOW',
      conversationContract: {
        participants: [{ id: 'speaker-1', name: '교사', role: '교사' }],
        speakerSequence: ['speaker-1'],
        sceneKind: 'dialogue',
      },
    };

    expect(() =>
      parseAiQuestionCandidate(
        JSON.stringify({
          messages: [{ speakerId: 'speaker-1', text: '조건을 확인하자.' }],
          explanationText: '설명',
        }),
        conversationBlueprint,
      ),
    ).toThrow(AiProviderError);
  });

  it('uses a template-specific slot contract for matrix candidates', () => {
    expect(
      parseAiQuestionCandidate(
        JSON.stringify({
          cellTexts: ['조건 A', '조건 B'],
          explanationText: '표의 각 셀은 원문 조건을 보존한다.',
        }),
        { ...blueprint, template: 'TPL_COMPARATIVE_MATRIX' },
      ),
    ).toEqual({
      stemText: '조건 A\n조건 B',
      cellTexts: ['조건 A', '조건 B'],
      explanationText: '표의 각 셀은 원문 조건을 보존한다.',
    });
  });

  it('rejects provider attempts to return answer or choices', () => {
    expect(() =>
      parseAiQuestionCandidate(
        JSON.stringify({
          stemText: '상황',
          explanationText: '설명',
          correctAnswer: 1,
          options: ['①'],
        }),
      ),
    ).toThrow(AiProviderError);
  });

  it('uses a fresh bounded prompt and parses dependency output', async () => {
    const complete = jest.fn().mockResolvedValue(
      JSON.stringify({
        stemText: '기업이 직무 수행에 필요한 능력을 조사하였다.',
        explanationText: '직무 분석은 직무에 필요한 능력을 파악하는 것이다.',
      }),
    );
    const adapter = new AiProviderAdapter({ complete });

    const candidate = await adapter.generate(blueprint, 2);

    expect(candidate.stemText).toContain('직무');
    expect(complete).toHaveBeenCalledWith(
      expect.stringContaining('"promptVersion":"v2"'),
      expect.any(AbortSignal),
      expect.objectContaining({ type: 'json_schema' }),
    );
    expect(buildAiCandidatePrompt(blueprint, 2)).not.toContain('correctAnswer');
  });

  it('aborts a provider call at the configured timeout', async () => {
    const previousTimeout = process.env.AI_BLUEPRINT_PROVIDER_TIMEOUT_MS;
    process.env.AI_BLUEPRINT_PROVIDER_TIMEOUT_MS = '1';
    const complete = jest.fn(
      (_prompt: string, signal: AbortSignal) =>
        new Promise<string>((_resolve, reject) => {
          signal.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );

    try {
      const adapter = new AiProviderAdapter({ complete });
      await expect(adapter.generate(blueprint, 1)).rejects.toMatchObject({
        code: 'AI_PROVIDER_TIMEOUT',
      });
    } finally {
      if (previousTimeout === undefined) {
        delete process.env.AI_BLUEPRINT_PROVIDER_TIMEOUT_MS;
      } else {
        process.env.AI_BLUEPRINT_PROVIDER_TIMEOUT_MS = previousTimeout;
      }
    }
  });
});
