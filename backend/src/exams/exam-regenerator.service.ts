import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import OpenAI from 'openai';
import { Difficulty } from '../entities/exam-record.entity';
import {
  type ExamGenerationProgressReporter,
  FALLBACK_KEYWORDS,
  TEXTBOOK_BASE,
} from './exam-generation.utils';
import {
  type ConceptPayload,
  type ReferenceFrame,
  type SourceIdentity,
} from './reference-frame.types';
import {
  CANONICAL_TPL_BY_INFORMATION_SHAPE,
  selectReferenceTpl,
} from './reference-tpl-selector';
import {
  referenceFinalGenerationModel,
  referenceVerificationModel,
} from './reference-generation-model';
import { isRecord } from './reference-frame.validation-utils';
import { StimulusNormalizer } from './stimulus-normalizer';
import {
  getTplSchema,
  isStructuredTplName,
  type StructuredTplName,
} from './tpl-schemas';
import { referenceFinalOutputSchema } from './reference-final-output-schema';
import {
  ReferenceJobDeadlineAdmissionError,
  ReferenceJobDeadlineExceededError,
  type ReferenceJobDeadline,
} from './reference-job-deadline';
import type { ReferenceCatalogConcept } from './reference-frame-planner.types';
import { isReferenceCombinationChoiceSet } from './reference-archetype';
import { validateReferenceArchetypeFidelity } from './reference-generation-output-validator';
import { repairReferenceVariantOutput } from './reference-variant-repair';
import {
  buildReferenceFidelitySpec,
  type ReferenceFidelitySpec,
} from './reference-fidelity-spec';
import {
  type ReferenceCopyPolicyMatch,
  validateReferenceCopyPolicy,
  validateReferenceDensity,
} from './reference-fidelity-validator';
import { parseReferenceVariantSemanticVerdict } from './reference-variant-semantic-verifier';
import {
  matrixGroundingTerms,
  validateReferenceFactGrounding,
} from './reference-fact-grounding';
import {
  deriveInterviewSceneKind,
  parseConversationForStorage,
} from './interview-scene';

const OPENAI_TIMEOUT_MS = Number(process.env.OPENAI_TIMEOUT_MS) || 180_000;
const MAX_REFERENCE_FINAL_ATTEMPTS = 3;
const MAX_REFERENCE_COPY_REPAIR_ATTEMPTS = 4;

export type ReferenceGenerationRequestOptions = Readonly<{
  signal?: AbortSignal;
}>;

type ReferenceGenerationChatRequest = Readonly<{
  model: string;
  messages: readonly Readonly<{
    role: 'system' | 'user';
    content: string;
  }>[];
  response_format:
    | Readonly<{ type: 'json_object' }>
    | Readonly<{
        type: 'json_schema';
        json_schema: Readonly<{
          name: string;
          strict: true;
          schema: Record<string, unknown>;
        }>;
      }>;
  temperature: number;
}>;

export type ReferenceGenerationCompletion = Readonly<{
  choices: readonly Readonly<{
    message: Readonly<{ content: string | null }>;
  }>[];
}>;

export type ReferenceGenerationClient = Readonly<{
  chat: Readonly<{
    completions: Readonly<{
      create: (
        request: ReferenceGenerationChatRequest,
        options?: ReferenceGenerationRequestOptions,
      ) => Promise<ReferenceGenerationCompletion>;
    }>;
  }>;
}>;

type ReferenceVariantReference = Readonly<{
  source: SourceIdentity;
  stem: string;
  stimulus: string;
  viewItems: readonly string[];
  choices: readonly string[];
  targetConcepts?: readonly string[];
}>;

export type ReferenceVariantGenerationRequest = Readonly<{
  reference: ReferenceVariantReference;
  frame: ReferenceFrame;
  payload: ConceptPayload;
  catalogConcepts: readonly ReferenceCatalogConcept[];
  selectedTemplate: StructuredTplName;
  fidelitySpec?: ReferenceFidelitySpec;
  execution?: ReferenceVariantGenerationExecution;
}>;

export type ReferenceVariantGenerationExecution = Readonly<{
  deadline?: ReferenceJobDeadline;
  reportProgress?: ExamGenerationProgressReporter;
  completed: number;
  total: number;
}>;

async function reportReferenceMilestone(
  execution: ReferenceVariantGenerationExecution | undefined,
  stage: 'fidelity' | 'final',
  progress: number,
  attempt: number,
): Promise<void> {
  const reportProgress = execution?.reportProgress;
  if (execution === undefined || reportProgress === undefined) return;
  await reportProgress({
    stage,
    progress,
    message: '참조 프레임 문항 생성 진행 중',
    status: 'info',
    completed: execution.completed,
    total: execution.total,
    attempt,
    maxAttempts: MAX_REFERENCE_COPY_REPAIR_ATTEMPTS,
  });
}

type ComboBlock = Readonly<{
  title: string;
  items: readonly Readonly<{ key: string; text: string }>[];
}>;

export type ReferenceVariantGenerationResult = Readonly<{
  metadata: Readonly<{
    unit_name: string;
    target_concept: string;
    item_type: 'reference_variant';
    difficulty: Difficulty;
    recommended_template: StructuredTplName;
  }>;
  render_ready: Readonly<{
    question_stem: string;
    stimulus_data: Record<string, unknown>;
    options_list: readonly string[];
    combo_block: ComboBlock | null;
  }>;
  explanation: Readonly<{ judgment: string }>;
  correct_answer: number;
  dna_contract: null;
  validationReceipt?: Readonly<{
    deterministic: 'passed';
    copyPolicy: 'passed';
    semanticVerifier: Readonly<{
      model: string;
      verdict: 'accepted';
      reasonCode: string;
    }>;
    retryCount: number;
  }>;
}>;

function sourceFreeArchetypeProjection(
  request: ReferenceVariantGenerationRequest,
) {
  const { archetype } = request.frame;
  return {
    materialKind: archetype.materialKind,
    shell: archetype.shell,
    register: {
      materialKind: archetype.materialKind,
      reasoningPattern: archetype.reasoningPattern,
      choiceTopology: archetype.choiceTopology,
      shell: archetype.shell,
    },
    response: request.frame.response,
    evidenceBlocks: request.frame.structureBlueprint.evidenceBlocks.map(
      (block, index) => ({ order: index + 1, ...block }),
    ),
    conceptRoles: {
      cardinality: archetype.conceptRoleCardinality,
      targetConceptIds: request.payload.targetConceptIds,
      supportingConceptIds: request.payload.supportingConceptIds,
    },
    distractorTransformations: request.payload.distractorAxes,
    informationOrder: request.frame.structureBlueprint.informationUnits,
    reasoningPattern: archetype.reasoningPattern,
    reasoningSteps: request.frame.structureBlueprint.reasoningSteps,
    combinationPlan: archetype.combinationPlan,
    setStructure: archetype.setStructure,
    viewItems: archetype.viewKeys.map((key, index) => ({
      order: index + 1,
      key,
    })),
    optionSubsets: request.payload.answerPlan.options,
  };
}

function buildRequestFidelitySpec(
  request: ReferenceVariantGenerationRequest,
): ReferenceFidelitySpec {
  const sourceTargetConcept =
    request.reference.targetConcepts !== undefined &&
    request.reference.targetConcepts.length > 0
      ? request.reference.targetConcepts[0]
      : request.catalogConcepts
          .filter(({ id }) => request.payload.targetConceptIds.includes(id))
          .map(({ canonicalLabel }) => canonicalLabel)[0];
  const targetConcepts =
    sourceTargetConcept === undefined ? [] : [sourceTargetConcept];
  return buildReferenceFidelitySpec(
    {
      ...request.reference,
      targetConcepts,
    },
    request.frame.archetype,
    {
      structureBlueprint: request.frame.structureBlueprint,
      answerPlan: request.payload.answerPlan,
      targetConceptIds: request.payload.targetConceptIds,
      allowedTerminology: targetConcepts,
    },
  );
}

function promptFidelityContract(
  request: ReferenceVariantGenerationRequest,
): Omit<ReferenceFidelitySpec, 'protectedSourceSegments'> {
  const { protectedSourceSegments, ...contract } =
    request.fidelitySpec ?? buildRequestFidelitySpec(request);
  void protectedSourceSegments;
  return contract;
}

type ReferenceVariantRejectionReason =
  | 'TEMPLATE_MISMATCH'
  | 'INVALID_STIMULUS_DATA'
  | 'INVALID_QUESTION_STEM'
  | 'INVALID_CHOICES'
  | 'INVALID_CORRECT_ANSWER'
  | 'INVALID_EXPLANATION'
  | 'INVALID_COMBO_BLOCK'
  | 'INVALID_CHOICE_MARKERS'
  | 'INVALID_CHOICE_TOPOLOGY'
  | 'ANSWER_ENCODING_MISMATCH'
  | 'ARCHETYPE_FIDELITY_MISMATCH'
  | 'TPL_SELECTION_REJECTED'
  | 'INVALID_CONVERSATION'
  | 'UNRENDERABLE_TEMPLATE_DATA'
  | 'MATRIX_SOURCE_FACT_MISMATCH'
  | 'SOURCE_EVIDENCE_MISMATCH'
  | 'SEMANTIC_VERIFIER_MALFORMED'
  | 'SEMANTIC_VERIFIER_REJECTED'
  | 'VERBATIM_SOURCE_SEGMENT'
  | 'INSUFFICIENT_STIMULUS_DENSITY'
  | 'EXCESSIVE_STIMULUS_DENSITY';

type ReferenceVariantTransformResult =
  | Readonly<{ kind: 'accepted'; value: ReferenceVariantGenerationResult }>
  | Readonly<{
      kind: 'rejected';
      reason: ReferenceVariantRejectionReason;
      detail?: string;
      copyRepair?: readonly Readonly<{
        field: 'questionStem' | 'stimulusData' | 'comboBlock' | 'choices';
        matches: readonly ReferenceCopyPolicyMatch[];
      }>[];
    }>;

type ReferenceCopyRepairRequest = Readonly<{
  previousCandidate: unknown;
  fields: NonNullable<
    Extract<ReferenceVariantTransformResult, { kind: 'rejected' }>['copyRepair']
  >;
}>;

function isStringList(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === 'string' && entry.trim().length > 0)
  );
}

