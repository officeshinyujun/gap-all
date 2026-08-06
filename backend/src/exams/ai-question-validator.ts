import type {
  AiGenerationValidationResult,
  AiQuestionBlueprint,
  AiQuestionCandidate,
} from './ai-blueprint.types';
import type { AiMaterializedQuestion } from './ai-question-materializer';
import { deriveAiAnswer } from './ai-answer-engine';
import { validateSimplyReferenceStructuredTpl } from './simply-reference-generation-contract';
import type { StructuredTplName } from './tpl-schemas';

export const AI_QUESTION_VALIDATOR_VERSION = 'v2' as const;

export function validateAiQuestion(
  blueprint: AiQuestionBlueprint,
  candidate: AiQuestionCandidate,
  question: AiMaterializedQuestion,
): AiGenerationValidationResult {
  const blueprintShapeError = validateBlueprintShape(blueprint);
  if (blueprintShapeError !== null) {
    return failed('AI_CANDIDATE_SCHEMA_INVALID', blueprintShapeError);
  }
  if (
    candidate.stemText.trim() === '' ||
    candidate.explanationText.trim() === ''
  ) {
    return failed('AI_CANDIDATE_SCHEMA_INVALID', 'empty candidate text');
  }
  const candidateText = [
    candidate.stemText,
    ...(candidate.messageTexts ?? []),
    ...(candidate.cellTexts ?? []),
    ...(candidate.paragraphTexts ?? []),
    ...(candidate.detailTexts ?? []),
    ...(candidate.stepTexts ?? []),
    ...(candidate.forumTexts ?? []),
    ...(candidate.sceneTexts ?? []),
    ...(candidate.promotionTexts ?? []),
    ...(candidate.incidentTexts ?? []),
    ...(candidate.reportTexts ?? []),
    ...(candidate.numericTexts ?? []),
  ].join('\n');
  const normalizedCandidateText = normalizeFactText(candidateText);
  if (
    (blueprint.sourceFactAnchors ?? []).some(
      (anchor) => !normalizedCandidateText.includes(normalizeFactText(anchor)),
    )
  ) {
    const missing = (blueprint.sourceFactAnchors ?? []).filter(
      (anchor) => !normalizedCandidateText.includes(normalizeFactText(anchor)),
    );
    return failed(
      'AI_INVARIANT_MISMATCH',
      `source fact anchor missing: ${missing.join(', ')}`,
    );
  }
  if (question.optionsList.length !== 5) {
    return failed('AI_DISTRACTOR_INVALID', 'choice count is not five');
  }
  if (
    candidate.choiceTexts !== undefined &&
    (new Set(candidate.choiceTexts.map((choice) => choice.normalize('NFKC').trim())).size !== 5 ||
      candidate.choiceTexts.some((choice) => choice.trim().length < 8))
  ) {
    return failed('AI_DISTRACTOR_INVALID', 'provider choices are empty or duplicated');
  }
  if (candidate.choiceTexts !== undefined) {
    const answerChoice = candidate.choiceTexts[blueprint.answerIndex - 1] ?? '';
    const normalizedAnswerChoice = normalizeFactText(answerChoice);
    if (!normalizedAnswerChoice.includes(normalizeFactText(blueprint.targetConcept))) {
      return failed('AI_ANSWER_RULE_MISMATCH', 'provider answer choice does not satisfy target concept');
    }
    const polarity = blueprint.sourceArchetype?.polarity ?? 'positive';
    const polaritySignals = polarity === 'negative'
      ? ['부합하지', '옳지', '아닌', '아니다', '않']
      : ['부합', '옳', '맞', '적절', '해당'];
    if (!polaritySignals.some((signal) => answerChoice.includes(signal))) {
      return failed('AI_ANSWER_RULE_MISMATCH', 'provider answer choice polarity conflicts with blueprint');
    }
  }
  if (
    question.difficulty !==
    (['LOW', 'MIDDLE', 'HIGH', 'INTERGRATE'].includes(blueprint.difficulty)
      ? blueprint.difficulty
      : 'MIDDLE')
  ) {
    return failed('AI_INVARIANT_MISMATCH', 'difficulty mismatch');
  }
  const derivedAnswer = deriveAiAnswer(blueprint);
  if (
    derivedAnswer === null ||
    question.correctAnswer !== derivedAnswer.correctAnswer ||
    (candidate.choiceTexts === undefined && blueprint.sourceArchetype !== undefined &&
      JSON.stringify(question.optionsList) !==
        JSON.stringify(derivedAnswer.optionsList))
  ) {
    return failed('AI_ANSWER_RULE_MISMATCH', 'server answer derivation mismatch');
  }
  if (new Set(question.optionsList).size !== 5) {
    return failed('AI_DISTRACTOR_INVALID', 'duplicate choices');
  }
  const archetype = blueprint.sourceArchetype;
  const isTruthCombination =
    archetype?.stemIntent === 'truth_combination' ||
    archetype?.responseMode === 'truth_combination';
  if (
    archetype !== undefined &&
    !isTruthCombination &&
      candidate.choiceTexts === undefined &&
    (question.recommendedTemplate !== archetype.sourceTemplate ||
      archetype.responseMode !== 'single_selection' ||
      archetype.choiceTopology !== 'single_choice')
  ) {
    return failed('AI_INVARIANT_MISMATCH', 'template or response mode mismatch');
  }
  if (
    archetype !== undefined &&
    !isTruthCombination &&
    candidate.choiceTexts === undefined &&
      question.questionStem !==
      (archetype.stemIntent === 'negative_single_selection'
        ? question.recommendedTemplate === 'TPL_CASE_DIAGNOSTIC_FRAME'
          ? '다음 사례에 대한 설명으로 옳지 않은 것은?'
          : '다음 자료에 대한 설명으로 옳지 않은 것은?'
        : question.recommendedTemplate === 'TPL_CASE_DIAGNOSTIC_FRAME'
          ? '다음 사례에 대한 설명으로 옳은 것은?'
          : '다음 자료에 대한 설명으로 옳은 것은?')
  ) {
    return failed('AI_INVARIANT_MISMATCH', 'stem polarity mismatch');
  }
  if (
    archetype !== undefined &&
    !isTruthCombination &&
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
    return failed('AI_DISTRACTOR_INVALID', 'choice statement shape mismatch');
  }
  if (question.correctAnswer !== blueprint.answerIndex) {
    return failed('AI_ANSWER_RULE_MISMATCH', 'answer index mismatch');
  }
  // ponytail: truth_combination choices are set labels (① ㄱ,ㄴ), not concept sentences.
  // The answer engine validates correctness; we skip the concept-name-in-choice check.
  if (!isTruthCombination && !question.optionsList[blueprint.answerIndex - 1]?.includes(blueprint.targetConcept)) {
    return failed('AI_ANSWER_RULE_MISMATCH', 'answer choice does not contain target concept');
  }
  if (
    !validateSimplyReferenceStructuredTpl(
      question.recommendedTemplate,
      question.stimulusData,
    )
  ) {
    return failed('AI_RENDER_REJECTED', 'TPL renderer contract rejected stimulus');
  }
  if (!sourceFactsArePreserved(blueprint, question.stimulusData)) {
    return failed('AI_INVARIANT_MISMATCH', 'source fact anchor missing from materialized stimulus');
  }
  const conversationMessages = question.stimulusData.messages;
  const candidateMessageTexts = candidate.messageTexts;
  if (
      question.recommendedTemplate === 'TPL_CONVERSATIONAL_FLOW'
      ? !Array.isArray(conversationMessages) ||
        (candidateMessageTexts !== undefined && conversationMessages.length !== candidateMessageTexts.length) ||
        (candidateMessageTexts !== undefined && conversationMessages.some((message, index) => {
          if (typeof message !== 'object' || message === null) return true;
          const record = message as Record<string, unknown>;
          return record.text !== candidateMessageTexts[index];
        }))
      : !isSourcePreservingTemplate(question.recommendedTemplate) &&
          !candidateMatchesStimulus(question.stimulusData, candidate) ||
        question.explanation.judgment !== candidate.explanationText
  ) {
    return failed('AI_INVARIANT_MISMATCH', 'candidate text does not match materialized stimulus');
  }
  if (question.explanation.judgment !== candidate.explanationText) {
    return failed('AI_INVARIANT_MISMATCH', 'explanation differs from candidate');
  }
  if (!question.explanation.judgment.includes(blueprint.targetConcept)) {
    return failed('AI_EXPLANATION_MISMATCH', 'explanation does not mention target concept');
  }
  // ponytail: target-term leakage lowers difficulty but does not invalidate the
  // server-derived answer; keep the item rather than exhausting a valid source.
  return {
    passed: true,
    validatorVersion: AI_QUESTION_VALIDATOR_VERSION,
  };
}

