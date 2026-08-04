import { Difficulty } from '../entities/exam-record.entity';
import type { AiQuestionBlueprint } from './ai-blueprint.types';
import { materializeAiQuestion } from './ai-question-materializer';
import { validateAiQuestion } from './ai-question-validator';
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

function questionAndCandidate() {
  const candidate = {
    stemText: '기업이 직무에 필요한 능력을 조사하였다.',
    explanationText: '직무 분석은 직무에 필요한 능력을 파악하는 것이다.',
  };
  const result = materializeAiQuestion(blueprint, candidate);
  if (result.kind === 'rejected') throw new Error(result.message);
  return { candidate, question: result.question };
}

describe('validateAiQuestion', () => {
  it('accepts a canonical question whose answer and renderer are server-valid', () => {
    const { candidate, question } = questionAndCandidate();

    expect(validateAiQuestion(blueprint, candidate, question)).toEqual({
      passed: true,
      validatorVersion: 'v2',
    });
  });

  it('rejects a candidate that omits a deterministic source fact anchor', () => {
    const anchoredBlueprint = {
      ...blueprint,
      sourceFactAnchors: ['42%'],
    };
    const candidate = {
      stemText: '기업이 직무 수행에 필요한 능력을 조사하였다.',
      explanationText: '직무 분석은 직무에 필요한 능력을 파악하는 것이다.',
    };
    const materialized = materializeAiQuestion(anchoredBlueprint, candidate);
    if (materialized.kind === 'rejected') throw new Error(materialized.message);

    expect(
      validateAiQuestion(anchoredBlueprint, candidate, materialized.question),
    ).toEqual({
      passed: false,
      validatorVersion: 'v2',
      failureCode: 'AI_INVARIANT_MISMATCH',
    });
  });

  it('rejects a candidate that gives away the target concept in the situation', () => {
    const { question } = questionAndCandidate();
    const candidate = {
      stemText: '직무 분석을 실시하였다.',
      explanationText: '직무 분석은 직무에 필요한 능력을 파악하는 것이다.',
    };

    expect(validateAiQuestion(blueprint, candidate, question)).toEqual({
      passed: false,
      validatorVersion: 'v2',
      failureCode: 'AI_INVARIANT_MISMATCH',
    });
  });

  it('rejects an explanation that does not support the server answer', () => {
    const candidate = {
      stemText: '기업이 직무에 필요한 능력을 조사하였다.',
      explanationText: '이 설명은 정답 근거를 제공하지 않는다.',
    };
    const materialized = materializeAiQuestion(blueprint, candidate);
    if (materialized.kind === 'rejected') throw new Error(materialized.message);

    expect(
      validateAiQuestion(blueprint, candidate, materialized.question),
    ).toEqual({
      passed: false,
      validatorVersion: 'v2',
      failureCode: 'AI_EXPLANATION_MISMATCH',
    });
  });

  it('accepts a renderer-valid conversation candidate with fixed turns', () => {
    const classified = classifyReferenceArchetype({
      stem: '다음 대화에 대한 설명으로 옳은 것은?',
      stimulus: '교사: 조건을 확인해 보자.\n학생: 네, 사례를 검토하겠습니다.',
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
    const candidate = {
      stemText: '조건을 확인해 보자.\n네, 사례를 검토하겠습니다.',
      messages: [
        { speakerId: 'speaker-1', text: '조건을 확인해 보자.' },
        { speakerId: 'speaker-2', text: '네, 사례를 검토하겠습니다.' },
      ],
      explanationText: '직무 분석은 직무에 필요한 조건을 파악하는 것이다.',
    };
    const materialized = materializeAiQuestion(
      conversationBlueprint,
      candidate,
    );
    if (materialized.kind === 'rejected') throw new Error(materialized.message);

    expect(
      validateAiQuestion(
        conversationBlueprint,
        candidate,
        materialized.question,
      ),
    ).toEqual({ passed: true, validatorVersion: 'v2' });
  });
});