function hasMatchingSourceEvidence(
  value: unknown,
  request: ReferenceVariantGenerationRequest,
): boolean {
  if (
    !isRecord(value) ||
    value.sourceHash !== request.reference.source.sourceHash
  )
    return false;
  const targetConceptIds = value.targetConceptIds;
  const expectedMatrixTerms = matrixGroundingTerms(request.reference);
  return (
    isStringList(targetConceptIds) &&
    targetConceptIds.length === request.payload.targetConceptIds.length &&
    targetConceptIds.every(
      (conceptId, index) =>
        conceptId === request.payload.targetConceptIds[index],
    ) &&
    hasMatchingMatrixGroundingTerms(
      value.matrixGroundingTerms,
      expectedMatrixTerms,
    )
  );
}

function hasMatchingMatrixGroundingTerms(
  reported: unknown,
  expected: readonly string[],
): boolean {
  if (expected.length === 0) {
    return (
      reported === undefined ||
      (Array.isArray(reported) && reported.length === 0)
    );
  }
  const minimumCount = Math.min(1, expected.length);
  return (
    isStringList(reported) &&
    new Set(reported).size === reported.length &&
    reported.length >= minimumCount &&
    reported.every((term) => expected.includes(term))
  );
}

function explanationJudgment(value: unknown): string | null {
  if (typeof value === 'string' && value.trim().length > 0) return value;
  if (
    isRecord(value) &&
    typeof value.judgment === 'string' &&
    value.judgment.trim().length > 0
  ) {
    return value.judgment;
  }
  return null;
}

/** 질문 stem에 언급된 인물/엔티티가 sequential workflow step desc에도 포함되어 있는지 확인 */
function sequentialWorkflowEntityCoverage(
  questionStem: string,
  steps: readonly { label?: string; desc?: string }[],
): boolean {
  const ENTITY_PATTERN =
    /(?:학생\s*[A-Za-z]|[A-Za-z]씨|갑|을|철수|영희|[A-Za-z]\s*학생)/g;
  const stemEntities = [...new Set(questionStem.match(ENTITY_PATTERN) ?? [])];
  if (stemEntities.length === 0) return true;
  const stepText = steps
    .map((s) => `${s.label ?? ''} ${s.desc ?? ''}`)
    .join(' ');
  return stemEntities.some((e) => stepText.includes(e));
}

function isSourceIdentity(value: unknown): value is SourceIdentity {
  return (
    isRecord(value) &&
    typeof value.sourceId === 'string' &&
    typeof value.sourceHash === 'string'
  );
}

function isReferenceVariantReference(
  value: unknown,
): value is ReferenceVariantReference {
  return (
    isRecord(value) &&
    isSourceIdentity(value.source) &&
    typeof value.stem === 'string' &&
    typeof value.stimulus === 'string' &&
    isStringList(value.viewItems) &&
    isStringList(value.choices)
  );
}

function isReferenceVariantGenerationRequest(
  value: unknown,
): value is ReferenceVariantGenerationRequest {
  if (!isRecord(value) || !isReferenceVariantReference(value.reference)) {
    return false;
  }
  return isStructuredTplName(value.selectedTemplate);
}

function sameSource(left: SourceIdentity, right: SourceIdentity): boolean {
  return (
    left.sourceId === right.sourceId && left.sourceHash === right.sourceHash
  );
}

function sameUnitRange(
  left: Readonly<{ start: number; end: number }>,
  right: Readonly<{ start: number; end: number }>,
): boolean {
  return left.start === right.start && left.end === right.end;
}

function isRequiredComboBlock(
  value: unknown,
  viewItemCount: number,
): value is ComboBlock | null {
  if (viewItemCount === 0) {
    return value === null;
  }
  if (
    !isRecord(value) ||
    typeof value.title !== 'string' ||
    !Array.isArray(value.items)
  ) {
    return false;
  }
  return (
    value.items.length === viewItemCount &&
    value.items.every(
      (item) =>
        isRecord(item) &&
        typeof item.key === 'string' &&
        typeof item.text === 'string' &&
        item.text.trim().length > 0,
    )
  );
}

function describeComboBlock(value: unknown): string {
  if (value === null) return 'actual=null';
  if (!isRecord(value)) return `actual_type=${typeof value}`;
  const items = value.items;
  if (!Array.isArray(items)) {
    return `actual_items_type=${typeof items}, keys=${Object.keys(value).sort().join(',')}`;
  }
  return `actual_items=${items.length}, title_type=${typeof value.title}`;
}

function referenceValidationCorrection(
  reason: ReferenceVariantRejectionReason,
  request: ReferenceVariantGenerationRequest,
  detail: string | undefined,
): string {
  if (reason === 'INVALID_COMBO_BLOCK') {
    return `The prior output was rejected because ${detail ?? 'the combo block was invalid'}. Return the same required schema with comboBlock.items containing exactly ${request.frame.response.viewItemCount} valid items.`;
  }
  if (reason === 'INVALID_CHOICE_TOPOLOGY') {
    return request.frame.response.mode === 'truth_combination'
      ? `The prior output used the wrong choice topology. Return exactly five Korean-letter combination choices for the ${request.frame.response.viewItemCount} combo items and no prose option statements.`
      : 'The prior output used Korean-letter combination choices without a combo block. Return exactly five substantive prose options grounded in the stimulus.';
  }
  if (reason === 'ANSWER_ENCODING_MISMATCH') {
    const expectedLetters = truthCombinationVerdictLetters(request);
    const expected =
      expectedLetters === null || expectedLetters.length === 0
        ? 'none'
        : expectedLetters.join(', ');
    return `The prior output has an invalid answer encoding. The expected true-statement letters are ${expected}. Provide exactly one choice encoding that set and set correctAnswer to that choice index.`;
  }
  if (reason === 'ARCHETYPE_FIDELITY_MISMATCH') {
    return `The prior output did not preserve the source-free archetype trace: ${detail ?? 'the fidelity trace was invalid'}. Correct the exact structural mismatch using only source-free identifiers; do not include reference display prose in fidelityTrace.`;
  }
  if (
    reason === 'INVALID_STIMULUS_DATA' ||
    reason === 'TPL_SELECTION_REJECTED' ||
    reason === 'INVALID_CONVERSATION' ||
    reason === 'UNRENDERABLE_TEMPLATE_DATA'
  ) {
    if (detail === 'ENTITY_COVERAGE') {
      return `The prior output's sequential workflow steps lost entity-specific information. Each step.desc MUST include the specific entities (names, actors, subjects) mentioned in the question stem. The steps cannot be generic process descriptions — they must contain the concrete details about each entity that the stem and choices reference.`;
    }
    return `The prior output had invalid stimulus data. Return templateType ${request.selectedTemplate} with stimulusData that matches this required schema exactly: ${JSON.stringify(getTplSchema(request.selectedTemplate)?.schema ?? null)}.`;
  }
  return `The prior output failed validation: ${reason}${detail === undefined ? '' : ` (${detail})`}. Return one corrected object that satisfies every requested field and constraint.`;
}

const SIBLING_OVERLAP_THRESHOLD = 0.4;
const CLAIM_LETTERS = ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ'] as const;

function normalizeForOverlap(question: Record<string, unknown>): Set<string> {
  const stemText =
    typeof question.questionStem === 'string' ? question.questionStem : '';
  const stimulusText = JSON.stringify(question.stimulusData ?? {});
  const comboText =
    isRecord(question.comboBlock) && Array.isArray(question.comboBlock.items)
      ? question.comboBlock.items
          .map((item) =>
            isRecord(item) && typeof item.text === 'string' ? item.text : '',
          )
          .join(' ')
      : '';
  const combined = `${stemText} ${stimulusText} ${comboText}`;
  const tokens = combined
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 3);
  return new Set(tokens);
}

function jaccardOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const value of a) {
    if (b.has(value)) intersection += 1;
  }
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

function hasSiblingStimulusOverlap(questions: readonly unknown[]): boolean {
  const records = questions.filter(isRecord);
  const normalized = records.map(normalizeForOverlap);
  for (let i = 0; i < normalized.length; i += 1) {
    for (let j = i + 1; j < normalized.length; j += 1) {
      const left = normalized[i];
      const right = normalized[j];
      if (left === undefined || right === undefined) continue;
      if (jaccardOverlap(left, right) >= SIBLING_OVERLAP_THRESHOLD) {
        return true;
      }
    }
  }
  return false;
}

function truthCombinationVerdictAligns(
  request: ReferenceVariantGenerationRequest,
  correctAnswer: number,
  choices: readonly string[],
): boolean {
  if (request.payload.answerPlan.choiceEncoding !== 'truth_combination') {
    return true;
  }
  const expectedLetters = truthCombinationVerdictLetters(request);
  if (expectedLetters === null) return false;
  const matchingIndexes = choices.flatMap((choice, index) =>
    choiceMatchesVerdictLetters(
      choice,
      expectedLetters,
      request.payload.answerPlan.options.length,
    )
      ? [index]
      : [],
  );
  return (
    matchingIndexes.length === 1 && matchingIndexes[0] === correctAnswer - 1
  );
}

function truthCombinationVerdictLetters(
  request: ReferenceVariantGenerationRequest,
): readonly string[] | null {
  if (request.payload.answerPlan.choiceEncoding !== 'truth_combination')
    return [];
  const letters: string[] = [];
  for (const [index, option] of request.payload.answerPlan.options.entries()) {
    const letter = CLAIM_LETTERS[index];
    if (letter === undefined) return null;
    if (option.verdict) letters.push(letter);
  }
  return letters;
}

function choiceMatchesVerdictLetters(
  choice: string,
  expectedLetters: readonly string[],
  claimCount: number,
): boolean {
  const letters = choice.match(/[ㄱ-ㅎ]/g) ?? [];
  if (new Set(letters).size !== letters.length) return false;
  const expected = new Set(expectedLetters);
  const isNoneChoice = /모두\s*아님|해당\s*없음|없음/.test(choice);
  if (isNoneChoice) {
    if (letters.length === 0) return expected.size === 0;
    const allLetters = new Set<string>(CLAIM_LETTERS.slice(0, claimCount));
    if (allLetters.size !== claimCount) return false;
    return (
      letters.length === allLetters.size - expected.size &&
      letters.every((letter) => allLetters.has(letter) && !expected.has(letter))
    );
  }
  return (
    letters.length === expected.size &&
    letters.every((letter) => expected.has(letter))
  );
}

