import { Difficulty } from '../entities/exam-record.entity';
import type { AiQuestionBlueprint } from './ai-blueprint.types';
import { materializeAiQuestion } from './ai-question-materializer';
import { classifyReferenceArchetype } from './reference-archetype';

const blueprint: AiQuestionBlueprint = {
  id: 'blueprint-1',
  family: 'case',
  subjectId: 'subject-1',
  unitNumber: 1,
  targetConcept: '직무 분석',
  template: 'TPL_CASE_DIAGNOSTIC_FRAME',
  invariantFacts: [],
  mutableSlots: [],
  answerRule: { id: 'answer-v1', description: 'server' },
  answerIndex: 1,
  distractorRule: { id: 'distractor-v1', description: 'server' },
  distractorConcepts: ['직업 윤리', '직업 훈련', '인사 평가', '경력 개발'],
  difficulty: Difficulty.MIDDLE,
  sourceEvidence: [{ sourceId: 'source-1', sourceHash: 'hash', unitNumber: 1 }],
  blueprintVersion: 'v1',
};

describe('materializeAiQuestion', () => {
  it('constructs choices, answer, and stimulus DTO on the server', () => {
    const result = materializeAiQuestion(blueprint, {
      stemText: '기업이 직무에 필요한 능력을 조사하였다.',
      explanationText: '직무 분석은 직무에 필요한 능력을 파악하는 것이다.',
    });

    expect(result).toEqual(
      expect.objectContaining({
        kind: 'accepted',
        question: expect.objectContaining({
          correctAnswer: 1,
          optionsList: [
            '① 직무 분석',
            '② 직업 윤리',
            '③ 직업 훈련',
            '④ 인사 평가',
            '⑤ 경력 개발',
          ],
        }),
      }),
    );
  });

  it('preserves a certified case archetype and emits complete parallel choices', () => {
    const classified = classifyReferenceArchetype({
      stem: '다음 사례에 대한 설명으로 옳은 것은?',
      stimulus: 'A씨는 직무에 필요한 능력을 분석하였다.',
      viewItems: [],
      choices: ['① 하나', '② 둘', '③ 셋', '④ 넷', '⑤ 다섯'],
      targetConcepts: ['직무 분석'],
    });
    if (classified.kind !== 'classified') throw new Error('invalid fixture');

    const result = materializeAiQuestion(
      { ...blueprint, sourceArchetype: classified.value },
      {
        stemText: '기업이 직무에 필요한 능력을 조사하였다.',
        explanationText: '직무 분석은 직무에 필요한 능력을 파악하는 것이다.',
      },
    );

    if (result.kind === 'rejected') throw new Error(result.message);
    expect(result.question.questionStem).toBe(
      '다음 사례에 대한 설명으로 옳은 것은?',
    );
    expect(result.question.optionsList).toEqual([
      '① 이 사례는 직무 분석의 핵심 조건에 부합한다.',
      '② 이 사례는 직업 윤리의 핵심 조건에 부합한다.',
      '③ 이 사례는 직업 훈련의 핵심 조건에 부합한다.',
      '④ 이 사례는 인사 평가의 핵심 조건에 부합한다.',
      '⑤ 이 사례는 경력 개발의 핵심 조건에 부합한다.',
    ]);
  });

  it('materializes a conversation with fixed participants and message order', () => {
    const classified = classifyReferenceArchetype({
      stem: '다음 대화에 대한 설명으로 옳은 것은?',
      stimulus: '교사: 조건을 확인해 보자.\n학생: 네, 사례를 검토하겠습니다.',
      viewItems: [],
      choices: ['① 하나', '② 둘', '③ 셋', '④ 넷', '⑤ 다섯'],
      targetConcepts: ['직무 분석'],
    });
    if (classified.kind !== 'classified') throw new Error('invalid fixture');

    const result = materializeAiQuestion(
      {
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
      },
      {
        stemText: '조건을 확인해 보자.\n네, 사례를 검토하겠습니다.',
        messages: [
          { speakerId: 'speaker-1', text: '조건을 확인해 보자.' },
          { speakerId: 'speaker-2', text: '네, 사례를 검토하겠습니다.' },
        ],
        explanationText: '직무 분석의 조건을 대화에서 확인한다.',
      },
    );

    if (result.kind === 'rejected') throw new Error(result.message);
    expect(result.question.recommendedTemplate).toBe('TPL_CONVERSATIONAL_FLOW');
    expect(result.question.stimulusData).toEqual(
      expect.objectContaining({
        scene_kind: 'dialogue',
        messages: [
          expect.objectContaining({ p_id: 'speaker-1', timestamp: '1' }),
          expect.objectContaining({ p_id: 'speaker-2', timestamp: '2' }),
        ],
      }),
    );
    expect(result.question.optionsList?.[0]).toContain('이 대화는');
  });

  it('rejects an incomplete distractor plan instead of inventing options', () => {
    const result = materializeAiQuestion(
      { ...blueprint, distractorConcepts: ['직업 윤리'] },
      { stemText: '상황', explanationText: '설명' },
    );

    expect(result).toEqual({
      kind: 'rejected',
      code: 'AI_DISTRACTOR_INVALID',
      message: '정확히 네 개의 검증된 오답 개념이 필요합니다.',
    });
  });
});
