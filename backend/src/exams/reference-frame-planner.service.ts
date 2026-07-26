import { Logger } from '@nestjs/common';
import {
  validateConceptPayloadJson,
  validateConceptPayloadAgainstArchetype,
  validateReferenceFrameJson,
  type ConceptPayload,
  type ContractValidationResult,
  type ReferenceFrame,
  type SourceIdentity,
  type UnitRange,
} from './reference-frame.types';
import {
  buildConceptPayloadPrompt,
  buildReferenceFramePrompt,
} from './reference-frame-planner.prompts';
import { ReferenceFramePlannerModelClient } from './reference-frame-planner.model-client';
import {
  conceptPayloadStructuredOutputFor,
  referenceFrameStructuredOutput,
} from './reference-frame.provider-schemas';
import type {
  PlannerReasonCode,
  ReferenceFramePlannerDependencies,
  ReferenceFramePlannerRequest,
  ReferenceFramePlannerResult,
  PlannerStructuredOutput,
} from './reference-frame-planner.types';

export type {
  PlannerReasonCode,
  ReferenceFramePlannerChatRequest,
  ReferenceFramePlannerClient,
  ReferenceFramePlannerCompletion,
  ReferenceFramePlannerDependencies,
  ReferenceFramePlannerRequest,
  ReferenceFramePlannerRequestOptions,
  ReferenceFramePlannerResult,
} from './reference-frame-planner.types';

export type ReferenceFramePlanResult =
  | Readonly<{ kind: 'planned'; frame: ReferenceFrame; attempts: number }>
  | Readonly<{
      kind: 'rejected';
      reason: PlannerReasonCode;
      attempts: number;
      terminal: 'preflight' | 'retry_exhausted' | 'non_retryable';
      responseKeys?: readonly string[];
      validationPath?: string;
    }>;

type StageRequest<T> = Readonly<{
  prompt: string;
  retryPrompt?: (reason: PlannerReasonCode) => string;
  retryAdditionalReserveMs?: number;
  structuredOutput: PlannerStructuredOutput;
  parse: (content: string) => ContractValidationResult<T>;
  validate: (value: T) => PlannerReasonCode | null;
}>;

type StageResult<T> =
  | Readonly<{ kind: 'planned'; value: T; attempts: number }>
  | Readonly<{
      kind: 'rejected';
      reason: PlannerReasonCode;
      attempts: number;
      terminal: 'retry_exhausted' | 'non_retryable';
      responseKeys?: readonly string[];
      validationPath?: string;
    }>;

const SELECTED_REFERENCE_ECHO_KEYS = [
  'choices',
  'questionNumber',
  'source',
  'stem',
  'stimulus',
  'targetConcepts',
  'unitNumber',
] as const;

export class ReferenceFramePlannerService {
  private readonly modelClient: ReferenceFramePlannerModelClient;
  private readonly logger = new Logger(ReferenceFramePlannerService.name);

  constructor(
    private readonly dependencies: ReferenceFramePlannerDependencies,
  ) {
    this.modelClient = new ReferenceFramePlannerModelClient(dependencies);
  }

  async planFrame(
    request: ReferenceFramePlannerRequest,
  ): Promise<ReferenceFramePlanResult> {
    if (!isSelectedReference(request)) {
      return {
        kind: 'rejected',
        reason: 'STALE_REFERENCE',
        attempts: 0,
        terminal: 'preflight',
      };
    }

    const frameResult = await this.planStage({
      prompt: buildReferenceFramePrompt(request),
      retryPrompt: (reason) => buildReferenceFramePrompt(request, reason),
      structuredOutput: referenceFrameStructuredOutput,
      parse: (content) =>
        validateReferenceFrameJson(
          bindRequestContext(content, request),
          request.archetype,
        ),
      validate: (frame) => frameReason(frame, request),
      ...(this.dependencies.deadline === undefined
        ? {}
        : {
            retryAdditionalReserveMs:
              this.dependencies.deadline.minimumUsefulBudget('planner'),
          }),
    });
    let frame: ReferenceFrame;
    if (frameResult.kind === 'planned') {
      frame = frameResult.value;
    } else {
      const recoveredFrame = echoedReferenceFrame(
        request,
        frameResult.responseKeys,
      );
      if (recoveredFrame === null) {
        return frameResult;
      }
      frame = recoveredFrame;
    }
    return { kind: 'planned', frame, attempts: frameResult.attempts };
  }