function normalizeFactText(value: string): string {
  return value.normalize('NFKC').replace(/\s+/gu, '');
}

function sourceFactsArePreserved(
  blueprint: AiQuestionBlueprint,
  stimulus: Record<string, unknown>,
): boolean {
  const sourceText = JSON.stringify(stimulus) ?? '';
  const normalized = normalizeFactText(sourceText);
  return (blueprint.sourceFactAnchors ?? []).every((anchor) =>
    normalized.includes(normalizeFactText(anchor)),
  );
}

function validateBlueprintShape(blueprint: AiQuestionBlueprint): string | null {
  if (blueprint.answerRule.id.trim() === '' || blueprint.answerRule.description.trim() === '') {
    return 'answer rule is incomplete';
  }
  if (!Number.isInteger(blueprint.answerIndex) || blueprint.answerIndex < 1 || blueprint.answerIndex > 5) {
    return 'answer index is outside the five-choice contract';
  }
  const lines = (blueprint.caseContext ?? '').split(/\n+/u).map((line) => line.trim()).filter(Boolean);
  let expected: number | null = null;
  switch (blueprint.template) {
    case 'TPL_CONVERSATIONAL_FLOW': {
      const contract = blueprint.conversationContract;
      if (contract === undefined || contract.speakerSequence.length < 2) return 'conversation contract is incomplete';
      const participantIds = new Set(contract.participants.map((participant) => participant.id));
      if (participantIds.size !== contract.participants.length || contract.speakerSequence.some((id) => !participantIds.has(id))) {
        return 'conversation speaker contract is invalid';
      }
      expected = contract.speakerSequence.length;
      break;
    }
    case 'TPL_COMPARATIVE_MATRIX': {
      const tableLines = lines.filter((line) => line.includes('|'));
      if (tableLines.length < 2) return 'matrix source shape is incomplete';
      const split = (line: string) => line.split('|').map((cell) => cell.trim()).filter(Boolean);
      const headers = split(tableLines[0] ?? '');
      const rows = tableLines.slice(1).filter((line) => !/^\|?\s*:?-+:?/u.test(line)).map(split);
      if (headers.length === 0 || rows.length === 0 || rows.some((row) => row.length !== headers.length)) return 'matrix row shape is invalid';
      expected = rows.reduce((count, row) => count + row.length, 0);
      break;
    }
    case 'TPL_FORMAL_DOCUMENT':
    case 'TPL_ARTICLE':
    case 'TPL_ANNOUNCEMENT':
    case 'TPL_SEQUENTIAL_WORKFLOW':
      expected = lines.length;
      if (expected === 0) return 'structured source slots are empty';
      break;
    default:
      break;
  }
  if (expected !== null && blueprint.providerSlotCount !== expected) {
    return 'provider slot metadata does not match certified source shape';
  }
  return null;
}

function isSourcePreservingTemplate(template: StructuredTplName): boolean {
  return [
    'TPL_DIGITAL_FORUM_INTERFACE',
    'TPL_INSTRUCTIONAL_SCENE',
    'TPL_PROMOTIONAL_CANVAS',
    'TPL_INCIDENT_REPORT',
    'TPL_REPORT',
    'TPL_QUANTITATIVE_CHART',
    'TPL_STATISTICS',
  ].includes(template);
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
  message?: string,
): AiGenerationValidationResult {
  return {
    passed: false,
    validatorVersion: AI_QUESTION_VALIDATOR_VERSION,
    failureCode,
    message,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
