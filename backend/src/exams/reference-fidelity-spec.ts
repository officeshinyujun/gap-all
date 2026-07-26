import type { ReferenceArchetype } from './reference-archetype';
import type {
  AnswerPlan,
  ContractValidationResult,
  ReferenceStructureBlueprint,
  SourceIdentity,
} from './reference-frame.types';

export const REFERENCE_FIDELITY_SPEC_VERSION = 1 as const;

export type ReferenceFidelitySource = Readonly<{
  source: SourceIdentity;
  stem: string;
  stimulus: string;
  viewItems: readonly string[];
  choices: readonly string[];
  targetConcepts: readonly string[];
}>;

export type ReferenceFidelityDetails = Readonly<{
  structureBlueprint: ReferenceStructureBlueprint;
  answerPlan: AnswerPlan;
  targetConceptIds: readonly string[];
  allowedTerminology?: readonly string[];
}>;

export type ReferenceFidelityOptionMapping = Readonly<{
  optionId: string;
  itemIndex: number;
  verdict: boolean;
  role: ReferenceStructureBlueprint['itemRoles'][number]['role'];
  unitIds: readonly string[];
  reasoningStepIds: readonly string[];
}>;

export type ReferenceFidelitySpec = Readonly<{
  version: typeof REFERENCE_FIDELITY_SPEC_VERSION;
  source: SourceIdentity;
  targetConcepts: readonly string[];
  targetConceptIds: readonly string[];
  response: Readonly<{
    choiceCount: number;
    viewItemCount: number;
    choiceTopology: ReferenceArchetype['choiceTopology'];
    responseMode: ReferenceArchetype['responseMode'];
  }>;
  density: Readonly<{
    stimulusLength: number;
    paragraphCount: number;
    numericFactCount: number;
    conditionSignalCount: number;
  }>;
  structure: Readonly<{
    informationUnits: ReferenceStructureBlueprint['informationUnits'];
    relations: ReferenceStructureBlueprint['relations'];
    reasoningSteps: ReferenceStructureBlueprint['reasoningSteps'];
    optionMappings: readonly ReferenceFidelityOptionMapping[];
  }>;
  allowedTerminology: readonly string[];
  protectedSourceSegments: readonly string[];
}>;

export type ReferenceFidelityValidationError = Readonly<{
  code:
    | 'SOURCE_MISMATCH'
    | 'STALE_CONTRACT_VERSION'
    | 'INVALID_TARGET_CONCEPTS'
    | 'UNKNOWN_TARGET_CONCEPT'
    | 'RESPONSE_TOPOLOGY_MISMATCH'
    | 'DUPLICATE_UNIT_ID'
    | 'INVALID_RELATION'
    | 'CYCLIC_RELATION'
    | 'INCOMPLETE_OPTION_MAPPING';
  path: string;
}>;

export type ReferenceFidelitySpecExpectation = Readonly<{
  source: SourceIdentity;
  version: number;
  targetConceptIds: readonly string[];
  response: ReferenceFidelitySpec['response'];
}>;

const CONDITION_SIGNAL = /(?:단,|조건|요건|경우|예외|이면|하면)/g;
const NUMBER = /\d+(?:[.,]\d+)?/g;

export function buildReferenceFidelitySpec(
  source: ReferenceFidelitySource,
  archetype: ReferenceArchetype,
  details: ReferenceFidelityDetails,
): ReferenceFidelitySpec {
  const spec: ReferenceFidelitySpec = {
    version: REFERENCE_FIDELITY_SPEC_VERSION,
    source: source.source,
    targetConcepts: [...source.targetConcepts],
    targetConceptIds: [...details.targetConceptIds],
    response: {
      choiceCount: archetype.choiceCount,
      viewItemCount: archetype.viewItemCount,
      choiceTopology: archetype.choiceTopology,
      responseMode: archetype.responseMode,
    },
    density: {
      stimulusLength: source.stimulus.trim().length,
      paragraphCount: paragraphCount(source.stimulus),
      numericFactCount: countMatches(source.stimulus, NUMBER),
      conditionSignalCount: countMatches(source.stimulus, CONDITION_SIGNAL),
    },
    structure: buildStructure(details.structureBlueprint, details.answerPlan),
    allowedTerminology: [
      ...source.targetConcepts,
      ...(details.allowedTerminology ?? []),
    ],
    protectedSourceSegments: sourceSegments(source),
  };
  const validation = validateReferenceFidelitySpec(spec, {
    source: source.source,
    version: REFERENCE_FIDELITY_SPEC_VERSION,
    targetConceptIds: details.targetConceptIds,
    response: spec.response,
  });
  if (validation.kind === 'rejected') {
    throw new ReferenceFidelitySpecError(validation.error);
  }
  return spec;
}