  async plan(
    request: ReferenceFramePlannerRequest,
    cachedFrame?: ReferenceFrame,
  ): Promise<ReferenceFramePlannerResult> {
    const frameResult =
      cachedFrame === undefined
        ? await this.planFrame(request)
        : { kind: 'planned' as const, frame: cachedFrame, attempts: 0 };
    if (frameResult.kind === 'rejected') {
      if (frameResult.terminal === 'preflight') {
        return rejected(
          'preflight',
          frameResult.reason,
          frameResult.attempts,
          frameResult.terminal,
          frameResult.responseKeys,
          frameResult.validationPath,
        );
      }
      return rejected(
        'frame',
        frameResult.reason,
        frameResult.attempts,
        frameResult.terminal,
        frameResult.responseKeys,
        frameResult.validationPath,
      );
    }
    const frame = frameResult.frame;
    const cachedFrameReason = frameReason(frame, request);
    if (cachedFrameReason !== null) {
      return rejected('payload', cachedFrameReason, 0, 'non_retryable');
    }
    const payloadResult = await this.planStage({
      prompt: buildConceptPayloadPrompt(request, frame),
      retryPrompt: (reason) =>
        buildConceptPayloadPrompt(request, frame, reason),
      structuredOutput: conceptPayloadStructuredOutputFor(
        request.catalogConcepts.map(({ id }) => id),
        frame.response,
        request.unitRange,
        request.archetype.conceptRoleCardinality,
      ),
      parse: (content) =>
        validateConceptPayloadJson(bindRequestContext(content, request)),
      validate: (payload) => payloadReason(payload, frame, request),
    });
    if (payloadResult.kind === 'rejected') {
      return rejected(
        'payload',
        payloadResult.reason,
        payloadResult.attempts,
        payloadResult.terminal,
        payloadResult.responseKeys,
        payloadResult.validationPath,
      );
    }

    return {
      kind: 'planned',
      frame,
      payload: payloadResult.value,
      attempts: {
        frame: frameResult.attempts,
        payload: payloadResult.attempts,
      },
    };
  }

  private async planStage<T>(
    request: StageRequest<T>,
  ): Promise<StageResult<T>> {
    let attempts = 0;
    let prompt = request.prompt;
    for (;;) {
      attempts += 1;
      const response = await this.modelClient.create(
        prompt,
        request.structuredOutput,
      );
      if (!response.ok) {
        if (
          !response.failure.retryable ||
          attempts >= this.dependencies.maxAttempts
        ) {
          return stageRejected(
            response.failure.reason,
            attempts,
            response.failure.retryable ? 'retry_exhausted' : 'non_retryable',
          );
        }
        await this.waitBeforeRetry(request.retryAdditionalReserveMs);
        continue;
      }

      const choice = response.value.choices[0];
      const refusal = choice?.message.refusal;
      if (refusal !== undefined && refusal !== null) {
        return stageRejected('MODEL_REFUSAL', attempts, 'non_retryable');
      }
      if (choice?.finish_reason === 'length') {
        return stageRejected(
          'MODEL_TRUNCATED_RESPONSE',
          attempts,
          'non_retryable',
        );
      }
      const content = choice?.message.content;
      if (content === undefined || content === null) {
        if (attempts >= this.dependencies.maxAttempts) {
          return stageRejected(
            'MODEL_EMPTY_RESPONSE',
            attempts,
            'retry_exhausted',
          );
        }
        await this.waitBeforeRetry(request.retryAdditionalReserveMs);
        continue;
      }

      const parsed = request.parse(content);
      if (!parsed.ok) {
        if (attempts >= this.dependencies.maxAttempts) {
          this.logger.warn(
            `[REFERENCE-PLANNER] ${parsed.error.code} at ${parsed.error.path}: ${failedContractFragment(content, parsed.error.path)}`,
          );
          return stageRejected(
            parsed.error.code,
            attempts,
            'retry_exhausted',
            parsed.error.code === 'UNKNOWN_FIELD'
              ? responseKeys(content)
              : undefined,
            parsed.error.path,
          );
        }
        prompt = request.retryPrompt?.(parsed.error.code) ?? request.prompt;
        await this.waitBeforeRetry(request.retryAdditionalReserveMs);
        continue;
      }

      const reason = request.validate(parsed.value);
      if (reason === null) {
        return { kind: 'planned', value: parsed.value, attempts };
      }
      if (attempts >= this.dependencies.maxAttempts) {
        return stageRejected(reason, attempts, 'retry_exhausted', undefined);
      }
      prompt = request.retryPrompt?.(reason) ?? request.prompt;
      await this.waitBeforeRetry(request.retryAdditionalReserveMs);
    }
  }

