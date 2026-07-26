import type { ReferenceGenerationBatch } from './reference-blueprint.types';
import type { ReferenceArchetype } from './reference-archetype';
import type { ConceptPayload, ReferenceFrame } from './reference-frame.types';
import { isRecord } from './reference-frame.validation-utils';

export type ReferenceGeneratedOutput = Readonly<{
  slotId: string;
  template: string;
  choices: readonly string[];
  answerIndex: number;
}>;

export type ReferenceGenerationOutputResult =
  | Readonly<{ kind: 'accepted'; ordered: readonly ReferenceGeneratedOutput[] }>
  | Readonly<{
      kind: 'rejected';
      reason:
        | 'MISSING_SLOT'
        | 'DUPLICATE_SLOT'
        | 'UNKNOWN_SLOT'
        | 'TEMPLATE_MISMATCH'
        | 'INVALID_CHOICES';
    }>;

export type ReferenceArchetypeFidelityInput = Readonly<{
  archetype: ReferenceArchetype;
  structureBlueprint: ReferenceFrame['structureBlueprint'];
  payload: Pick<
    ConceptPayload,
    | 'targetConceptIds'
    | 'supportingConceptIds'
    | 'distractorAxes'
    | 'answerPlan'
  >;
}>;

export type ReferenceArchetypeFidelityResult =
  | Readonly<{ kind: 'accepted' }>
  | Readonly<{
      kind: 'rejected';
      path: string;
      expected: string;
      actual: string;
    }>;

type FidelityMismatch = Extract<
  ReferenceArchetypeFidelityResult,
  { kind: 'rejected' }
>;

function expectedFidelityTrace(
  input: ReferenceArchetypeFidelityInput,
): Record<string, unknown> {
  const { archetype, structureBlueprint, payload } = input;
  return {
    shell: { materialKind: archetype.materialKind, ...archetype.shell },
    evidenceBlocks: structureBlueprint.evidenceBlocks.map((block, index) => ({
      order: index + 1,
      ...block,
    })),
    conceptRoles: {
      targetConceptIds: payload.targetConceptIds,
      supportingConceptIds: payload.supportingConceptIds,
    },
    distractorTransformations: payload.distractorAxes.map((axis) => ({ axis })),
    informationOrder: structureBlueprint.informationUnits.map((unit) => ({
      unitId: unit.id,
      order: unit.order,
      kind: unit.kind,
      atomIds: unit.atomIds,
    })),
    reasoningPattern: archetype.reasoningPattern,
    reasoningSteps: structureBlueprint.reasoningSteps.map((step) => ({
      stepId: step.id,
      order: step.order,
      operation: step.operation,
      unitIds: step.unitIds,
      dependsOnStepIds: step.dependsOnStepIds,
    })),
    combinationPlan: archetype.combinationPlan,
    setLinkage: archetype.setStructure,
    viewItems: archetype.viewKeys.map((key, index) => ({
      order: index + 1,
      key,
    })),
    optionSubsets: payload.answerPlan.options.map((option) => ({
      optionId: option.id,
      verdict: option.verdict,
      atomIds: option.atomIds,
    })),
  };
}

function expectedDescription(value: unknown): string {
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) return `array(length=${value.length})`;
  return isRecord(value) ? 'object' : String(value);
}

function actualDescription(value: unknown): string {
  if (typeof value === 'string') return `string(length=${value.length})`;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) return `array(length=${value.length})`;
  return isRecord(value) ? 'object' : String(value);
}

function mismatch(
  path: string,
  expected: unknown,
  actual: unknown,
): FidelityMismatch {
  return {
    kind: 'rejected',
    path,
    expected: expectedDescription(expected),
    actual: actualDescription(actual),
  };
}

function firstStructuralMismatch(
  expected: unknown,
  actual: unknown,
  path: string,
): FidelityMismatch | null {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) return mismatch(path, expected, actual);
    if (actual.length !== expected.length) {
      return mismatch(`${path}.length`, expected.length, actual.length);
    }
    for (let index = 0; index < expected.length; index += 1) {
      const nestedMismatch = firstStructuralMismatch(
        expected[index],
        actual[index],
        `${path}[${index}]`,
      );
      if (nestedMismatch !== null) return nestedMismatch;
    }
    return null;
  }

  if (isRecord(expected)) {
    if (!isRecord(actual)) return mismatch(path, expected, actual);
    for (const [key, expectedValue] of Object.entries(expected)) {
      const nestedMismatch = firstStructuralMismatch(
        expectedValue,
        actual[key],
        `${path}.${key}`,
      );
      if (nestedMismatch !== null) return nestedMismatch;
    }
    return null;
  }

  return Object.is(expected, actual) ? null : mismatch(path, expected, actual);
}

export function validateReferenceArchetypeFidelity(
  trace: unknown,
  input: ReferenceArchetypeFidelityInput,
): ReferenceArchetypeFidelityResult {
  const traceMismatch = firstStructuralMismatch(
    expectedFidelityTrace(input),
    trace,
    'fidelityTrace',
  );
  return traceMismatch ?? { kind: 'accepted' };
}

export function validateReferenceGenerationOutput(
  batch: ReferenceGenerationBatch,
  output: readonly ReferenceGeneratedOutput[],
): ReferenceGenerationOutputResult {
  const bySlot = new Map<string, ReferenceGeneratedOutput>();
  for (const question of output) {
    if (!batch.slotIds.includes(question.slotId))
      return { kind: 'rejected', reason: 'UNKNOWN_SLOT' };
    if (bySlot.has(question.slotId))
      return { kind: 'rejected', reason: 'DUPLICATE_SLOT' };
    if (question.template !== batch.template)
      return { kind: 'rejected', reason: 'TEMPLATE_MISMATCH' };
    if (
      question.choices.length !== 5 ||
      question.choices.some((choice) => choice.trim().length === 0)
    )
      return { kind: 'rejected', reason: 'INVALID_CHOICES' };
    bySlot.set(question.slotId, question);
  }
  const ordered = batch.slotIds.map((slotId) => bySlot.get(slotId));
  if (ordered.some((question) => question === undefined))
    return { kind: 'rejected', reason: 'MISSING_SLOT' };
  return {
    kind: 'accepted',
    ordered: ordered.filter(
      (question): question is ReferenceGeneratedOutput =>
        question !== undefined,
    ),
  };
}