export function validateReferenceFidelitySpec(
  spec: ReferenceFidelitySpec,
  expected: ReferenceFidelitySpecExpectation,
): Readonly<
  | { kind: 'accepted' }
  | { kind: 'rejected'; error: ReferenceFidelityValidationError }
> {
  if (spec.version !== expected.version) {
    return {
      kind: 'rejected',
      error: { code: 'STALE_CONTRACT_VERSION', path: 'version' },
    };
  }
  if (
    spec.source.sourceId !== expected.source.sourceId ||
    spec.source.sourceHash !== expected.source.sourceHash
  ) {
    return {
      kind: 'rejected',
      error: { code: 'SOURCE_MISMATCH', path: 'source' },
    };
  }
  if (spec.targetConcepts.length !== 1 || spec.targetConceptIds.length !== 1) {
    return {
      kind: 'rejected',
      error: { code: 'INVALID_TARGET_CONCEPTS', path: 'targetConceptIds' },
    };
  }
  if (
    expected.targetConceptIds.length !== 1 ||
    spec.targetConceptIds[0] !== expected.targetConceptIds[0]
  ) {
    return {
      kind: 'rejected',
      error: { code: 'UNKNOWN_TARGET_CONCEPT', path: 'targetConceptIds[0]' },
    };
  }
  if (!sameResponse(spec.response, expected.response)) {
    return {
      kind: 'rejected',
      error: { code: 'RESPONSE_TOPOLOGY_MISMATCH', path: 'response' },
    };
  }
  const structureError = validateStructure(spec.structure, spec.response);
  return structureError === null
    ? { kind: 'accepted' }
    : { kind: 'rejected', error: structureError };
}

export function parseReferenceFidelitySpec(
  input: unknown,
): ContractValidationResult<ReferenceFidelitySpec> {
  if (!isRecord(input)) return invalid('INVALID_OBJECT', 'fidelitySpec');
  if (input.version !== REFERENCE_FIDELITY_SPEC_VERSION) {
    return invalid('INVALID_FIELD_VALUE', 'fidelitySpec.version');
  }
  if (!isSourceIdentity(input.source)) {
    return invalid('INVALID_FIELD_VALUE', 'fidelitySpec.source');
  }
  if (
    !isStringList(input.targetConcepts) ||
    input.targetConcepts.length !== 1
  ) {
    return invalid(
      'PAYLOAD_CONCEPT_ROLE_MISMATCH',
      'fidelitySpec.targetConcepts',
    );
  }
  if (
    !isStringList(input.targetConceptIds) ||
    input.targetConceptIds.length !== 1
  ) {
    return invalid(
      'PAYLOAD_CONCEPT_ROLE_MISMATCH',
      'fidelitySpec.targetConceptIds',
    );
  }
  if (!isResponse(input.response)) {
    return invalid('INVALID_FIELD_VALUE', 'fidelitySpec.response');
  }
  if (!isStructure(input.structure)) {
    return invalid('INVALID_STRUCTURE_BLUEPRINT', 'fidelitySpec.structure');
  }
  if (
    !isDensity(input.density) ||
    !isStringList(input.allowedTerminology) ||
    !isStringList(input.protectedSourceSegments)
  ) {
    return invalid('INVALID_FIELD_VALUE', 'fidelitySpec');
  }
  const error = validateStructure(input.structure, input.response);
  if (error !== null) return invalid('INVALID_STRUCTURE_BLUEPRINT', error.path);
  if (!isReferenceFidelitySpec(input)) {
    return invalid('INVALID_FIELD_VALUE', 'fidelitySpec');
  }
  return { ok: true, value: input };
}