  private async waitBeforeRetry(additionalReserveMs = 0): Promise<void> {
    const deadline = this.dependencies.deadline;
    if (deadline !== undefined) {
      await deadline.waitForRetry(
        'planner',
        this.dependencies.retryDelayMs,
        additionalReserveMs,
      );
      return;
    }
    if (this.dependencies.retryDelayMs > 0) {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, this.dependencies.retryDelayMs);
      });
    }
  }
}

function echoedReferenceFrame(
  request: ReferenceFramePlannerRequest,
  responseKeys: readonly string[] | undefined,
): ReferenceFrame | null {
  if (responseKeys === undefined || request.reference.choices.length !== 5) {
    return null;
  }

  const observedKeySet = new Set(responseKeys);
  if (
    responseKeys.length !== SELECTED_REFERENCE_ECHO_KEYS.length ||
    observedKeySet.size !== SELECTED_REFERENCE_ECHO_KEYS.length ||
    !SELECTED_REFERENCE_ECHO_KEYS.every((key) => observedKeySet.has(key))
  ) {
    return null;
  }
  const paragraphCount = request.reference.stimulus
    .split(/\n\s*\n/)
    .filter((paragraph) => paragraph.trim() !== '').length;
  return {
    source: request.reference.source,
    subject: request.subject,
    unitRange: request.unitRange,
    archetype: request.archetype,
    stem: {
      style: 'reference-derived selection',
      polarity: 'positive',
      languageSignals: ['formal'],
    },
    response: {
      mode: 'single_selection',
      choiceEncoding: 'single_choice',
      choiceCount: 5,
      viewItemCount: 0,
      choiceTopology: 'single_choice',
      combinationPlan: {
        expectedAnswerCount: 5,
        optionCount: 5,
        topology: 'single_choice',
      },
    },
    materialDensity: {
      targetLength: request.reference.stimulus.length,
      paragraphCount,
      namedEntities: 0,
      numericFacts: 0,
      conditionCount: 0,
    },
    informationShape: 'case_profile',
    difficultySignals: ['reference-derived'],
    shell: {
      kind: 'document',
      requiresViewBlock: true,
      requiresChoiceCombination: false,
      requiresStructuredSource: true,
    },
    structureBlueprint: {
      informationUnits: [
        { id: 'unit_1', order: 1, kind: 'context', atomIds: ['atom_1'] },
      ],
      relations: [],
      reasoningSteps: [
        {
          id: 'step_1',
          order: 1,
          operation: 'derive_conclusion',
          unitIds: ['unit_1'],
          dependsOnStepIds: [],
        },
      ],
      itemRoles: request.reference.choices.map((_, index) => ({
        itemKind: 'choice' as const,
        itemIndex: index + 1,
        role: index === 0 ? 'correct' : ('irrelevant' as const),
        unitIds: ['unit_1'],
        reasoningStepIds: ['step_1'],
      })),
      evidenceBlocks: request.reference.choices.map((_, index) => ({
        itemKind: 'choice' as const,
        itemIndex: index + 1,
        role: index === 0 ? 'correct' : ('irrelevant' as const),
        unitIds: ['unit_1'],
        reasoningStepIds: ['step_1'],
      })),
    },
    semanticAtoms: [
      {
        id: 'atom_1',
        subjectSlot: 'actor_a',
        predicateKind: 'has_status',
        operator: 'equals',
        objectSlot: null,
        quantityRole: null,
        polarity: true,
      },
      {
        id: 'atom_2',
        subjectSlot: 'actor_a',
        predicateKind: 'satisfies_condition',
        operator: 'conditional',
        objectSlot: 'process_a',
        quantityRole: null,
        polarity: true,
      },
      {
        id: 'atom_3',
        subjectSlot: 'actor_a',
        predicateKind: 'produces_outcome',
        operator: 'conditional',
        objectSlot: 'artifact_a',
        quantityRole: null,
        polarity: true,
      },
    ],
    groundingLexicon: {
      entities: [
        { slot: 'actor_a', class: 'person' },
        { slot: 'process_a', class: 'process' },
        { slot: 'artifact_a', class: 'artifact' },
      ],
      quantities: [],
      rules: [],
      bindings: [
        {
          atomId: 'atom_1',
          entitySlots: ['actor_a'],
          quantityIds: [],
          ruleIds: [],
        },
        {
          atomId: 'atom_2',
          entitySlots: ['actor_a', 'process_a'],
          quantityIds: [],
          ruleIds: [],
        },
        {
          atomId: 'atom_3',
          entitySlots: ['actor_a', 'artifact_a'],
          quantityIds: [],
          ruleIds: [],
        },
      ],
    },
  };
}