@Injectable()
export class ExamRegeneratorService {
  private readonly logger = new Logger(ExamRegeneratorService.name);
  private readonly stimulusNormalizer = new StimulusNormalizer();

  async regenerateReferenceBatch(
    client: ReferenceGenerationClient,
    requests: readonly ReferenceVariantGenerationRequest[],
    result: ReferenceVariantGenerationResult[],
    difficulty: Difficulty,
    validationCorrection?: string,
    retryAttempt = 0,
    copyRepair?: ReferenceCopyRepairRequest,
    semanticCorrectionAttempt = 0,
  ): Promise<void> {
    if (
      requests.length === 0 ||
      requests.some(
        (request) =>
          !isReferenceVariantGenerationRequest(request) ||
          this.referenceRequestReason(request) !== null,
      )
    ) {
      this.logger.warn('[REFERENCE-REGEN] rejected invalid generation context');
      return;
    }
    const execution = requests[0]?.execution;
    try {
      const singletonRequest = requests.length === 1 ? requests[0] : undefined;
      const responseFormat: ReferenceGenerationChatRequest['response_format'] =
        singletonRequest === undefined
          ? { type: 'json_object' }
          : {
              type: 'json_schema',
              json_schema: {
                name: 'reference_final_variant',
                strict: true,
                schema: referenceFinalOutputSchema({
                  selectedTemplate: singletonRequest.selectedTemplate,
                  sourceHash: singletonRequest.reference.source.sourceHash,
                  choiceCount: singletonRequest.frame.response.choiceCount,
                  viewItemCount: singletonRequest.frame.response.viewItemCount,
                  matrixGroundingTerms: matrixGroundingTerms(
                    singletonRequest.reference,
                  ),
                  fidelityTraceRequirements: {
                    evidenceBlockCount:
                      singletonRequest.frame.structureBlueprint.evidenceBlocks
                        .length,
                    targetConceptCount:
                      singletonRequest.payload.targetConceptIds.length,
                    supportingConceptCount:
                      singletonRequest.payload.supportingConceptIds.length,
                    distractorTransformationCount:
                      singletonRequest.payload.distractorAxes.length,
                    informationUnitCount:
                      singletonRequest.frame.structureBlueprint.informationUnits
                        .length,
                    reasoningStepCount:
                      singletonRequest.frame.structureBlueprint.reasoningSteps
                        .length,
                    answerOptionCount:
                      singletonRequest.payload.answerPlan.options.length,
                    viewItemCount:
                      singletonRequest.frame.response.viewItemCount,
                  },
                }),
              },
            };
      const request: ReferenceGenerationChatRequest =
        copyRepair === undefined
          ? {
              model: referenceFinalGenerationModel(),
              messages: [
                {
                  role: 'system',
                  content:
                    'Return only one raw JSON object containing the requested structured Korean CSAT reference variants. Follow every frame, payload, and selected TPL constraint exactly. Never return TPL_PLAIN_TEXT.\n\nCRITICAL for TPL_SEQUENTIAL_WORKFLOW: Each step.desc must include entity-specific details (names, specific actions, context) from the reference source. Do NOT strip entity information — generic step descriptions alone will cause logical gaps between stimulus and question stem.',
                },
                {
                  role: 'user',
                  content: [
                    this.buildReferenceBatchRegenPrompt(requests, difficulty),
                    validationCorrection,
                  ]
                    .filter((value): value is string => value !== undefined)
                    .join('\n\nVALIDATION CORRECTION:\n'),
                },
              ],
              response_format: responseFormat,
              temperature: 0.2,
            }
          : {
              model: referenceFinalGenerationModel(),
              messages: [
                {
                  role: 'system',
                  content:
                    'Repair only copy-policy violations in a previously generated Korean CSAT question. Return one raw JSON object in the required questions wrapper.',
                },
                {
                  role: 'user',
                  content: JSON.stringify({
                    task: 'copy_policy_repair',
                    instruction:
                      'Rewrite every listed visible field so none of its reported overlap strings remain. Preserve the scenario, selected template, answer, explanation, topology, decision rule, fidelityTrace, sourceEvidence, and every unlisted field. Return the complete corrected question object.',
                    previousCandidate: copyRepair.previousCandidate,
                    fields: copyRepair.fields,
                    invariants:
                      singletonRequest === undefined
                        ? undefined
                        : {
                            selectedTemplate: singletonRequest.selectedTemplate,
                            responseMode: singletonRequest.frame.response.mode,
                            choiceCount:
                              singletonRequest.frame.response.choiceCount,
                            viewItemCount:
                              singletonRequest.frame.response.viewItemCount,
                          },
                  }),
                },
              ],
              response_format: responseFormat,
              temperature: 0,
            };
      const response = await this.createReferenceCompletion(
        client,
        request,
        execution?.deadline,
        'final_generator',
      );
      execution?.deadline?.assertActive('final_generator');
      await reportReferenceMilestone(
        execution,
        'fidelity',
        60,
        retryAttempt + 1,
      );
      const content = response.choices[0]?.message.content;
      const questions =
        content === null || content === undefined
          ? null
          : this.parseReferenceQuestions(content);
      if (questions === null || questions.length !== requests.length) {
        this.logger.warn(
          '[REFERENCE-REGEN] rejected malformed structured response',
        );
        if (requests.length === 1 && retryAttempt < 2) {
          await this.regenerateReferenceBatch(
            client,
            requests,
            result,
            difficulty,
            'The prior response was malformed. Return exactly one valid question object in the required questions wrapper.',
            retryAttempt + 1,
            undefined,
            semanticCorrectionAttempt,
          );
        }
        return;
      }
      if (hasSiblingStimulusOverlap(questions)) {
        this.logger.warn(
          '[REFERENCE-REGEN] rejected batch: sibling stimulus overlap',
        );
        return;
      }

      const acceptedResults: ReferenceVariantGenerationResult[] = [];
      for (let index = 0; index < requests.length; index += 1) {
        const request = requests[index];
        const question = questions[index];
        if (request === undefined || question === undefined) {
          return;
        }
        const transformed = this.transformReferenceQuestion(
          question,
          request,
          difficulty,
        );
        if (transformed.kind === 'rejected') {
          this.logger.warn(
            `[REFERENCE-REGEN] item ${index} rejected: ${transformed.reason}${transformed.detail === undefined ? '' : ` (${transformed.detail})`}`,
          );
          const maxAttempts =
            transformed.reason === 'VERBATIM_SOURCE_SEGMENT'
              ? MAX_REFERENCE_COPY_REPAIR_ATTEMPTS
              : MAX_REFERENCE_FINAL_ATTEMPTS;
          if (requests.length === 1 && retryAttempt + 1 < maxAttempts) {
            const nextCopyRepair =
              transformed.copyRepair === undefined
                ? undefined
                : {
                    previousCandidate: question,
                    fields: transformed.copyRepair,
                  };
            await this.regenerateReferenceBatch(
              client,
              requests,
              result,
              difficulty,
              nextCopyRepair === undefined
                ? referenceValidationCorrection(
                    transformed.reason,
                    request,
                    transformed.detail,
                  )
                : undefined,
              retryAttempt + 1,
              nextCopyRepair,
              semanticCorrectionAttempt,
            );
          }
          return;
        }
        const semanticVerdict = await this.verifyReferenceVariant(
          client,
          request,
          transformed.value,
          retryAttempt + 1,
        );
        if (semanticVerdict.kind === 'rejected') {
          this.logger.warn(
            `[REFERENCE-REGEN] item ${index} rejected: ${semanticVerdict.reason}`,
          );
          if (
            requests.length === 1 &&
            semanticVerdict.reason === 'SEMANTIC_VERIFIER_REJECTED' &&
            semanticCorrectionAttempt < 1
          ) {
            await this.regenerateReferenceBatch(
              client,
              requests,
              result,
              difficulty,
              referenceValidationCorrection(
                semanticVerdict.reason,
                request,
                semanticVerdict.reasonCode,
              ),
              retryAttempt + 1,
              undefined,
              semanticCorrectionAttempt + 1,
            );
          }
          return;
        }
        acceptedResults.push({
          ...transformed.value,
          validationReceipt: {
            deterministic: 'passed',
            copyPolicy: 'passed',
            semanticVerifier: {
              model: referenceVerificationModel(),
              verdict: 'accepted',
              reasonCode: semanticVerdict.reasonCode,
            },
            retryCount: retryAttempt,
          },
        });
      }
      result.push(...acceptedResults);
    } catch (error: unknown) {
      if (error instanceof ReferenceJobDeadlineAdmissionError) return;
      if (error instanceof ReferenceJobDeadlineExceededError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[REFERENCE-REGEN] structured request failed: ${message}`,
      );
      if (requests.length === 1 && retryAttempt < 2) {
        await this.regenerateReferenceBatch(
          client,
          requests,
          result,
          difficulty,
          'The prior request failed before producing a valid response. Return exactly one valid question object in the required questions wrapper.',
          retryAttempt + 1,
          undefined,
          semanticCorrectionAttempt,
        );
      }
    }
  }

  private async verifyReferenceVariant(
    client: ReferenceGenerationClient,
    request: ReferenceVariantGenerationRequest,
    candidate: ReferenceVariantGenerationResult,
    attempt: number,
    verifierAttempt = 0,
  ) {
    try {
      const response = await this.createReferenceCompletion(
        client,
        {
          model: referenceVerificationModel(),
          messages: [
            {
              role: 'system',
              content:
                'Verify source-faithful variant semantics. Return only JSON: {"accepted":boolean,"reasonCode":string}.',
            },
            {
              role: 'user',
              content: JSON.stringify({
                referenceSource: request.reference,
                fidelityContract:
                  request.fidelitySpec ?? buildRequestFidelitySpec(request),
                candidate,
              }),
            },
          ],
          response_format: { type: 'json_object' },
          temperature: 0,
        },
        request.execution?.deadline,
        'semantic_verifier',
      );
      request.execution?.deadline?.assertActive('semantic_verifier');
      const verdict = parseReferenceVariantSemanticVerdict(
        response.choices[0]?.message.content,
      );
      if (
        verdict.kind === 'rejected' &&
        verdict.reason === 'SEMANTIC_VERIFIER_MALFORMED' &&
        verifierAttempt < 1
      ) {
        return this.verifyReferenceVariant(
          client,
          request,
          candidate,
          attempt,
          verifierAttempt + 1,
        );
      }
      await reportReferenceMilestone(request.execution, 'final', 85, attempt);
      return verdict;
    } catch (error) {
      if (error instanceof ReferenceJobDeadlineAdmissionError) throw error;
      if (error instanceof ReferenceJobDeadlineExceededError) throw error;
      if (verifierAttempt < 1) {
        return this.verifyReferenceVariant(
          client,
          request,
          candidate,
          attempt,
          verifierAttempt + 1,
        );
      }
      return {
        kind: 'rejected',
        reason: 'SEMANTIC_VERIFIER_MALFORMED',
      } as const;
    }
  }

  private async createReferenceCompletion(
    client: ReferenceGenerationClient,
    request: ReferenceGenerationChatRequest,
    deadline: ReferenceJobDeadline | undefined,
    stage: 'final_generator' | 'semantic_verifier',
  ): Promise<ReferenceGenerationCompletion> {
    if (deadline !== undefined) {
      return deadline.runProviderCall(stage, OPENAI_TIMEOUT_MS, ({ signal }) =>
        client.chat.completions.create(request, { signal }),
      );
    }
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
    try {
      return await client.chat.completions.create(request, {
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private buildReferenceBatchRegenPrompt(
    requests: readonly ReferenceVariantGenerationRequest[],
    difficulty: Difficulty,
  ): string {
    return JSON.stringify({
      task: 'Generate faithful reference variants from the selected source, structural frame, and concept payload.',
      count: requests.length,
      difficulty,
      response: {
        wrapper: 'questions',
        exactCount: requests.length,
        questionFields: [
          'templateType',
          'questionStem',
          'stimulusData',
          'comboBlock',
          'choices',
          'correctAnswer',
          'explanation',
          'fidelityTrace',
          'sourceEvidence',
        ],
        noPlainTextFallback: true,
      },
      variants: requests.map((request) => ({
        unitRange: request.payload.unitRange,
        referenceSource: request.reference,
        fidelityContract: promptFidelityContract(request),
        archetypeProjection: sourceFreeArchetypeProjection(request),
        frame: request.frame,
        payload: request.payload,
        catalogConcepts: request.catalogConcepts,
        selectedTemplate: request.selectedTemplate,
        selectedTplSchema:
          getTplSchema(request.selectedTemplate)?.schema ?? null,
        transformationPolicy: {
          preserve: [
            'source target concept',
            'decision rule and exceptions',
            'response and choice topology',
            'material schema and source density',
          ],
          rewrite: [
            'incidental names, dates, and scenario details',
            'display prose through close paraphrase',
          ],
          prohibit: ['complete source sentences copied verbatim'],
          matrixGrounding:
            request.selectedTemplate === 'TPL_COMPARATIVE_MATRIX'
              ? {
                  required: true,
                  sourceTerms: matrixGroundingTerms(request.reference),
                  rule: 'Use source-backed labels and values in matrix headers and cells. Do not invent an unrelated comparison scenario.',
                }
              : { required: false },
        },
        structureRequirements: {
          preserve: [
            'the source concept and decision rule',
            'information order',
            'condition and exception relationships',
            'reasoning path required to answer',
            'choice and view-item logic',
          ],
          rewrite: [
            'Paraphrase closely where it preserves meaning.',
            'Do not copy complete source sentences or phrases verbatim.',
            'Change only incidental names and scenario details that are not part of the decision rule.',
          ],
        },
        conversationVisualAidPolicy:
          request.selectedTemplate === 'TPL_CONVERSATIONAL_FLOW'
            ? {
                allowed: true,
                rules: [
                  'Use only the required icon_key, scene_kind, and visual_aid schema fields.',
                  'Never emit SVG, HTML, URLs, arbitrary icon names, or free-form relation labels.',
                  'Use participant IDs already present in participants; do not add people or institutions.',
                  'Use actor_flow only when its action is supported by the indexed message evidence.',
                  'Use kind none with empty arrays when an actor flow would be decorative.',
                ],
              }
            : { allowed: false },
        requiredOutput: {
          preserveSourceArchetype: {
            stemIntent: request.frame.stem.style,
            polarity: request.frame.stem.polarity,
            responseMode: request.frame.response.mode,
            choiceEncoding: request.frame.response.choiceEncoding,
            choiceTopology:
              request.frame.response.mode === 'truth_combination'
                ? 'Korean-letter combinations only'
                : 'five substantive prose options only',
          },
          templateType: request.selectedTemplate,
          questionStem: 'non-empty string',
          choices: Array.from(
            { length: request.frame.response.choiceCount },
            (_, index) =>
              `${index + 1}번째 choice must start with ${['①', '②', '③', '④', '⑤'][index]}`,
          ),
          correctAnswer: `integer from 1 to ${request.frame.response.choiceCount}`,
          explanation: 'non-empty string',
          sourceEvidence: {
            sourceHash: request.reference.source.sourceHash,
            targetConceptIds: request.payload.targetConceptIds,
            matrixGroundingTerms:
              request.selectedTemplate === 'TPL_COMPARATIVE_MATRIX'
                ? matrixGroundingTerms(request.reference)
                : [],
          },
          fidelityTrace: {
            nonRenderedOnly: true,
            fields: [
              'shell',
              'evidenceBlocks',
              'conceptRoles',
              'distractorTransformations',
              'informationOrder',
              'reasoningPattern',
              'reasoningSteps',
              'combinationPlan',
              'setLinkage',
              'viewItems',
              'optionSubsets',
            ],
          },
          comboBlock:
            request.frame.response.viewItemCount === 0
              ? 'null'
              : {
                  title: 'non-empty string',
                  exactItemCount: request.frame.response.viewItemCount,
                  item: { key: 'string', text: 'non-empty string' },
                },
        },
      })),
    });
  }

  private parseReferenceQuestions(content: string): readonly unknown[] | null {
    try {
      const parsed: unknown = JSON.parse(content);
      return isRecord(parsed) && Array.isArray(parsed.questions)
        ? parsed.questions
        : null;
    } catch {
      return null;
    }
  }

  private transformReferenceQuestion(
    raw: unknown,
    request: ReferenceVariantGenerationRequest,
    difficulty: Difficulty,
  ): ReferenceVariantTransformResult {
    const repaired = repairReferenceVariantOutput(
      raw,
      request.frame.response.viewItemCount,
    );
    if (repaired.reasons.length > 0) {
      this.logger.debug(
        `[REFERENCE-REGEN] item repaired: ${repaired.reasons.join(',')}`,
      );
    }
    raw = repaired.value;
    if (!isRecord(raw)) {
      return {
        kind: 'rejected',
        reason: 'TEMPLATE_MISMATCH',
        detail: `raw_type=${typeof raw}`,
      };
    }
    if (raw.templateType !== request.selectedTemplate) {
      return {
        kind: 'rejected',
        reason: 'TEMPLATE_MISMATCH',
        detail: `expected=${request.selectedTemplate}, actual=${String(raw.templateType)}, keys=${Object.keys(raw).sort().join(',')}`,
      };
    }
    if (!isStructuredTplName(raw.templateType) || !isRecord(raw.stimulusData)) {
      return { kind: 'rejected', reason: 'INVALID_STIMULUS_DATA' };
    }
    if (
      raw.templateType === 'TPL_SEQUENTIAL_WORKFLOW' &&
      Array.isArray(raw.stimulusData.steps)
    ) {
      const steps = raw.stimulusData.steps as Record<string, unknown>[];
      if (
        steps.some(
          (step) =>
            typeof step.label === 'string' &&
            (step.label.trim() === '' ||
              step.label.trim() === '?' ||
              step.label.trim().length < 2),
        )
      ) {
        return { kind: 'rejected', reason: 'INVALID_STIMULUS_DATA' };
      }
      const stem = typeof raw.questionStem === 'string' ? raw.questionStem : '';
      if (stem && !sequentialWorkflowEntityCoverage(stem, steps)) {
        return {
          kind: 'rejected',
          reason: 'INVALID_STIMULUS_DATA',
          detail: 'ENTITY_COVERAGE',
        };
      }
    }
    if (!hasMatchingSourceEvidence(raw.sourceEvidence, request)) {
      return { kind: 'rejected', reason: 'SOURCE_EVIDENCE_MISMATCH' };
    }
    const questionStem = raw.questionStem;
    const choices = raw.choices;
    const correctAnswer = raw.correctAnswer;
    const explanation = explanationJudgment(raw.explanation);
    const comboBlock = raw.comboBlock;
    if (typeof questionStem !== 'string' || questionStem.trim().length === 0)
      return { kind: 'rejected', reason: 'INVALID_QUESTION_STEM' };
    if (
      !isStringList(choices) ||
      choices.length !== request.frame.response.choiceCount
    ) {
      return { kind: 'rejected', reason: 'INVALID_CHOICES' };
    }
    if (
      typeof correctAnswer !== 'number' ||
      !Number.isInteger(correctAnswer) ||
      correctAnswer < 1 ||
      correctAnswer > choices.length
    ) {
      return { kind: 'rejected', reason: 'INVALID_CORRECT_ANSWER' };
    }
    if (explanation === null)
      return { kind: 'rejected', reason: 'INVALID_EXPLANATION' };
    if (
      !isRequiredComboBlock(comboBlock, request.frame.response.viewItemCount)
    ) {
      return {
        kind: 'rejected',
        reason: 'INVALID_COMBO_BLOCK',
        detail: `expected_items=${request.frame.response.viewItemCount}, ${describeComboBlock(comboBlock)}`,
      };
    }
    const choiceMarkers = ['①', '②', '③', '④', '⑤'];
    if (
      choices.some((choice, index) => {
        const marker = choiceMarkers[index];
        return marker === undefined || !choice.trim().startsWith(marker);
      })
    ) {
      return { kind: 'rejected', reason: 'INVALID_CHOICE_MARKERS' };
    }
    if (
      (request.frame.response.mode === 'truth_combination' &&
        !isReferenceCombinationChoiceSet(choices)) ||
      (request.frame.response.mode === 'single_selection' &&
        isReferenceCombinationChoiceSet(choices))
    ) {
      return { kind: 'rejected', reason: 'INVALID_CHOICE_TOPOLOGY' };
    }
    if (!truthCombinationVerdictAligns(request, correctAnswer, choices)) {
      return { kind: 'rejected', reason: 'ANSWER_ENCODING_MISMATCH' };
    }
    const selectedTemplate = selectReferenceTpl(
      request.payload,
      raw.templateType,
      raw.stimulusData,
      request.frame.archetype,
    );
    if (selectedTemplate.kind !== 'selected') {
      return { kind: 'rejected', reason: 'TPL_SELECTION_REJECTED' };
    }
    let stimulusData: Record<string, unknown> = raw.stimulusData;
    if (selectedTemplate.template === 'TPL_CONVERSATIONAL_FLOW') {
      const conversation = parseConversationForStorage(raw.stimulusData);
      if (conversation === null) {
        return { kind: 'rejected', reason: 'INVALID_CONVERSATION' };
      }
      const sceneKind = deriveInterviewSceneKind(
        request.reference,
        raw.stimulusData,
      );
      stimulusData =
        sceneKind === null
          ? conversation
          : { ...conversation, scene_kind: sceneKind };
    }

    if (
      !this.stimulusNormalizer.isRenderableTplData(
        stimulusData,
        selectedTemplate.template,
      )
    ) {
      return { kind: 'rejected', reason: 'UNRENDERABLE_TEMPLATE_DATA' };
    }
    const factGrounding = validateReferenceFactGrounding({
      source: request.reference,
      template: selectedTemplate.template,
      stimulusData,
    });
    if (factGrounding.kind === 'rejected') {
      return {
        kind: 'rejected',
        reason: 'MATRIX_SOURCE_FACT_MISMATCH',
        detail: `missing_terms=${factGrounding.missingTerms.join(',')}`,
      };
    }
    const fidelity = validateReferenceArchetypeFidelity(raw.fidelityTrace, {
      archetype: request.frame.archetype,
      structureBlueprint: request.frame.structureBlueprint,
      payload: request.payload,
    });
    if (fidelity.kind === 'rejected') {
      return {
        kind: 'rejected',
        reason: 'ARCHETYPE_FIDELITY_MISMATCH',
        detail: `path=${fidelity.path}; expected=${fidelity.expected}; actual=${fidelity.actual}`,
      };
    }
    const fidelitySpec =
      request.fidelitySpec ?? buildRequestFidelitySpec(request);
    const visibleFields = [
      { field: 'questionStem', text: questionStem },
      { field: 'stimulusData', text: JSON.stringify(stimulusData) },
      {
        field: 'comboBlock',
        text:
          comboBlock === null
            ? ''
            : [
                comboBlock.title,
                ...comboBlock.items.map(({ text }) => text),
              ].join(' '),
      },
      { field: 'choices', text: choices.join(' ') },
    ] as const;
    const copyRepair = visibleFields.flatMap(({ field, text }) => {
      const result = validateReferenceCopyPolicy(fidelitySpec, text);
      return result.kind === 'accepted'
        ? []
        : [{ field, matches: result.matches }];
    });
    if (copyRepair.length > 0) {
      return {
        kind: 'rejected',
        reason: 'VERBATIM_SOURCE_SEGMENT',
        detail: `fields=${copyRepair
          .map(({ field, matches }) => `${field}:${matches.length}`)
          .join(',')}`,
        copyRepair,
      };
    }
    const density = validateReferenceDensity(
      fidelitySpec,
      JSON.stringify(stimulusData),
    );
    if (density.kind === 'rejected') {
      return { kind: 'rejected', reason: density.reason };
    }

    return {
      kind: 'accepted',
      value: {
        metadata: {
          unit_name: `${request.payload.eligibleUnits[0] ?? request.payload.unitRange.start}단원`,
          target_concept: request.payload.targetConceptIds.join(', '),
          item_type: 'reference_variant',
          difficulty,
          recommended_template: selectedTemplate.template,
        },
        render_ready: {
          question_stem: questionStem.replace(/^\d+\.\s*/, ''),
          stimulus_data: stimulusData,
          options_list: choices,
          combo_block: comboBlock,
        },
        explanation: { judgment: explanation },
        correct_answer: correctAnswer,
        dna_contract: null,
      },
    };
  }

  private referenceRequestReason(
    request: ReferenceVariantGenerationRequest,
  ): string | null {
    if (
      !sameSource(request.reference.source, request.frame.source) ||
      !sameSource(request.reference.source, request.payload.source)
    ) {
      return 'SOURCE_MISMATCH';
    }
    if (
      request.frame.subject !== request.payload.subject ||
      !sameUnitRange(request.frame.unitRange, request.payload.unitRange) ||
      request.frame.response.choiceEncoding !==
        request.payload.answerPlan.choiceEncoding
    ) {
      return 'FRAME_PAYLOAD_MISMATCH';
    }
    if (!isStructuredTplName(request.selectedTemplate)) {
      return 'UNSUPPORTED_TEMPLATE';
    }
    return CANONICAL_TPL_BY_INFORMATION_SHAPE[
      request.payload.requiredInformationShape
    ] === request.selectedTemplate
      ? null
      : 'TEMPLATE_MISMATCH';
  }

  async regenerateBatch(
    client: OpenAI,
    batchPrompt: string,
    selected: any[],
    result: any[],
    difficulty: Difficulty,
    startUnitNum: number,
    reportProgress?: ExamGenerationProgressReporter,
    attempt = 1,
  ): Promise<void> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);

      let response: OpenAI.Chat.Completions.ChatCompletion;
      try {
        response = await client.chat.completions.create(
          {
            model: process.env.OPENAI_STEP1_MODEL || 'gpt-4o',
            messages: [
              {
                role: 'system',
                content:
                  'You are a Korean CSAT question generator for 전문 교과 (성공적인 직업생활, 공업 일반).\nGiven reference questions, create NEW questions with DIFFERENT scenarios but EQUAL complexity.\nCRITICAL: Your generated stimulus must be as DETAILED and RICH as the reference stimulus.\nInclude specific names (A씨, B씨), numbers (periods, amounts, counts, years), locations, and causally connected narratives.\nAvoid generic descriptions — every sentence should add concrete information.\nIf the reference compares multiple entities (e.g. Student A vs B), your stimulus text MUST include entity-specific details for ALL mentioned entities. Do NOT generate a generic step-by-step procedure that loses entity identity.\nReturn one valid JSON object with exactly this top-level shape: {"questions": [ ... ]}.',
              },
              { role: 'user', content: batchPrompt },
            ],
            response_format: { type: 'json_object' },
            temperature: 0.8,
          },
          { signal: controller.signal },
        );
      } finally {
        clearTimeout(timeoutId);
      }

      const content2 = response.choices[0]?.message?.content;
      if (!content2) {
        if (attempt < 2) {
          await this.regenerateBatch(
            client,
            batchPrompt,
            selected,
            result,
            difficulty,
            startUnitNum,
            reportProgress,
            attempt + 1,
          );
        }
        return;
      }

      const parsed = JSON.parse(content2);
      let items: any[] =
        parsed.questions ||
        parsed.items ||
        (Array.isArray(parsed) ? parsed : []);
      if (!Array.isArray(items) || (items.length === 0 && parsed.stem)) {
        items = [parsed];
      }
      if (items.length === 0) {
        this.logger.warn('[REGEN] no items in response');
        return;
      }

      this.logger.log(
        '[REGEN] batch returned ' +
          items.length +
          ' items (requested ' +
          selected.length +
          ')',
      );

      for (let i = 0; i < items.length && i < selected.length; i++) {
        const gen = items[i];
        const ref = selected[i];
        const unitNum = ref.source?.unitNumber || startUnitNum;

        let rawChoices = gen.choices;
        const rawAnswer = gen.correctAnswer ?? gen.correct_answer;
        const choicesAreValid =
          Array.isArray(rawChoices) &&
          rawChoices.length === 5 &&
          rawChoices.every(
            (choice: unknown, index: number) =>
              typeof choice === 'string' &&
              choice.trim().startsWith(['①', '②', '③', '④', '⑤'][index]),
          );
        const answerIsValid =
          Number.isInteger(Number(rawAnswer)) &&
          Number(rawAnswer) >= 1 &&
          Number(rawAnswer) <= 5;
        const viewItems: string[] = Array.isArray(gen.viewItems)
          ? gen.viewItems
          : Array.isArray(gen.view_items)
            ? gen.view_items
            : [];

        if (
          !choicesAreValid ||
          !answerIsValid ||
          (!Array.isArray(gen.viewItems) && !Array.isArray(gen.view_items)) ||
          typeof gen.stimulus !== 'string' ||
          !gen.stimulus.trim() ||
          typeof gen.stem !== 'string' ||
          !gen.stem.trim()
        ) {
          this.logger.warn(
            `[REGEN] item ${i} rejected: generated stem/stimulus/options/answer contract invalid`,
          );
          continue;
        }

        const comboBlock =
          viewItems.length > 0
            ? {
                title: '<보기>',
                items: viewItems.map((v: string) => {
                  const m = v.match(/^([ㄱ-ㅎ])\.\s*(.*)$/);
                  return { key: m ? m[1] : 'ㄱ', text: m ? m[2] : v };
                }),
              }
            : null;

        let stimulusText = gen.stimulus;

        const boViewMatch = stimulusText.match(/<보\s*기>\s*\n?([\s\S]*)$/);
        if (boViewMatch) {
          stimulusText = stimulusText
            .substring(0, stimulusText.indexOf('<보'))
            .trim();
        }

        let stemText = gen.stem
          .replace(/^\[\d+~\d+\]\s*/, '')
          .replace(/^\d+\.\s*/, '')
          .replace(/\s*\[3점\]/g, '');

        stemText = stemText.replace(
          /^위\s*(사례|자료|표|보고서|강의|글)/,
          '다음 $1',
        );
        stemText = stemText.replace(/^위\s+(.+?)(에서|을|를)/, '다음 $1$2');

        const genTemplateType = gen.templateType || gen.template_type || '';

        // Use string stimulus always — convertBatchToTpl handles structured conversion with isEmptyContent validation
        let finalStimulusData: any = stimulusText;
        const dnaRequiredTemplate =
          ref.dnaContract?.materialContract?.requiredTemplate;
        let finalTemplate = isStructuredTplName(dnaRequiredTemplate)
          ? dnaRequiredTemplate
          : isStructuredTplName(genTemplateType)
            ? genTemplateType
            : 'TPL_REGENERATION_REQUIRED';

        // Safety: empty object → string fallback
        if (
          typeof finalStimulusData === 'object' &&
          !Array.isArray(finalStimulusData) &&
          Object.keys(finalStimulusData).length === 0
        ) {
          finalStimulusData = stimulusText || '';
          finalTemplate = 'TPL_REGENERATION_REQUIRED';
        }

        if (typeof finalStimulusData === 'string') {
          const clean = finalStimulusData.replace(/^viewItems:\s*/i, '');
          if (/^[ㄱ-ㅎ][.\s]/.test(clean) && clean.includes('|')) {
            this.logger.warn(
              `[REGEN] viewItems 내용이 stimulus로 잘못 들어감, 제거: targetConcept=${gen.targetConcept || ref.targetConcepts?.join(',')}`,
            );
            finalStimulusData = '';
          }
        }

        const targetDomain =
          gen.targetConcept || (ref.targetConcepts || []).join(' ');
        const optText = rawChoices.join(' ');
        const stemDomain = (
          stemText +
          ' ' +
          (typeof finalStimulusData === 'string' ? finalStimulusData : '')
        ).toLowerCase();
        const hasLabor =
          /노동|근로|임금|고용|퇴직|연장|야간|휴게|휴가|산재/.test(stemDomain);
        const hasEdu = /학습|교육|학교|수업|교사|학생/.test(stemDomain);
        const optHasLabor =
          /노동|근로|임금|고용|퇴직|연장|야간|휴게|휴가|산재/.test(optText);
        const optHasEdu = /학습|교육|학교|수업|교사|학생/.test(optText);
        if (hasEdu && !hasLabor && optHasLabor && !optHasEdu) {
          this.logger.warn(
            `[REGEN] 선택지-개념 도메인 불일치: stem=교육, options=노동법 — targetConcept=${targetDomain}`,
          );
        }

        let stimText = '';
        if (typeof finalStimulusData === 'string') {
          stimText = finalStimulusData;
        } else if (finalStimulusData && typeof finalStimulusData === 'object') {
          stimText =
            finalStimulusData.narrative ||
            finalStimulusData.data ||
            finalStimulusData.content ||
            finalStimulusData.description ||
            finalStimulusData.body ||
            finalStimulusData.text ||
            '';
        }
        if (stimText && comboBlock && comboBlock.items.length > 0) {
          const stimNames = [...stimText.matchAll(/([A-Z])씨/g)].map(
            (m) => m[1],
          );
          const viewText = comboBlock.items.map((i: any) => i.text).join(' ');
          const viewNames = [...viewText.matchAll(/([A-Z])씨/g)].map(
            (m) => m[1],
          );
          if (
            stimNames.length > 0 &&
            viewNames.length > 0 &&
            stimNames[0] !== viewNames[0]
          ) {
            const nameMap = new Map<string, string>();
            viewNames.forEach((vn, i) => {
              if (stimNames[i]) nameMap.set(vn, stimNames[i]);
            });
            const replaceName = (s: string) =>
              s.replace(/([A-Z])\s*씨/g, (_, letter) =>
                nameMap.get(letter)
                  ? nameMap.get(letter) + '씨'
                  : letter + '씨',
              );
            comboBlock.items = comboBlock.items.map((item: any) => ({
              ...item,
              text: replaceName(item.text),
            }));
            rawChoices = rawChoices.map((opt: string) => replaceName(opt));
            this.logger.log(
              `[REGEN] 이름 동기화: ${[...nameMap.entries()].map(([k, v]) => `${k}씨→${v}씨`).join(', ')}`,
            );
          }
        }

        result.push({
          metadata: {
            unit_name: unitNum + '단원',
            target_concept:
              gen.targetConcept ||
              gen.target_concept ||
              ref.targetConcepts?.join(', ') ||
              '일반',
            item_type: 'reference_variant',
            difficulty: gen.difficulty || difficulty,
            recommended_template: finalTemplate,
          },
          render_ready: {
            question_stem: stemText,
            stimulus_data: finalStimulusData,
            options_list: rawChoices,
            combo_block: comboBlock,
          },
          explanation: { judgment: gen.explanation || '생성형 문항' },
          correct_answer: rawAnswer,
          dna_contract: ref.dnaContract ?? null,
        });
      }

      if (reportProgress) {
        await reportProgress({
          stage: 'regenerating',
          progress: 70,
          message: result.length + '/' + selected.length + ' 문항 재생성 완료',
        });
      }
    } catch (e: any) {
      const code = e.code || e.status || 'unknown';
      const message = e?.message || String(e);
      const cause = e?.cause ? String(e.cause).slice(0, 200) : '';
      this.logger.error(
        '[REGEN] batch failed (attempt ' +
          attempt +
          '): code=' +
          code +
          ', message=' +
          message +
          (cause ? ', cause=' + cause : ''),
      );
      if (attempt < 2) {
        await this.regenerateBatch(
          client,
          batchPrompt,
          selected,
          result,
          difficulty,
          startUnitNum,
          reportProgress,
          attempt + 1,
        );
      }
    }
  }

  async verifyBatch(client: OpenAI, items: any[]): Promise<number[]> {
    if (items.length === 0) return [];

    const PLACEHOLDER_PATTERNS = [
      '(내용 없음)',
      '내용 없음',
      '값을 입력',
      '여기에 ',
      '{{',
      'TEXT',
      'BLANK',
    ];
    const mechanicalFail: number[] = [];
    const toJudge: { item: any; index: number }[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const stimJson = JSON.stringify(item.render_ready?.stimulus_data ?? {});
      const stimLen = stimJson.length;
      const isEmptyObj = stimLen <= 4 || stimJson === '{}';
      const hasPlaceholder = PLACEHOLDER_PATTERNS.some((p) =>
        stimJson.includes(p),
      );
      const stemLen = (item.render_ready?.question_stem ?? '').trim().length;
      if (isEmptyObj || hasPlaceholder || stemLen < 10) {
        const reason = isEmptyObj
          ? 'stimulus 비어있음'
          : hasPlaceholder
            ? '플레이스홀더 포함'
            : `stem 너무 짧음(${stemLen}자)`;
        this.logger.warn(`[VERIFY-MECH] item ${i} 자동 FAIL: ${reason}`);
        mechanicalFail.push(i);
      } else {
        toJudge.push({ item, index: i });
      }
    }

    if (toJudge.length === 0) return mechanicalFail;

    const promptLines = toJudge
      .map(({ item, index: i }) => {
        const stem = item.render_ready?.question_stem || '';
        const stimRaw = item.render_ready?.stimulus_data;
        const stim =
          typeof stimRaw === 'string' ? stimRaw : JSON.stringify(stimRaw || '');
        const choices = (item.render_ready?.options_list || []).join(' | ');
        const viewItems = item.render_ready?.combo_block?.items || [];
        const viewText = viewItems
          .map((v: any) => v.key + '. ' + v.text)
          .join(' | ');
        const answer = item.correct_answer || '';
        return `[Item ${i}]\nstem: ${stem.slice(0, 200)}\nstimulus: ${stim.slice(0, 500)}\nchoices: ${choices.slice(0, 300)}\nviewItems: ${viewText.slice(0, 200)}\nanswer: ${answer}`;
      })
      .join('\n\n');

    const response = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You verify Korean CSAT questions. Focus on these CRITICAL issues only:\n\nFAIL (reject the item):\n1. stimulus is empty ({} or "")\n2. stem topic and viewItems topic are COMPLETELY DIFFERENT — e.g., stem is about bank loans but viewItems are about labor law\n3. Person names in viewItems (A, B, C, D) do NOT match person names in the stimulus — e.g., stimulus talks about C,D but viewItems reference A,B\n4. correctAnswer is out of 1-5 range\n5. The STEM topic is from a COMPLETELY DIFFERENT SUBJECT than the reference — e.g., reference concepts are about labor law (근로기준법, 임금) but generated stem is about environmental law (환경보호법)\n6. stimulus contains "viewItems:" text or combo block items (ㄱ. ㄴ. patterns separated by |) in a document field — the stimulus should have actual content, not viewItems/combo_block text\n7. stimulus_data is a structured object (not empty) but all content fields are empty/null — e.g., {case_profile: {}, narrative: ""} — this is a FAIL, should fall back to plain text\n\nPASS everything else, even if there are minor issues.\nReturn JSON array: [{itemIndex, passed: true/false, reason: "..."}]',
        },
        { role: 'user', content: 'Verify:\n\n' + promptLines },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    });

    const content = response.choices[0]?.message?.content;
    if (!content) return mechanicalFail;

    try {
      const parsed = JSON.parse(content);
      const results =
        parsed.results ||
        parsed.verifications ||
        parsed.items ||
        (Array.isArray(parsed) ? parsed : [parsed]);
      const arr = Array.isArray(results) ? results : [results];
      const llmFailed: number[] = [];

      for (const r of arr) {
        if (r.itemIndex === undefined) continue;
        if (!r.passed) {
          llmFailed.push(r.itemIndex);
          this.logger.warn(
            '[VERIFY] item ' +
              r.itemIndex +
              ' FAIL: ' +
              (r.reason || '').slice(0, 150),
          );
        }
      }

      return [...new Set([...mechanicalFail, ...llmFailed])];
    } catch (e: any) {
      this.logger.warn('[VERIFY] parse failed: ' + e.message);
      return mechanicalFail;
    }
  }

  /** 규칙 기반 TPL 변환 — 틀에 맞으면 LLM 없이 직접 구조체 생성 */
  private preProcessTpl(
    stimulus: string,
  ): { templateType: string; stimulusData: any } | null {
    const lines = stimulus.split('\n').filter((l) => l.trim().length > 0);
    if (lines.length === 0) return null;

    // Rule 1: Table (most specific — pipe-delimited rows)
    const pipeLines = lines.filter(
      (l) => l.trim().startsWith('|') && l.trim().endsWith('|'),
    );
    if (pipeLines.length >= 2) {
      const headerCells = pipeLines[0]
        .split('|')
        .filter((c) => c.trim())
        .map((c) => c.trim());
      const headers = headerCells.map((h, i) => ({
        id: `h${i + 1}`,
        label: h,
      }));
      const rows = pipeLines
        .slice(1)
        .filter((l) => !/^[|\s-]+$/.test(l))
        .map((l, i) => ({
          id: `r${i + 1}`,
          cells: l
            .split('|')
            .filter((c) => c.trim())
            .map((c) => c.trim()),
        }));
      if (headers.length >= 2 && rows.length >= 1) {
        return {
          templateType: 'TPL_COMPARATIVE_MATRIX',
          stimulusData: { headers, rows },
        };
      }
    }

    // Rule 2: Legal text (법률/조문 → FORMAL_DOCUMENT)
    if (/제\s*\d+\s*조|법률|법\s*제|근로기준법/.test(stimulus)) {
      return {
        templateType: 'TPL_FORMAL_DOCUMENT',
        stimulusData: {
          doc_type: '법률',
          header_info: { title: '', date: '', author: '' },
          paragraphs: [{ sub_title: '', content: stimulus }],
          footnotes: [],
        },
      };
    }

    // Rule 3: Q&A Forum (질문 + 답변 pattern → DIGITAL_FORUM_INTERFACE)
    if (/질문\s*[:]/.test(stimulus) && /답변\s*[:]/.test(stimulus)) {
      return {
        templateType: 'TPL_DIGITAL_FORUM_INTERFACE',
        stimulusData: {
          forum_name: '',
          main_post: { author: '질문자', title: '', content: stimulus },
          comments: [],
        },
      };
    }

    // Rule 4: Steps/procedure (numbered items)
    // Skip SEQUENTIAL_WORKFLOW if the content compares multiple entities (A vs B)
    // because step structures lose entity-specific detail, causing logical gaps.
    const COMPARATIVE_ENTITY_PATTERN =
      /학생\s*[A-Za-z]|(?:A|B|C)\s*(?:는|은|가|이)\s|~한\s*반면|와\s*달리|에\s*비해|(?:비교|대조|차이)/;
    const hasComparativeEntities = COMPARATIVE_ENTITY_PATTERN.test(stimulus);
    const stepPattern = /^\s*(?:(\d+)\s*[.)]|①|②|③|④|⑤)\s*/;
    const stepLines = lines.filter((l) => stepPattern.test(l.trim()));
    if (stepLines.length >= 2 && !hasComparativeEntities) {
      const steps = stepLines.map((line, i) => ({
        idx: i + 1,
        label: `Step ${i + 1}`,
        desc: line.trim().replace(stepPattern, '').trim(),
        is_missing: false,
      }));
      return {
        templateType: 'TPL_SEQUENTIAL_WORKFLOW',
        stimulusData: { steps, orientation: 'vertical' },
      };
    }

    // Rule 5: Lecture (teacher speaker → INSTRUCTIONAL_SCENE)
    if (/^(교사|강사|선생님)\s*[:]/m.test(stimulus)) {
      const teacherMatch = stimulus.match(
        /^(교사|강사|선생님)\s*[:]\s*(.+?)$/m,
      );
      return {
        templateType: 'TPL_INSTRUCTIONAL_SCENE',
        stimulusData: {
          instructor: {
            id: 'teacher',
            text: teacherMatch?.[2]?.slice(0, 100) ?? '',
          },
          canvas_content: { type: 'text', data: stimulus },
          students: [],
        },
      };
    }

    // Rule 6: Dialogue (short speaker labels like "A: ", "B: " — 1~2 chars)
    const shortSpeakerPattern = /^([A-Za-z]{1,2})\s*[:]\s*/;
    const speakerLines = lines.filter((l) =>
      shortSpeakerPattern.test(l.trim()),
    );
    if (speakerLines.length >= 2) {
      const participants: { id: string; name: string; role: string }[] = [];
      const messages: { p_id: string; text: string }[] = [];
      const seen = new Set<string>();
      for (const line of speakerLines) {
        const m = line.trim().match(shortSpeakerPattern);
        if (m) {
          const id = m[1].trim();
          const text = line.trim().slice(m[0].length).trim();
          if (!seen.has(id)) {
            seen.add(id);
            participants.push({ id, name: id, role: '' });
          }
          messages.push({ p_id: id, text });
        }
      }
      if (messages.length >= 2) {
        return {
          templateType: 'TPL_CONVERSATIONAL_FLOW',
          stimulusData: { participants, messages },
        };
      }
    }

    // Rule 7: Person case (A씨/B씨 — most generic, last)
    if (/[A-Z]씨/.test(stimulus) && stimulus.length >= 60) {
      const nameMatch = stimulus.match(/([A-Z])씨/);
      return {
        templateType: 'TPL_CASE_DIAGNOSTIC_FRAME',
        stimulusData: {
          case_profile: {
            name: nameMatch ? `${nameMatch[1]}씨` : '',
            context: stimulus.slice(0, 120),
          },
          narrative: stimulus,
        },
      };
    }

    return null;
  }

  async convertBatchToTpl(client: OpenAI, items: any[]): Promise<void> {
    if (items.length === 0) return;

    const preConvertStimuli = items.map(
      (item) => item.render_ready?.stimulus_data,
    );
    const markForRegeneration = (item: any, index: number, reason: string) => {
      const original = preConvertStimuli[index];
      const text =
        typeof original === 'string'
          ? original
          : JSON.stringify(original ?? '');
      item.metadata.recommended_template = 'TPL_REGENERATION_REQUIRED';
      item.render_ready.stimulus_data = { data: text };
      this.logger.warn(`[TPL] item ${index} regeneration required: ${reason}`);
    };

    // Phase 1: Rule-based preprocessing
    for (let i = 0; i < items.length; i++) {
      const s =
        typeof items[i].render_ready?.stimulus_data === 'string'
          ? items[i].render_ready.stimulus_data.trim()
          : '';
      if (s.length < 10) continue;
      if (
        isStructuredTplName(
          items[i].dna_contract?.materialContract?.requiredTemplate,
        )
      ) {
        continue;
      }
      const ruleResult = this.preProcessTpl(s);
      if (
        ruleResult &&
        this.stimulusNormalizer.isRenderableTplData(
          ruleResult.stimulusData,
          ruleResult.templateType,
        )
      ) {
        items[i].render_ready.stimulus_data = ruleResult.stimulusData;
        items[i].metadata.recommended_template = ruleResult.templateType;
        this.logger.log(
          `[TPL] Rule match: item ${i} → ${ruleResult.templateType}`,
        );
      } else if (ruleResult) {
        this.logger.warn(
          `[TPL] Rule match rejected for item ${i}: incomplete ${ruleResult.templateType}`,
        );
      }
    }

    // Phase 2: LLM for items rules didn't match (still have string stimulus_data)
    const indices: number[] = [];
    const inputs: string[] = [];
    for (let i = 0; i < items.length; i++) {
      const s =
        typeof items[i].render_ready?.stimulus_data === 'string'
          ? items[i].render_ready.stimulus_data.trim()
          : '';
      if (s.length < 10) continue;
      indices.push(i);
      inputs.push(
        '[Item ' +
          i +
          '] preferredTemplate: ' +
          (items[i].metadata?.recommended_template || 'none') +
          '\nstem: ' +
          (items[i].render_ready?.question_stem || '').slice(0, 200) +
          '\nstimulus: ' +
          s.slice(0, 1500),
      );
    }
    if (inputs.length === 0) {
      for (let i = 0; i < items.length; i++) {
        if (typeof items[i].render_ready?.stimulus_data === 'string') {
          markForRegeneration(
            items[i],
            i,
            'no structured conversion candidate',
          );
        }
      }
      return;
    }

    try {
      const response = await client.chat.completions.create({
        model: process.env.OPENAI_STEP1_MODEL || 'gpt-4o',
        messages: [
          {
            role: 'system',
            content:
              'Convert Korean CSAT stimuli to TPL-structured JSON. Return array of {itemIndex, templateType, stimulusData, confidence(1-5)}.\n\nValid templateType values (use ONLY these — NO PLAIN_TEXT):\n- TPL_CONVERSATIONAL_FLOW: dialogue/interview with participants and messages\n- TPL_CASE_DIAGNOSTIC_FRAME: case narrative with profile and check_items\n- TPL_FORMAL_DOCUMENT: document with doc_type, header_info, paragraphs\n- TPL_COMPARATIVE_MATRIX: table with headers and rows\n- TPL_SEQUENTIAL_WORKFLOW: steps with orientation\n- TPL_DIGITAL_FORUM_INTERFACE: forum with main_post and comments\n- TPL_INSTRUCTIONAL_SCENE: lecture with instructor and canvas\n- TPL_PROMOTIONAL_CANVAS: ad with slogan and bullets\n- TPL_QUANTITATIVE_CHART: chart with chart_type, axes, datasets\n\nCRITICAL: Extract ALL content from the input stimulus into the template fields. Never leave fields empty.\nFor each template type, map content as follows:\n- CASE_DIAGNOSTIC_FRAME: narrative = FULL original text verbatim, case_profile = person/business name extracted\n- CONVERSATIONAL_FLOW: messages = EVERY dialogue line with full text, participants = speaker names\n- COMPARATIVE_MATRIX: rows = ALL data rows with full cell values, headers = ALL column labels\n- FORMAL_DOCUMENT: paragraphs = ALL paragraphs with full text, header_info = document metadata\n- INSTRUCTIONAL_SCENE: canvas_content.data = FULL lecture content, instructor = speaker name\n- QUANTITATIVE_CHART: datasets = ALL data groups with labels and values, axes = complete axis info\n- SEQUENTIAL_WORKFLOW: steps = ALL steps with full descriptions\n- DIGITAL_FORUM_INTERFACE: main_post.content = full post, comments = ALL comment text\n- PROMOTIONAL_CANVAS: bullets = ALL bullet/feature descriptions\n\nconfidence=5: perfect template match, all content preserved\nconfidence=3: partial match, some content adapted\nconfidence=1: content would be lost — prefer PLAIN_TEXT instead\n\nBe proactive when the stimulus CLEARLY matches: dialogue markers (" :") → CONVERSATIONAL_FLOW, tables → COMPARATIVE_MATRIX, case narratives → CASE_DIAGNOSTIC_FRAME, documents → FORMAL_DOCUMENT.',
          },
          {
            role: 'user',
            content:
              'Return exactly {"conversions":[{"itemIndex":number,"templateType":string,"stimulusData":object,"confidence":number}]}. Do not return PLAIN_TEXT.\n\nConvert:\n\n' +
              inputs.join('\n\n'),
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0,
      });

      const content3 = response.choices[0]?.message?.content;
      if (!content3) throw new Error('empty TPL conversion response');

      const parsed = JSON.parse(content3);
      if (!Array.isArray(parsed?.conversions)) {
        throw new Error('TPL conversion response missing conversions array');
      }
      const convs = parsed.conversions;

      const convertedIndices = new Set<number>();

      for (const conv of convs) {
        const idx = conv.itemIndex;
        if (!Number.isInteger(idx) || idx < 0 || idx >= items.length) continue;
        convertedIndices.add(idx);
        const item = items[idx];
        const confidence = conv.confidence ?? 0;

        if (
          confidence < 2 ||
          !isStructuredTplName(conv.templateType) ||
          !this.stimulusNormalizer.isRenderableTplData(
            conv.stimulusData,
            conv.templateType,
          )
        ) {
          markForRegeneration(item, idx, 'invalid structured conversion');
          continue;
        }

        item.render_ready.stimulus_data = conv.stimulusData;
        const requiredTemplate =
          item.dna_contract?.materialContract?.requiredTemplate;
        if (
          isStructuredTplName(requiredTemplate) &&
          conv.templateType !== requiredTemplate
        ) {
          markForRegeneration(item, idx, 'DNA template mismatch');
          continue;
        }
        item.metadata.recommended_template = conv.templateType;
      }

      for (const index of indices) {
        if (!convertedIndices.has(index)) {
          markForRegeneration(items[index], index, 'conversion missing item');
        }
      }
    } catch (error: any) {
      this.logger.warn(`[TPL] conversion failed: ${error?.message || error}`);
    } finally {
      for (let i = 0; i < items.length; i++) {
        if (typeof items[i].render_ready?.stimulus_data === 'string') {
          markForRegeneration(items[i], i, 'conversion unavailable');
        }
      }
    }
  }

  buildBatchRegenPrompt(
    refs: any[],
    difficulty: Difficulty,
    patterns: string,
    customPrompt?: string,
  ): string {
    if (refs.length > 0 && refs.every(isReferenceVariantGenerationRequest)) {
      return this.buildReferenceBatchRegenPrompt(refs, difficulty);
    }
    const count = refs.length;
    let prompt =
      'Create ' +
      count +
      ' NEW Korean CSAT questions. Must output EXACTLY ' +
      count +
      '.\n';
    prompt += 'For EACH reference output exactly one new question.\n';
    prompt += 'Keep same structure (same number of view items, 5 choices).\n';
    prompt += '[중요] 개념 도메인을 절대 변경하지 마라.\n';
    prompt +=
      '  reference concepts가 "근로기준법, 임금, 근로계약"이면 생성된 question도 근로기준법/노동법 영역을 유지하라.\n';
    prompt +=
      '  "소비자보호법", "환경보호법", "교육기준법" 등 전혀 다른 법률 영역으로 변경하는 것은 금지한다.\n';
    prompt +=
      '  같은 개념을 유지하되 새로운 사례/상황/시나리오로 문제를 다시 구성하라.\n';
    prompt +=
      '  개념 자체를 다른 법률로 대체하지 말고, 같은 개념 안에서 세부 내용(근로시간 유형, 임금 계산 조건, 해고 사유 등)을 바꿔라.\n';
    prompt +=
      'NAMING CONSISTENCY: Use the SAME character names throughout the entire question. If stimulus uses "A씨, B씨", then viewItems and choices must also use "A씨, B씨" — NOT different letters. The first mentioned character is always A씨, second is B씨, etc. Never mix letter assignments between stimulus and viewItems.\n';
    prompt +=
      'Every question MUST have: stem (with \\n line breaks), stimulus (plain text), viewItems, choices (5 with ①②③④⑤), correctAnswer (1-5).\n';
    prompt +=
      'Choices must have ①~⑤ prefix. Do NOT use (가)(나)(다) placeholders.\n';
    prompt += 'Do NOT include original exam number prefixes like [6~7].\n';
    prompt +=
      'Determine correctAnswer by evaluating each view item (ㄱㄴㄷㄹ) as TRUE/FALSE.\n';
    prompt += '\n';
    prompt +=
      'DIFFICULTY VARIETY: Include a mix of difficulty levels. If ' +
      difficulty +
      ' is INTERGRATE, at least 40% should require multi-concept reasoning. Vary the question patterns.\n';
    prompt += '\n';
    prompt +=
      'TEMPLATE TYPES: TPL_CONVERSATIONAL_FLOW, TPL_CASE_DIAGNOSTIC_FRAME, TPL_FORMAL_DOCUMENT, TPL_COMPARATIVE_MATRIX, TPL_INSTRUCTIONAL_SCENE, TPL_DIGITAL_FORUM_INTERFACE, TPL_SEQUENTIAL_WORKFLOW, TPL_QUANTITATIVE_CHART, TPL_PROMOTIONAL_CANVAS\n';
    prompt +=
      'When a reference includes dnaContract, preserve its requiredTemplate, materialKind, responseMode, evidence slot relationships, and decision rule. Every answer must require at least two distinct material facts plus the stated curriculum rule.\n';
    prompt += '\n';
    prompt += '[Writing Style & Question Logic]\n';
    prompt += 'Tone: formal, objective, fact-based — like textbook/exam.\n';
    prompt +=
      '- Connectors: ~에 따라, ~을 통해, ~에 대해, ~도록, ~에 해당하는\n';
    prompt += '- Endings: ~이다/~한다 (declarative), ~했다 (past narrative)\n';
    prompt +=
      '- Names: ○○기업/××× (anonymous), A씨/B씨 (people), A기업/B기업 (comparison)\n';
    prompt +=
      '- Vocabulary: ~에 대한/대하여, ~에 해당하는, ~에 관한, ~을 위한, ~에 따른\n';
    prompt +=
      '- Composition: structured tables, procedural steps, case narratives, dialogues with specific numbers/dates/amounts\n';
    prompt += '\n';
    prompt += 'Answer logic (each question must satisfy):\n';
    prompt += '1. Stimulus → concrete scenario with specific facts.\n';
    prompt +=
      '2. Each viewItem (ㄱ/ㄴ/ㄷ/ㄹ) → one factual claim applying a concept to the scenario.\n';
    prompt +=
      '3. Every viewItem must be directly verifiable from the stimulus (clear TRUE/FALSE).\n';
    prompt +=
      '4. ViewItems must test distinct concepts (no overlap between items).\n';
    prompt +=
      '5. Correct answer = combination of TRUE items, matching exactly one of the 5 choices.\n';
    prompt += '\n';
    prompt += 'Stimulus length: 150~500 characters. ViewItems: 3 or 4 items.\n';
    prompt += 'Choice format: 5 options with ①~⑤ prefix.\n';
    prompt += '\n';
    prompt += 'Output format per question:\n';
    prompt +=
      '{stem, stimulus, viewItems, choices, correctAnswer, templateType}\n';

    if (patterns) {
      prompt += '\n' + patterns + '\n';
    }

    if (customPrompt) {
      prompt += '\nUser request: ' + customPrompt + '\n';
    }

    prompt +=
      '\nReturn one JSON object: {"questions": [exactly ' +
      count +
      ' objects]}.\n\n';

    for (let i = 0; i < refs.length; i++) {
      const r = refs[i];
      prompt += '[Reference ' + (i + 1) + ']\n';
      prompt += 'stem: ' + (r.stem || '').replace(/\n/g, ' ') + '\n';
      prompt +=
        'stimulus: ' +
        (r.stimulus || '').replace(/\n/g, ' ').slice(0, 1000) +
        '\n';
      if (r.viewItems && r.viewItems.length > 0)
        prompt +=
          'viewItems: ' + r.viewItems.join(' | ').replace(/\n/g, ' ') + '\n';
      prompt +=
        'choices: ' + (r.choices || []).join(' | ').replace(/\n/g, ' ') + '\n';
      prompt += 'concepts: ' + (r.targetConcepts || []).join(', ') + '\n\n';
      if (r.dnaContract) {
        prompt += 'dnaContract: ' + JSON.stringify(r.dnaContract) + '\n\n';
      }
    }

    prompt +=
      'Return one JSON object: {"questions": [exactly ' + count + ' objects]}.';
    return prompt;
  }

  filterDomainMismatch(
    items: any[],
    subjectSlug: string,
    startUnitNum: number,
    endUnitNum: number,
  ): number[] {
    const kwSet = new Set<string>();

    for (let u = startUnitNum; u <= endUnitNum; u++) {
      const unitKw = this.getUnitKeywords(subjectSlug, u);
      this.splitIntoKeywords(unitKw).forEach((kw) => kwSet.add(kw));
    }

    const fallback = FALLBACK_KEYWORDS[subjectSlug] ?? [];
    fallback.forEach((kw) => kwSet.add(kw));

    const keywords = [...kwSet];
    if (keywords.length === 0) return [];
    const failed: number[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const stem = item.render_ready?.question_stem ?? '';
      const stim =
        typeof item.render_ready?.stimulus_data === 'string'
          ? item.render_ready.stimulus_data
          : JSON.stringify(item.render_ready?.stimulus_data ?? '');
      const text = stem + ' ' + stim;
      const hasKeyword = keywords.some((kw) => text.includes(kw));
      if (!hasKeyword) {
        this.logger.warn(
          `[REGEN] 도메인 불일치 필터링: item ${i} — stem=${stem.slice(0, 60)}...`,
        );
        failed.push(i);
      }
    }
    return failed;
  }

  private getUnitKeywords(subjectSlug: string, unitNum: number): string[] {
    const folder = subjectSlug === 'success' ? 'sungjik' : 'kongil';
    const fp = path.join(
      TEXTBOOK_BASE,
      'concepts',
      folder,
      `Unit_${String(unitNum).padStart(2, '0')}.json`,
    );
    try {
      const data = JSON.parse(fs.readFileSync(fp, 'utf-8'));
      if (Array.isArray(data)) return data;
      if (data && Array.isArray(data.concepts)) return data.concepts;
      return [];
    } catch {
      return [];
    }
  }

  private splitIntoKeywords(concepts: string[]): string[] {
    const tokens = new Set<string>();
    for (const c of concepts) {
      const parts = c.split(/\s+|\s*vs\s*|\//);
      for (const p of parts) {
        const trimmed = p.trim().replace(/[^가-힣a-zA-Z0-9]/g, '');
        if (trimmed.length >= 2) tokens.add(trimmed);
      }
    }
    return [...tokens];
  }
}