function buildStructure(
  blueprint: ReferenceStructureBlueprint,
  answerPlan: AnswerPlan,
): ReferenceFidelitySpec['structure'] {
  const roles = new Map(
    blueprint.itemRoles
      .filter(({ itemKind }) => itemKind === 'choice')
      .map((role) => [role.itemIndex, role]),
  );
  return {
    informationUnits: [...blueprint.informationUnits],
    relations: [...blueprint.relations],
    reasoningSteps: [...blueprint.reasoningSteps],
    optionMappings: answerPlan.options.map((option, index) => {
      const role = roles.get(index + 1);
      return {
        optionId: option.id,
        itemIndex: index + 1,
        verdict: option.verdict,
        role: role?.role ?? 'irrelevant',
        unitIds: role?.unitIds ?? [],
        reasoningStepIds: role?.reasoningStepIds ?? [],
      };
    }),
  };
}

function validateStructure(
  structure: Pick<
    ReferenceFidelitySpec['structure'],
    'informationUnits' | 'relations' | 'reasoningSteps' | 'optionMappings'
  >,
  response: ReferenceFidelitySpec['response'],
): ReferenceFidelityValidationError | null {
  const unitIds = structure.informationUnits.map(({ id }) => id);
  const stepIds = structure.reasoningSteps.map(({ id }) => id);
  if (new Set(unitIds).size !== unitIds.length) {
    return { code: 'DUPLICATE_UNIT_ID', path: 'structure.informationUnits' };
  }
  if (new Set(stepIds).size !== stepIds.length) {
    return { code: 'INVALID_RELATION', path: 'structure.reasoningSteps' };
  }
  if (
    structure.relations.some(
      ({ fromUnitId, toUnitId }) =>
        !unitIds.includes(fromUnitId) || !unitIds.includes(toUnitId),
    )
  ) {
    return { code: 'INVALID_RELATION', path: 'structure.relations' };
  }
  if (hasCycle(unitIds, structure.relations)) {
    return { code: 'CYCLIC_RELATION', path: 'structure.relations' };
  }
  const optionIds = structure.optionMappings.map(({ optionId }) => optionId);
  const itemIndexes = structure.optionMappings.map(
    ({ itemIndex }) => itemIndex,
  );
  const requiredOptionCount =
    response.responseMode === 'truth_combination'
      ? response.viewItemCount
      : response.choiceCount;
  if (
    optionIds.length !== requiredOptionCount ||
    new Set(optionIds).size !== optionIds.length ||
    new Set(itemIndexes).size !== itemIndexes.length ||
    structure.optionMappings.some(
      (option) =>
        !Number.isInteger(option.itemIndex) ||
        option.itemIndex < 1 ||
        option.itemIndex > requiredOptionCount ||
        option.unitIds.length === 0 ||
        option.reasoningStepIds.length === 0 ||
        option.unitIds.some((id) => !unitIds.includes(id)) ||
        option.reasoningStepIds.some((id) => !stepIds.includes(id)),
    )
  ) {
    return {
      code: 'INCOMPLETE_OPTION_MAPPING',
      path: 'structure.optionMappings',
    };
  }
  return null;
}

function hasCycle(
  unitIds: readonly string[],
  relations: ReferenceFidelitySpec['structure']['relations'],
): boolean {
  const outgoing = new Map<string, string[]>();
  for (const id of unitIds) outgoing.set(id, []);
  for (const relation of relations)
    outgoing.get(relation.fromUnitId)?.push(relation.toUnitId);
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (id: string): boolean => {
    if (visiting.has(id)) return true;
    if (visited.has(id)) return false;
    visiting.add(id);
    for (const next of outgoing.get(id) ?? []) if (visit(next)) return true;
    visiting.delete(id);
    visited.add(id);
    return false;
  };
  return unitIds.some(visit);
}

function paragraphCount(stimulus: string): number {
  return Math.max(
    stimulus.split(/\n\s*\n/).filter((paragraph) => paragraph.trim().length > 0)
      .length,
    1,
  );
}

function countMatches(value: string, pattern: RegExp): number {
  pattern.lastIndex = 0;
  return value.match(pattern)?.length ?? 0;
}

function sourceSegments(source: ReferenceFidelitySource): readonly string[] {
  return [
    source.stimulus,
    ...source.viewItems,
    ...source.choices.filter((choice) => choice.trim().length >= 24),
  ]
    .flatMap((value) => value.split(/[.!?]\s*/))
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSourceIdentity(value: unknown): value is SourceIdentity {
  return (
    isRecord(value) &&
    typeof value.sourceId === 'string' &&
    value.sourceId.length > 0 &&
    typeof value.sourceHash === 'string' &&
    value.sourceHash.length > 0
  );
}

function isStringList(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === 'string')
  );
}