function isSelectedReference(request: ReferenceFramePlannerRequest): boolean {
  return request.selection.references.some((reference) =>
    sameSource(reference.source, request.reference.source),
  );
}

function frameReason(
  frame: ReferenceFrame,
  request: ReferenceFramePlannerRequest,
): PlannerReasonCode | null {
  if (!sameSource(frame.source, request.reference.source)) {
    return 'FRAME_SOURCE_MISMATCH';
  }
  if (
    frame.response.mode !== 'truth_combination' &&
    frame.response.mode !== 'single_selection'
  ) {
    return 'UNSUPPORTED_RESPONSE_MODE';
  }
  const allowedConceptIds = new Set(
    request.catalogConcepts.map(({ id }) => id),
  );
  if (
    frame.groundingLexicon.rules.some(
      (rule) => !allowedConceptIds.has(rule.conceptId),
    )
  ) {
    return 'CONCEPT_OUT_OF_SCOPE';
  }
  return frame.subject !== request.subject ||
    !sameRange(frame.unitRange, request.unitRange)
    ? 'FRAME_SCOPE_MISMATCH'
    : null;
}

function payloadReason(
  payload: ConceptPayload,
  frame: ReferenceFrame,
  request: ReferenceFramePlannerRequest,
): PlannerReasonCode | null {
  if (!sameSource(payload.source, request.reference.source)) {
    return 'PAYLOAD_SOURCE_MISMATCH';
  }
  if (
    payload.subject !== request.subject ||
    !sameRange(payload.unitRange, request.unitRange)
  ) {
    return 'PAYLOAD_SCOPE_MISMATCH';
  }
  if (payload.answerPlan.choiceEncoding !== frame.response.choiceEncoding) {
    return 'PAYLOAD_ANSWER_ENCODING_MISMATCH';
  }
  if (payload.answerPlan.responseMode !== frame.response.mode) {
    return 'PAYLOAD_ANSWER_ENCODING_MISMATCH';
  }
  const archetypePayload = validateConceptPayloadAgainstArchetype(
    payload,
    request.archetype,
  );
  if (!archetypePayload.ok) return archetypePayload.error.code;
  const frameAtomIds = new Set(frame.semanticAtoms.map(({ id }) => id));
  if (
    payload.answerPlan.options.some((option) =>
      option.atomIds.some((atomId) => !frameAtomIds.has(atomId)),
    )
  ) {
    return 'INVALID_FIELD_VALUE';
  }
  if (
    payload.targetConceptIds.length !== 1 ||
    payload.supportingConceptIds.length <
      (request.archetype.conceptRoleCardinality.supporting > 0 ? 1 : 0) ||
    payload.supportingConceptIds.length >
      request.archetype.conceptRoleCardinality.supporting
  ) {
    return 'PAYLOAD_CONCEPT_CARDINALITY_MISMATCH';
  }
  if (
    frame.response.mode === 'truth_combination' &&
    payload.answerPlan.options.length !== frame.response.viewItemCount
  ) {
    return 'PAYLOAD_CLAIM_CARDINALITY_MISMATCH';
  }

  const payloadConcepts = [
    ...payload.targetConceptIds,
    ...payload.supportingConceptIds,
  ];
  const allowedConcepts = new Set(request.catalogConcepts.map(({ id }) => id));
  if (payloadConcepts.some((concept) => !allowedConcepts.has(concept))) {
    return 'CONCEPT_OUT_OF_SCOPE';
  }
  const sourceTargetConceptId =
    request.requiredSourceTargetConceptId ??
    request.requiredSourceConceptIds?.[0];
  if (
    sourceTargetConceptId !== undefined &&
    payload.targetConceptIds[0] !== sourceTargetConceptId
  ) {
    return 'REFERENCE_CONCEPT_REUSE';
  }
  if (
    request.requiredSourceConceptIds !== undefined &&
    payload.supportingConceptIds.some(
      (conceptId) => !request.requiredSourceConceptIds?.includes(conceptId),
    )
  ) {
    return 'REFERENCE_SUPPORTING_CONCEPT_OUT_OF_SCOPE';
  }

  const referenceAxes = new Set(request.referenceDistractorAxes);
  if (payload.distractorAxes.some((axis) => referenceAxes.has(axis))) {
    return 'REFERENCE_AXIS_REUSE';
  }
  const allowedAxes = new Set(request.selection.distractorAxisCatalog);
  if (payload.distractorAxes.some((axis) => !allowedAxes.has(axis))) {
    return 'DISTRACTOR_AXIS_OUT_OF_CATALOG';
  }
  const requiredTransformationFamilies = new Set(
    frame.structureBlueprint.itemRoles
      .map(({ role }) => distractorTransformationFamily(role))
      .filter(
        (family): family is DistractorTransformationFamily => family !== null,
      ),
  );
  return requiredTransformationFamilies.size > 0 &&
    !payload.distractorAxes.some((axis) => {
      const family = distractorTransformationFamily(axis);
      return family !== null && requiredTransformationFamilies.has(family);
    })
    ? 'PAYLOAD_EVIDENCE_BLOCK_MISMATCH'
    : null;
}

