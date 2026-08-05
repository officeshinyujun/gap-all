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
      message: 'source fact anchor missing: 42%',
    });
  });

  it('keeps a valid candidate even when the target term appears in the situation', () => {
    const candidate = {
      stemText: '직무 분석을 실시하였다.',
      explanationText: '직무 분석은 직무에 필요한 능력을 파악하는 것이다.',
    };
    const materialized = materializeAiQuestion(blueprint, candidate);
    if (materialized.kind === 'rejected') throw new Error(materialized.message);

    expect(validateAiQuestion(blueprint, candidate, materialized.question)).toEqual({
      passed: true,
      validatorVersion: 'v2',
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
      message: 'explanation does not mention target concept',
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
      providerSlotCount: 2,
    };
    const candidate = {
      stemText: '조건을 확인해 보자.\n네, 사례를 검토하겠습니다.',
      messageTexts: ['조건을 확인해 보자.', '네, 사례를 검토하겠습니다.'],
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

  it('rejects provider choices that cannot satisfy the server answer rule', () => {
    const providerBlueprint = { ...blueprint, providerSlotCount: undefined };
    const candidate = {
      stemText: '기업이 직무에 필요한 능력을 조사하였다.',
      choiceTexts: ['첫 번째 판단 문장입니다.', '둘째 판단 문장입니다.', '셋째 판단 문장입니다.', '넷째 판단 문장입니다.', '다섯째 판단 문장입니다.'],
      explanationText: '직무 분석은 직무에 필요한 능력을 파악하는 것이다.',
    };
    const materialized = materializeAiQuestion(providerBlueprint, candidate);
    if (materialized.kind === 'rejected') throw new Error(materialized.message);

    expect(validateAiQuestion(providerBlueprint, candidate, materialized.question)).toEqual({
      passed: false,
      validatorVersion: 'v2',
      failureCode: 'AI_ANSWER_RULE_MISMATCH',
      message: 'provider answer choice does not satisfy target concept',
    });
  });

  it('rejects structured blueprints with missing slot metadata', () => {
    const structuredBlueprint = {
      ...blueprint,
      template: 'TPL_ARTICLE' as const,
      caseContext: '첫째 사실\n둘째 사실',
    };
    const candidate = {
      stemText: '자료의 조건을 분석한다.',
      paragraphTexts: ['첫째 사실', '둘째 사실'],
      explanationText: '직무 분석은 자료의 조건을 파악하는 것이다.',
    };
    const materialized = materializeAiQuestion(structuredBlueprint, candidate);
    if (materialized.kind === 'rejected') throw new Error(materialized.message);

    expect(validateAiQuestion(structuredBlueprint, candidate, materialized.question)).toEqual({
      passed: false,
      validatorVersion: 'v2',
      failureCode: 'AI_CANDIDATE_SCHEMA_INVALID',
      message: 'provider slot metadata does not match certified source shape',
    });
  });
});