function isDensity(value: unknown): value is ReferenceFidelitySpec['density'] {
  return (
    isRecord(value) &&
    typeof value.stimulusLength === 'number' &&
    typeof value.paragraphCount === 'number' &&
    typeof value.numericFactCount === 'number' &&
    typeof value.conditionSignalCount === 'number'
  );
}

function isResponse(
  value: unknown,
): value is ReferenceFidelitySpec['response'] {
  return (
    isRecord(value) &&
    typeof value.choiceCount === 'number' &&
    typeof value.viewItemCount === 'number' &&
    typeof value.choiceTopology === 'string' &&
    typeof value.responseMode === 'string'
  );
}

function isStructure(
  value: unknown,
): value is ReferenceFidelitySpec['structure'] {
  if (!isRecord(value)) return false;
  return (
    isInformationUnits(value.informationUnits) &&
    isRelations(value.relations) &&
    isReasoningSteps(value.reasoningSteps) &&
    isOptionMappings(value.optionMappings)
  );
}

function isReferenceFidelitySpec(
  value: unknown,
): value is ReferenceFidelitySpec {
  return (
    isRecord(value) &&
    value.version === REFERENCE_FIDELITY_SPEC_VERSION &&
    isSourceIdentity(value.source) &&
    isStringList(value.targetConcepts) &&
    isStringList(value.targetConceptIds) &&
    isResponse(value.response) &&
    isDensity(value.density) &&
    isStructure(value.structure) &&
    isStringList(value.allowedTerminology) &&
    isStringList(value.protectedSourceSegments)
  );
}

function isInformationUnits(
  value: unknown,
): value is ReferenceFidelitySpec['structure']['informationUnits'] {
  return (
    Array.isArray(value) &&
    value.every(
      (unit) =>
        isRecord(unit) &&
        typeof unit.id === 'string' &&
        typeof unit.order === 'number' &&
        typeof unit.kind === 'string' &&
        isStringList(unit.atomIds),
    )
  );
}

function isRelations(
  value: unknown,
): value is ReferenceFidelitySpec['structure']['relations'] {
  return (
    Array.isArray(value) &&
    value.every(
      (relation) =>
        isRecord(relation) &&
        typeof relation.kind === 'string' &&
        typeof relation.fromUnitId === 'string' &&
        typeof relation.toUnitId === 'string',
    )
  );
}

function isReasoningSteps(
  value: unknown,
): value is ReferenceFidelitySpec['structure']['reasoningSteps'] {
  return (
    Array.isArray(value) &&
    value.every(
      (step) =>
        isRecord(step) &&
        typeof step.id === 'string' &&
        typeof step.order === 'number' &&
        typeof step.operation === 'string' &&
        isStringList(step.unitIds) &&
        isStringList(step.dependsOnStepIds),
    )
  );
}

function isOptionMappings(
  value: unknown,
): value is readonly ReferenceFidelityOptionMapping[] {
  return (
    Array.isArray(value) &&
    value.every(
      (option) =>
        isRecord(option) &&
        typeof option.optionId === 'string' &&
        typeof option.itemIndex === 'number' &&
        typeof option.verdict === 'boolean' &&
        typeof option.role === 'string' &&
        isStringList(option.unitIds) &&
        isStringList(option.reasoningStepIds),
    )
  );
}

function sameResponse(
  left: ReferenceFidelitySpec['response'],
  right: ReferenceFidelitySpec['response'],
): boolean {
  return (
    left.choiceCount === right.choiceCount &&
    left.viewItemCount === right.viewItemCount &&
    left.choiceTopology === right.choiceTopology &&
    left.responseMode === right.responseMode
  );
}

export class ReferenceFidelitySpecError extends Error {
  constructor(error: ReferenceFidelityValidationError) {
    super(`${error.code}:${error.path}`);
    this.name = 'ReferenceFidelitySpecError';
  }
}

function invalid(
  code:
    | 'INVALID_OBJECT'
    | 'INVALID_FIELD_VALUE'
    | 'PAYLOAD_CONCEPT_ROLE_MISMATCH'
    | 'INVALID_STRUCTURE_BLUEPRINT',
  path: string,
): ContractValidationResult<ReferenceFidelitySpec> {
  return { ok: false, error: { code, path } };
}