type DistractorTransformationFamily =
  'omission' | 'reversal' | 'exception_omission' | 'irrelevant';

function distractorTransformationFamily(
  value: string,
): DistractorTransformationFamily | null {
  if (value.includes('exception')) return 'exception_omission';
  if (value.includes('omission')) return 'omission';
  if (
    value.includes('reversal') ||
    value.includes('shift') ||
    value.includes('swap') ||
    value.includes('misread') ||
    value.includes('inversion')
  ) {
    return 'reversal';
  }
  if (value === 'irrelevant') return 'irrelevant';
  return null;
}

function sameSource(left: SourceIdentity, right: SourceIdentity): boolean {
  return (
    left.sourceId === right.sourceId && left.sourceHash === right.sourceHash
  );
}

function sameRange(left: UnitRange, right: UnitRange): boolean {
  return left.start === right.start && left.end === right.end;
}

function bindRequestContext(
  content: string,
  request: ReferenceFramePlannerRequest,
): string {
  try {
    const parsed: unknown = JSON.parse(content);
    if (!isRecord(parsed)) return content;
    return JSON.stringify(
      canonicalizeFrameRelations({
        ...parsed,
        source: parsed.source ?? request.reference.source,
        subject: parsed.subject ?? request.subject,
        unitRange: parsed.unitRange ?? request.unitRange,
      }),
    );
  } catch (error) {
    if (error instanceof SyntaxError) return content;
    throw error;
  }
}

