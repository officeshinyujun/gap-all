import { Difficulty } from '../entities/exam-record.entity';
import type { AiQuestionBlueprint, AiQuestionCandidate } from './ai-blueprint.types';
import { materializeAiQuestion } from './ai-question-materializer';
import { validateAiQuestion } from './ai-question-validator';

const choices = [
  '직무 분석에 부합하는 첫 번째 자료 해석 문장입니다.',
  '두 번째 자료 해석 문장입니다.',
  '세 번째 자료 해석 문장입니다.',
  '네 번째 자료 해석 문장입니다.',
  '다섯 번째 자료 해석 문장입니다.',
];

const base: AiQuestionBlueprint = {
  id: 'textual-blueprint',
  family: 'case',
  subjectId: 'subject-1',
  unitNumber: 2,
  targetConcept: '직무 분석',
  template: 'TPL_ARTICLE',
  caseContext: '원문 첫째 사실\n원문 둘째 사실',
  providerSlotCount: 2,
  sourceFactAnchors: ['원문 첫째 사실'],
  invariantFacts: [],
  mutableSlots: [],
  answerRule: { id: 'answer-v1', description: 'server-owned answer index' },
  answerIndex: 1,
  distractorRule: { id: 'distractor-v1', description: 'source-backed choices' },
  distractorConcepts: ['직업 윤리', '직업 훈련', '인사 평가', '경력 개발'],
  difficulty: Difficulty.MIDDLE,
  sourceEvidence: [{ sourceId: 'source-1', sourceHash: 'hash', unitNumber: 2 }],
  blueprintVersion: 'v3',
};

function candidate(template: AiQuestionBlueprint['template']): AiQuestionCandidate {
  const slot =
    template === 'TPL_ANNOUNCEMENT'
      ? { detailTexts: ['원문 첫째 사실', '원문 둘째 사실'] }
      : template === 'TPL_SEQUENTIAL_WORKFLOW'
        ? { stepTexts: ['원문 첫째 사실', '원문 둘째 사실'] }
        : { paragraphTexts: ['원문 첫째 사실', '원문 둘째 사실'] };
  return {
    stemText: '자료의 조건을 분석한다.',
    ...slot,
    choiceTexts: choices,
    explanationText: '직무 분석은 자료에 나타난 조건을 파악하는 것이다.',
  };
}

describe('textual AI TPL generation', () => {
  it.each([
    'TPL_FORMAL_DOCUMENT',
    'TPL_ARTICLE',
    'TPL_ANNOUNCEMENT',
    'TPL_SEQUENTIAL_WORKFLOW',
  ] as const)('materializes and validates %s without provider-owned answers', (template) => {
    const blueprint = { ...base, template };
    const provided = candidate(template);
    const materialized = materializeAiQuestion(blueprint, provided);

    expect(materialized.kind).toBe('accepted');
    if (materialized.kind === 'rejected') return;
    expect(materialized.question.correctAnswer).toBe(1);
    expect(materialized.question.stimulusData).toBeTruthy();
    expect(validateAiQuestion(blueprint, provided, materialized.question)).toEqual({
      passed: true,
      validatorVersion: 'v3',
    });
  });
});
