import {
  AiProviderAdapter,
  AiProviderError,
  buildAiCandidatePrompt,
  parseAiReferenceAnalysis,
  parseAiQuestionCandidate,
  aiCandidateResponseFormat,
  aiModelForRole,
} from './ai-provider.adapter';
import type { AiQuestionBlueprint } from './ai-blueprint.types';
import { createAiChoiceFocuses } from './ai-blueprint.types';
import { classifyReferenceArchetype } from './reference-archetype';

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
  it('accepts a bounded source analysis contract', () => {
    expect(
      parseAiReferenceAnalysis(
        JSON.stringify({
          stemIntent: '사례의 조건을 비교해 판단한다.',
          reasoningPattern: '조건 비교',
          invariantFacts: [{ id: 'fact-1', description: '정답 조건' }],
          mutableSlots: [{ name: 'actor', kind: 'text', allowedValues: null }],
          answerRule: { id: 'answer-1', description: '조건을 모두 만족한다.' },
          distractorRules: ['인접 개념을 혼동한다.'],
          stimulusRequired: true,
        }),
      ).stimulusRequired,
    ).toBe(true);
  });

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

  it('accepts source-backed conversation choices as bounded prose', () => {
    const classified = classifyReferenceArchetype({
      stem: '다음 대화에 대한 설명으로 옳은 것은?',
      stimulus: '교사: 조건을 확인하자.\n학생: 사례를 검토하겠습니다.',
      viewItems: [],
      choices: ['① 하나', '② 둘', '③ 셋', '④ 넷', '⑤ 다섯'],
      targetConcepts: ['직무 분석'],
    });
    if (classified.kind !== 'classified') throw new Error('invalid fixture');
    const conversationBlueprint: AiQuestionBlueprint = {
      ...blueprint,
      template: 'TPL_CONVERSATIONAL_FLOW',
      sourceArchetype: classified.value,
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
          messageTexts: ['조건을 확인하자.', '사례를 검토하겠습니다.'],
          choiceTexts: ['첫 번째 판단 문장입니다.', '두 번째 판단 문장입니다.', '세 번째 판단 문장입니다.', '네 번째 판단 문장입니다.', '다섯 번째 판단 문장입니다.'],
          explanationText: '대화의 조건을 기준으로 판단한다.',
        }),
        conversationBlueprint,
      ),
    ).toEqual(expect.objectContaining({ choiceTexts: expect.any(Array) }));
  });

  it('falls back to server-owned choices when a source-backed provider omits choice prose', () => {
    const classified = classifyReferenceArchetype({
      stem: '다음 사례에 대한 설명으로 옳은 것은?',
      stimulus: '기업이 직무를 분석하였다.',
      viewItems: [],
      choices: ['① 하나', '② 둘', '③ 셋', '④ 넷', '⑤ 다섯'],
      targetConcepts: ['직무 분석'],
    });
    if (classified.kind !== 'classified') throw new Error('invalid fixture');
    const result = parseAiQuestionCandidate(
      JSON.stringify({
        stemText: '기업이 필요한 업무 능력을 조사하였다.',
        explanationText: '직무 분석은 업무 능력을 파악하는 것이다.',
      }),
      { ...blueprint, sourceArchetype: classified.value },
    );
    expect(result.choiceTexts).toBeUndefined();
    expect(result.stemText).toContain('업무 능력');
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
       expect.stringContaining('"promptVersion":"v3"'),
      expect.any(AbortSignal),
      expect.objectContaining({ type: 'json_schema' }),
    );
    expect(buildAiCandidatePrompt(blueprint, 2)).not.toContain('correctAnswer');
  });

  it('uses role-specific models and preserves the injected dependency contract', async () => {
    const complete = jest.fn().mockResolvedValue({
      content: JSON.stringify({
        stemText: '기업이 직무 수행에 필요한 능력을 조사하였다.',
        explanationText: '직무 분석은 직무에 필요한 능력을 파악하는 것이다.',
      }),
      model: 'live-candidate-model',
    });
    const adapter = new AiProviderAdapter({ complete });

    const candidate = await adapter.generate(blueprint, 1);

    expect(candidate.telemetry?.model).toBe('live-candidate-model');
    expect(aiModelForRole('analysis', {
      OPENAI_AI_ANALYSIS_MODEL: 'analysis-model',
    })).toBe('analysis-model');
    expect(aiModelForRole('repair', {
      OPENAI_AI_REPAIR_MODEL: 'repair-model',
    })).toBe('repair-model');
  });

  it('includes the validation reason and required anchors in a repair prompt', () => {
    const prompt = buildAiCandidatePrompt(blueprint, 2, {
      failureReason: 'source fact anchor missing: 42%',
      requiredAnchors: ['42%'],
    });

    expect(prompt).toContain('source fact anchor missing: 42%');
    expect(prompt).toContain('42%');
  });

  it('includes source-grounded choice focuses in the candidate prompt', () => {
    const classified = classifyReferenceArchetype({
      stem: '다음 사례에 대한 설명으로 옳은 것은?',
      stimulus: 'A씨는 만 18세에 직무에 필요한 능력을 분석하였다.',
      viewItems: [],
      choices: ['① 하나', '② 둘', '③ 셋', '④ 넷', '⑤ 다섯'],
      targetConcepts: ['직무 분석'],
    });
    if (classified.kind !== 'classified') throw new Error('invalid fixture');
    const focusedBlueprint = {
      ...blueprint,
      sourceArchetype: classified.value,
      choiceFocuses: createAiChoiceFocuses(
        blueprint.targetConcept,
        blueprint.distractorConcepts,
        1,
        ['만 18세'],
        'A씨는 만 18세에 직무에 필요한 능력을 분석하였다.',
      ),
    };

    const prompt = buildAiCandidatePrompt(focusedBlueprint, 1);

    expect(prompt).toContain('choiceFocuses');
    expect(prompt).toContain('개념명만 바꾼 generic 문장');
    expect(prompt).toContain('만 18세');
  });

  it('keeps truth-combination structured slots server-owned', () => {
    const truthBlueprint: AiQuestionBlueprint = {
      ...blueprint,
      template: 'TPL_COMPARATIVE_MATRIX',
      providerSlotCount: 2,
      sourceArchetype: {
        sourceTemplate: 'TPL_COMPARATIVE_MATRIX',
        responseMode: 'truth_combination',
        choiceTopology: 'combo_sets',
        stemIntent: 'truth_combination',
        choiceEncoding: 'truth_combination',
      } as never,
    };

    expect(
      parseAiQuestionCandidate(
        JSON.stringify({
          stemText: '원문 조건을 보존한 자료다.',
          explanationText: '자료의 조건을 기준으로 판단한다.',
        }),
        truthBlueprint,
      ),
    ).toEqual({
      stemText: '원문 조건을 보존한 자료다.',
      explanationText: '자료의 조건을 기준으로 판단한다.',
    });
    expect(
      aiCandidateResponseFormat(truthBlueprint).json_schema.schema.properties,
    ).not.toHaveProperty('cellTexts');
  });

  it('analyzes a reference with a strict shared contract', async () => {
    const complete = jest.fn().mockResolvedValue(
      JSON.stringify({
        stemIntent: '사례의 조건을 비교한다.',
        reasoningPattern: '조건 비교',
        invariantFacts: [{ id: 'fact-1', description: '정답 조건' }],
        mutableSlots: [{ name: 'actor', kind: 'text', allowedValues: null }],
        answerRule: { id: 'answer-1', description: '조건 일치' },
        distractorRules: ['인접 개념 혼동'],
        stimulusRequired: true,
      }),
    );
    const adapter = new AiProviderAdapter({ complete });

    const analysis = await adapter.analyzeReference({ sourceId: 'source-1' });

    expect(analysis.stimulusRequired).toBe(true);
    expect(complete).toHaveBeenCalledWith(
      expect.stringContaining('"promptVersion":"v1"'),
      expect.any(AbortSignal),
      expect.objectContaining({ type: 'json_schema' }),
    );
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
