import { Difficulty } from '../entities/exam-record.entity';
import type { AiQuestionBlueprint } from './ai-blueprint.types';
import { createAiChoiceFocuses } from './ai-blueprint.types';
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
      validatorVersion: 'v3',
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
      validatorVersion: 'v3',
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
      validatorVersion: 'v3',
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
      validatorVersion: 'v3',
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
    ).toEqual({ passed: true, validatorVersion: 'v3' });
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
      validatorVersion: 'v3',
      failureCode: 'AI_ANSWER_RULE_MISMATCH',
      message: 'provider answer choice does not satisfy target concept',
    });
  });

  it('rejects generic provider choices for a grounded single-selection blueprint', () => {
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
    const candidate = {
      stemText: '근로자 A씨는 만 18세에 기업에서 인사 담당자로 근무하며 신규 직무에 필요한 능력과 작업 조건을 분석하였다.',
      choiceTexts: [
        '① 이 사례는 직무 분석의 핵심 조건에 부합한다.',
        '② 이 사례는 직업 윤리의 핵심 조건에 부합한다.',
        '③ 이 사례는 직업 훈련의 핵심 조건에 부합한다.',
        '④ 이 사례는 인사 평가의 핵심 조건에 부합한다.',
        '⑤ 이 사례는 경력 개발의 핵심 조건에 부합한다.',
      ],
      explanationText: '직무 분석은 만 18세에 직무에 필요한 능력을 조사한 행위와 관련된다.',
    };
    const materialized = materializeAiQuestion(focusedBlueprint, candidate);
    if (materialized.kind === 'rejected') throw new Error(materialized.message);

    expect(validateAiQuestion(focusedBlueprint, candidate, materialized.question)).toEqual({
      passed: false,
      validatorVersion: 'v3',
      failureCode: 'AI_DISTRACTOR_INVALID',
      message: 'provider choice is generic instead of cue-based',
    });
  });

  it('does not materialize generic fallback choices for grounded blueprints', () => {
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

    expect(
      materializeAiQuestion(focusedBlueprint, {
        stemText: 'A씨는 만 18세에 직무에 필요한 능력을 분석하였다.',
        explanationText: '직무 분석은 직무 수행 조건을 파악하는 것이다.',
      }),
    ).toEqual({
      kind: 'rejected',
      code: 'AI_DISTRACTOR_INVALID',
      message: '단서 기반 선택지 5개가 필요합니다.',
    });
  });

  it('accepts choices that bind each concept to a concrete source cue', () => {
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
    const candidate = {
      stemText: '근로자 A씨는 만 18세에 기업에서 인사 담당자로 근무하며 신규 직무의 능력과 작업 조건을 분석하였다.',
      choiceTexts: [
        '이 사례는 A씨가 만 18세에 신규 직무의 능력과 작업 조건을 분석한 행위이므로 직무 분석에 해당한다.',
        '이 사례는 A씨가 만 18세에 신규 직무의 윤리 기준을 준수했는지를 판단한 행위이므로 직업 윤리와 관련된다.',
        '이 사례는 A씨가 만 18세에 신규 직무 교육을 실시한 사실이므로 직업 훈련의 판단 단서가 된다.',
        '이 사례는 A씨가 만 18세에 신규 직무의 성과를 평가한 결과이므로 인사 평가와 관련된다.',
        '이 사례는 A씨가 만 18세에 신규 직무의 경력 계획을 세운 과정이므로 경력 개발을 뜻한다.',
      ],
      explanationText: '직무 분석은 만 18세인 A씨가 신규 직무에 필요한 능력과 작업 조건을 분석한 행위에 해당한다.',
    };
    const materialized = materializeAiQuestion(focusedBlueprint, candidate);
    if (materialized.kind === 'rejected') throw new Error(materialized.message);

    expect(validateAiQuestion(focusedBlueprint, candidate, materialized.question)).toEqual({
      passed: true,
      validatorVersion: 'v3',
    });
  });

  it('rejects an abstract case narrative that cannot determine the options', () => {
    const classified = classifyReferenceArchetype({
      stem: '다음 사례에 대한 설명으로 옳은 것은?',
      stimulus: 'A씨는 직무에 필요한 능력을 분석하였다.',
      viewItems: [],
      choices: ['① 하나', '② 둘', '③ 셋', '④ 넷', '⑤ 다섯'],
      targetConcepts: ['직무 분석'],
    });
    if (classified.kind !== 'classified') throw new Error('invalid fixture');
    const concreteBlueprint = {
      ...blueprint,
      sourceArchetype: classified.value,
    };
    const candidate = {
      stemText:
        '한 가지 직업에 얽매이기보다 재능과 의미를 느끼는 일을 수행하며 삶의 균형과 활력을 얻는 사례가 제시되었다.',
      explanationText: '직무 분석은 직무에 필요한 능력을 파악하는 것이다.',
    };
    const materialized = materializeAiQuestion(concreteBlueprint, candidate);
    if (materialized.kind === 'rejected') throw new Error(materialized.message);

    expect(validateAiQuestion(concreteBlueprint, candidate, materialized.question)).toEqual({
      passed: false,
      validatorVersion: 'v3',
      failureCode: 'AI_INVARIANT_MISMATCH',
      message:
        'case narrative is too vague; include an actor, an action, and a concrete condition',
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
      validatorVersion: 'v3',
      failureCode: 'AI_CANDIDATE_SCHEMA_INVALID',
      message: 'provider slot metadata does not match certified source shape',
    });
  });
});
