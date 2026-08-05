import { Difficulty } from '../entities/exam-record.entity';
import type { AiQuestionBlueprint } from './ai-blueprint.types';
import { deriveAiAnswer } from './ai-answer-engine';
import { classifyReferenceArchetype } from './reference-archetype';

const blueprint: AiQuestionBlueprint = {
  id: 'blueprint-answer-engine',
  family: 'case',
  subjectId: 'subject-1',
  unitNumber: 1,
  targetConcept: '직무 분석',
  template: 'TPL_CASE_DIAGNOSTIC_FRAME',
  invariantFacts: [],
  mutableSlots: [],
  answerRule: { id: 'concept-match-v1', description: 'server' },
  answerIndex: 3,
  distractorRule: { id: 'concept-boundary-v1', description: 'server' },
  distractorConcepts: ['직업 윤리', '직업 훈련', '인사 평가', '경력 개발'],
  difficulty: Difficulty.MIDDLE,
  sourceEvidence: [],
  blueprintVersion: 'v1',
};

describe('deriveAiAnswer', () => {
  it('places the server-owned correct concept at the server-owned answer index', () => {
    expect(deriveAiAnswer(blueprint)).toEqual({
      correctAnswer: 3,
      optionsList: [
        '① 이 사례는 직업 윤리의 핵심 조건에 부합한다.',
        '② 이 사례는 직업 훈련의 핵심 조건에 부합한다.',
        '③ 이 사례는 직무 분석의 핵심 조건에 부합한다.',
        '④ 이 사례는 인사 평가의 핵심 조건에 부합한다.',
        '⑤ 이 사례는 경력 개발의 핵심 조건에 부합한다.',
      ],
    });
  });

  it('fails closed when the distractor plan is not five unique concepts', () => {
    expect(
      deriveAiAnswer({ ...blueprint, distractorConcepts: ['직업 윤리'] }),
    ).toBeNull();
  });

  it('preserves certified ㄱㄴㄷ choice encoding for combination TPLs', () => {
    const classified = classifyReferenceArchetype({
      stem: '다음 자료에 대한 설명으로 옳은 것은?',
      stimulus: 'ㄱ. 첫째 조건\nㄴ. 둘째 조건\nㄷ. 셋째 조건',
      viewItems: ['ㄱ. 첫째 조건', 'ㄴ. 둘째 조건', 'ㄷ. 셋째 조건'],
      choices: ['① ㄱ', '② ㄴ', '③ ㄱ, ㄴ', '④ ㄴ, ㄷ', '⑤ ㄱ, ㄴ, ㄷ'],
      targetConcepts: ['직무 분석'],
    });
    if (classified.kind !== 'classified') throw new Error('invalid fixture');

    expect(
      deriveAiAnswer({
        ...blueprint,
        sourceArchetype: classified.value,
        sourceChoiceTexts: [
          '① ㄱ',
          '② ㄴ',
          '③ ㄱ, ㄴ',
          '④ ㄴ, ㄷ',
          '⑤ ㄱ, ㄴ, ㄷ',
        ],
      }),
    ).toEqual({
      correctAnswer: 3,
      optionsList: ['① ㄱ', '② ㄴ', '③ ㄱ, ㄴ', '④ ㄴ, ㄷ', '⑤ ㄱ, ㄴ, ㄷ'],
    });
  });
});
