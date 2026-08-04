import type {
  AiGenerationValidationResult,
  AiQuestionBlueprint,
  AiQuestionCandidate,
} from './ai-blueprint.types';
import type { AiMaterializedQuestion } from './ai-question-materializer';
import { deriveAiAnswer } from './ai-answer-engine';
import { validateSimplyReferenceStructuredTpl } from './simply-reference-generation-contract';

export const AI_QUESTION_VALIDATOR_VERSION = 'v2' as const;

export function validateAiQuestion(
  blueprint: AiQuestionBlueprint,
  candidate: AiQuestionCandidate,
  question: AiMaterializedQuestion,
): AiGenerationValidationResult {
  if (
    candidate.stemText.trim() === '' ||
    candidate.explanationText.trim() === ''
  ) {
    return failed('AI_CANDIDATE_SCHEMA_INVALID');
  }
  if (
    (blueprint.sourceFactAnchors ?? []).some(
      (anchor) => !candidate.stemText.includes(anchor),
    )
  ) {
    return failed('AI_INVARIANT_MISMATCH');
  }
  if (question.optionsList.length !== 5) {
    return failed('AI_DISTRACTOR_INVALID');
  }
  if (
    question.difficulty !==
    (['LOW', 'MIDDLE', 'HIGH', 'INTERGRATE'].includes(blueprint.difficulty)
      ? blueprint.difficulty
      : 'MIDDLE')
  ) {
    return failed('AI_INVARIANT_MISMATCH');
  }
  const derivedAnswer = deriveAiAnswer(blueprint);
  if (
    derivedAnswer === null ||
    question.correctAnswer !== derivedAnswer.correctAnswer ||
    (blueprint.sourceArchetype !== undefined &&
      JSON.stringify(question.optionsList) !==
        JSON.stringify(derivedAnswer.optionsList))
  ) {
    return failed('AI_ANSWER_RULE_MISMATCH');
  }
  if (new Set(question.optionsList).size !== 5) {
    return failed('AI_DISTRACTOR_INVALID');
  }
  const archetype = blueprint.sourceArchetype;
  if (
    archetype !== undefined &&
    (question.recommendedTemplate !== archetype.sourceTemplate ||
      archetype.responseMode !== 'single_selection' ||
      archetype.choiceTopology !== 'single_choice')
  ) {
    return failed('AI_INVARIANT_MISMATCH');
  }
  if (
    archetype !== undefined &&
    question.questionStem !==
      (archetype.stemIntent === 'negative_single_selection'
        ? '다음 사례에 대한 설명으로 옳지 않은 것은?'
        : '다음 사례에 대한 설명으로 옳은 것은?')
  ) {
    return failed('AI_INVARIANT_MISMATCH');
  }
  if (
    archetype !== undefined &&
    question.optionsList.some(
      (option) =>
        !option.includes(
          question.recommendedTemplate === 'TPL_CONVERSATIONAL_FLOW'
            ? '이 대화는'
            : '이 사례는',
        ),
    )
  ) {
    return failed('AI_DISTRACTOR_INVALID');
  }
  if (question.correctAnswer !== blueprint.answerIndex) {
    return failed('AI_ANSWER_RULE_MISMATCH');
  }
  if (
    !question.optionsList[blueprint.answerIndex - 1]?.includes(
      blueprint.targetConcept,
    )
  ) {
    return failed('AI_ANSWER_RULE_MISMATCH');
  }
  if (
    !validateSimplyReferenceStructuredTpl(
      question.recommendedTemplate,
      question.stimulusData,
    )
  ) {
    return failed('AI_RENDER_REJECTED');
  }
  const conversationMessages = question.stimulusData.messages;
  const candidateMessages = candidate.messages;
  if (
    question.recommendedTemplate === 'TPL_CONVERSATIONAL_FLOW'
      ? !Array.isArray(conversationMessages) ||
        candidateMessages === undefined ||
        conversationMessages.length !== candidateMessages.length ||
        conversationMessages.some((message, index) => {
          if (typeof message !== 'object' || message === null) return true;
          const record = message as Record<string, unknown>;
          return (
            record.p_id !== candidateMessages[index]?.speakerId ||
            record.text !== candidateMessages[index]?.text
          );
        })
      : question.stimulusData.narrative !== candidate.stemText ||
        question.explanation.judgment !== candidate.explanationText
  ) {
    return failed('AI_INVARIANT_MISMATCH');
  }
  if (question.explanation.judgment !== candidate.explanationText) {
    return failed('AI_INVARIANT_MISMATCH');
  }
  if (!question.explanation.judgment.includes(blueprint.targetConcept)) {
    return failed('AI_EXPLANATION_MISMATCH');
  }
  if (candidate.stemText.includes(blueprint.targetConcept)) {
    return failed('AI_INVARIANT_MISMATCH');
  }
  return {
    passed: true,
    validatorVersion: AI_QUESTION_VALIDATOR_VERSION,
  };
}

function failed(
  failureCode: Extract<
    NonNullable<AiGenerationValidationResult['failureCode']>,
    | 'AI_CANDIDATE_SCHEMA_INVALID'
    | 'AI_DISTRACTOR_INVALID'
    | 'AI_ANSWER_RULE_MISMATCH'
    | 'AI_RENDER_REJECTED'
    | 'AI_INVARIANT_MISMATCH'
    | 'AI_EXPLANATION_MISMATCH'
  >,
): AiGenerationValidationResult {
  return {
    passed: false,
    validatorVersion: AI_QUESTION_VALIDATOR_VERSION,
    failureCode,
  };
}
