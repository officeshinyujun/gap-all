import type { AiQuestionBlueprint } from './ai-blueprint.types';
import { isReferenceCombinationChoiceSet } from './reference-archetype';

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

  if (blueprint.sourceArchetype?.choiceEncoding === 'truth_combination') {
    const sourceChoices = blueprint.sourceChoiceTexts;
    if (
      sourceChoices === undefined ||
      sourceChoices.length !== 5 ||
      !isReferenceCombinationChoiceSet(sourceChoices)
    ) {
      return null;
    }
    return {
      optionsList: sourceChoices,
      correctAnswer: blueprint.answerIndex,
    };
  }

  const answerOffset = blueprint.answerIndex - 1;
  const orderedConcepts = [
    ...blueprint.distractorConcepts.slice(0, answerOffset),
    blueprint.targetConcept,
    ...blueprint.distractorConcepts.slice(answerOffset),
  ];
  const subject =
    blueprint.template === 'TPL_CONVERSATIONAL_FLOW'
      ? '이 대화는'
      : blueprint.template === 'TPL_CASE_DIAGNOSTIC_FRAME'
        ? '이 사례는'
        : '이 자료는';
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