function canonicalizeFrameRelations(
  frame: Record<string, unknown>,
): Record<string, unknown> {
  const blueprint = frame.structureBlueprint;
  if (
    !isRecord(blueprint) ||
    !Array.isArray(blueprint.informationUnits) ||
    !Array.isArray(blueprint.relations)
  ) {
    return frame;
  }

  const unitKinds = new Map<string, string>();
  for (const unit of blueprint.informationUnits) {
    if (
      isRecord(unit) &&
      typeof unit.id === 'string' &&
      typeof unit.kind === 'string'
    ) {
      unitKinds.set(unit.id, unit.kind);
    }
  }
  const conditionUnitIds = [...unitKinds.entries()]
    .filter(([, kind]) => kind === 'condition')
    .map(([id]) => id);
  const conclusionUnitIds = [...unitKinds.entries()]
    .filter(([, kind]) => kind === 'conclusion')
    .map(([id]) => id);
  const conditionRelationPairs = new Set<string>();
  const relations: unknown[] = [];

  for (const relation of blueprint.relations) {
    if (
      !isRecord(relation) ||
      relation.kind !== 'condition_of' ||
      typeof relation.fromUnitId !== 'string' ||
      typeof relation.toUnitId !== 'string'
    ) {
      relations.push(relation);
      continue;
    }

    const fromUnitId =
      unitKinds.get(relation.fromUnitId) === 'condition'
        ? relation.fromUnitId
        : conditionUnitIds[0];
    const toUnitId =
      unitKinds.get(relation.toUnitId) === 'conclusion'
        ? relation.toUnitId
        : conclusionUnitIds[0];
    if (fromUnitId === undefined || toUnitId === undefined) continue;

    const pair = `${fromUnitId}:${toUnitId}`;
    if (conditionRelationPairs.has(pair)) continue;
    conditionRelationPairs.add(pair);
    relations.push({ ...relation, fromUnitId, toUnitId });
  }

  return {
    ...frame,
    structureBlueprint: { ...blueprint, relations },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function failedContractFragment(content: string, path: string): string {
  try {
    const parsed: unknown = JSON.parse(content);
    if (!isRecord(parsed)) {
      return 'unavailable';
    }
    const match = /(?:semanticAtoms|relations|bindings)\[(\d+)]/.exec(path);
    const index = match === null ? null : Number.parseInt(match[1] ?? '', 10);
    const collection = path.startsWith('referenceFrame.semanticAtoms[')
      ? parsed.semanticAtoms
      : path.startsWith('referenceFrame.structureBlueprint.relations[')
        ? isRecord(parsed.structureBlueprint)
          ? parsed.structureBlueprint.relations
          : undefined
        : path.startsWith('referenceFrame.groundingLexicon.bindings[')
          ? isRecord(parsed.groundingLexicon)
            ? parsed.groundingLexicon.bindings
            : undefined
          : undefined;
    const candidate =
      index === null || !Array.isArray(collection) ? null : collection[index];
    if (!isRecord(candidate)) return 'unavailable';
    const kind = path.startsWith('referenceFrame.semanticAtoms[')
      ? 'semantic_atom'
      : path.startsWith('referenceFrame.structureBlueprint.relations[')
        ? 'blueprint_relation'
        : 'grounding_binding';
    const allowedKeys =
      kind === 'semantic_atom'
        ? [
            'id',
            'subjectSlot',
            'predicateKind',
            'operator',
            'objectSlot',
            'quantityRole',
            'polarity',
          ]
        : kind === 'blueprint_relation'
          ? ['kind', 'fromUnitId', 'toUnitId']
          : ['atomId', 'entitySlots', 'quantityIds', 'ruleIds'];
    return JSON.stringify({
      kind,
      fields: allowedKeys.filter((key) => Object.hasOwn(candidate, key)),
    });
  } catch {
    return 'unavailable';
  }
}

function rejected(
  stage: 'preflight' | 'frame' | 'payload',
  reason: PlannerReasonCode,
  attempts: number,
  terminal: 'preflight' | 'retry_exhausted' | 'non_retryable',
  responseKeys?: readonly string[],
  validationPath?: string,
): ReferenceFramePlannerResult {
  return {
    kind: 'rejected',
    stage,
    reason,
    attempts,
    terminal,
    ...(responseKeys === undefined ? {} : { responseKeys }),
    ...(validationPath === undefined ? {} : { validationPath }),
  };
}

function stageRejected(
  reason: PlannerReasonCode,
  attempts: number,
  terminal: 'retry_exhausted' | 'non_retryable',
  responseKeys?: readonly string[],
  validationPath?: string,
): StageResult<never> {
  return {
    kind: 'rejected',
    reason,
    attempts,
    terminal,
    ...(responseKeys === undefined ? {} : { responseKeys }),
    ...(validationPath === undefined ? {} : { validationPath }),
  };
}

function responseKeys(content: string): readonly string[] | undefined {
  try {
    const parsed: unknown = JSON.parse(content);
    return isRecord(parsed) ? Object.keys(parsed).sort() : undefined;
  } catch (error) {
    if (error instanceof SyntaxError) return undefined;
    throw error;
  }
}
