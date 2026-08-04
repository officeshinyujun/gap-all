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
        ? question.recommendedTemplate === 'TPL_CASE_DIAGNOSTIC_FRAME'
          ? '다음 사례에 대한 설명으로 옳지 않은 것은?'
          : '다음 자료에 대한 설명으로 옳지 않은 것은?'
        : question.recommendedTemplate === 'TPL_CASE_DIAGNOSTIC_FRAME'
          ? '다음 사례에 대한 설명으로 옳은 것은?'
          : '다음 자료에 대한 설명으로 옳은 것은?')
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
            : question.recommendedTemplate === 'TPL_CASE_DIAGNOSTIC_FRAME'
              ? '이 사례는'
              : '이 자료는',
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
  const candidateMessageTexts = candidate.messageTexts;
  if (
    question.recommendedTemplate === 'TPL_CONVERSATIONAL_FLOW'
      ? !Array.isArray(conversationMessages) ||
        candidateMessageTexts === undefined ||
        conversationMessages.length !== candidateMessageTexts.length ||
        conversationMessages.some((message, index) => {
          if (typeof message !== 'object' || message === null) return true;
          const record = message as Record<string, unknown>;
          return record.text !== candidateMessageTexts[index];
        })
      : !candidateMatchesStimulus(question.stimulusData, candidate) ||
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

function candidateMatchesStimulus(
  stimulus: Record<string, unknown>,
  candidate: AiQuestionCandidate,
): boolean {
  if (typeof stimulus.narrative === 'string') return stimulus.narrative === candidate.stemText;
  if (Array.isArray(stimulus.rows)) {
    const cells = stimulus.rows.flatMap((row) =>
      isRecord(row) && Array.isArray(row.cells) ? row.cells : [],
    );
    return (
      candidate.cellTexts !== undefined &&
      cells.length === candidate.cellTexts.length &&
      cells.every((cell, index) => cell === candidate.cellTexts?.[index])
    );
  }
  if (Array.isArray(stimulus.paragraphs)) {
    const contents = stimulus.paragraphs.map((paragraph) =>
      isRecord(paragraph) ? paragraph.content : undefined,
    );
    return (
      candidate.paragraphTexts !== undefined &&
      contents.length === candidate.paragraphTexts.length &&
      contents.every((content, index) => content === candidate.paragraphTexts?.[index])
    );
  }
  if (Array.isArray(stimulus.body_paragraphs)) {
    return (
      candidate.paragraphTexts !== undefined &&
      stimulus.body_paragraphs.length === candidate.paragraphTexts.length &&
      stimulus.body_paragraphs.every(
        (content, index) => content === candidate.paragraphTexts?.[index],
      )
    );
  }
  if (Array.isArray(stimulus.details)) {
    const contents = stimulus.details.map((detail) =>
      isRecord(detail) ? detail.content : undefined,
    );
    return (
      candidate.detailTexts !== undefined &&
      contents.length === candidate.detailTexts.length &&
      contents.every((content, index) => content === candidate.detailTexts?.[index])
    );
  }
  if (Array.isArray(stimulus.steps)) {
    const descriptions = stimulus.steps.map((step) =>
      isRecord(step) ? step.desc : undefined,
    );
    return (
      candidate.stepTexts !== undefined &&
      descriptions.length === candidate.stepTexts.length &&
      descriptions.every((desc, index) => desc === candidate.stepTexts?.[index])
    );
  }
  return false;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
