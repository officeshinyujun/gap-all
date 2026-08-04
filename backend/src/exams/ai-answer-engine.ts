import type { AiQuestionBlueprint } from './ai-blueprint.types';

export type AiDerivedAnswer = Readonly<{
  optionsList: readonly string[];
  correctAnswer: 1 | 2 | 3 | 4 | 5;
}>;

const CHOICE_LABELS = ['①', '②', '③', '④', '⑤'] as const;

/**
 * Server-owned answer engine for Tier 1 single-selection blueprints.
 * Provider output is intentionally not an input to this function.
 */
export function deriveAiAnswer(
  blueprint: AiQuestionBlueprint,
): AiDerivedAnswer | null {
  if (
    blueprint.answerIndex < 1 ||
    blueprint.answerIndex > 5 ||
    blueprint.distractorConcepts.length !== 4
  ) {
    return null;
  }
  const concepts = [blueprint.targetConcept, ...blueprint.distractorConcepts];
  if (new Set(concepts).size !== 5) return null;

  const answerOffset = blueprint.answerIndex - 1;
  const orderedConcepts = [
    ...blueprint.distractorConcepts.slice(0, answerOffset),
    blueprint.targetConcept,
    ...blueprint.distractorConcepts.slice(answerOffset),
  ];
  const subject =
    blueprint.template === 'TPL_CONVERSATIONAL_FLOW'
      ? '이 대화는'
      : '이 사례는';
  const polarity = blueprint.sourceArchetype?.polarity ?? 'positive';
  return {
    optionsList: orderedConcepts.map(
      (concept, index) =>
        `${CHOICE_LABELS[index]} ${subject} ${concept}의 핵심 조건에 ${
          polarity === 'negative' ? '부합하지 않는다' : '부합한다'
        }.`,
    ),
    correctAnswer: blueprint.answerIndex,
  };
}
