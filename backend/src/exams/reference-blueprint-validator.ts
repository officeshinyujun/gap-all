import type { ReferenceGenerationBatch } from './reference-blueprint.types';

export type ReferenceBlueprintOutput = Readonly<{
  slotId: string;
  scenarioBrief: string;
  claims: readonly Readonly<{ verdict: boolean }>[];
  answerIndex: number;
}>;

export type ReferenceBlueprintValidationResult =
  | Readonly<{ kind: 'accepted'; slots: readonly ReferenceBlueprintOutput[] }>
  | Readonly<{
      kind: 'rejected';
      reason:
        | 'MISSING_SLOT'
        | 'DUPLICATE_SLOT'
        | 'UNKNOWN_SLOT'
        | 'EMPTY_SCENARIO'
        | 'INCOMPLETE_VERDICT'
        | 'CONCENTRATED_ANSWER_PATTERN';
    }>;

export function validateReferenceBlueprint(
  batch: ReferenceGenerationBatch,
  output: readonly ReferenceBlueprintOutput[],
): ReferenceBlueprintValidationResult {
  const allowed = new Set(batch.slotIds);
  const seen = new Set<string>();
  const answers = new Map<number, number>();
  for (const slot of output) {
    if (!allowed.has(slot.slotId))
      return { kind: 'rejected', reason: 'UNKNOWN_SLOT' };
    if (seen.has(slot.slotId))
      return { kind: 'rejected', reason: 'DUPLICATE_SLOT' };
    if (slot.scenarioBrief.trim().length === 0)
      return { kind: 'rejected', reason: 'EMPTY_SCENARIO' };
    if (slot.claims.length === 0)
      return { kind: 'rejected', reason: 'INCOMPLETE_VERDICT' };
    answers.set(slot.answerIndex, (answers.get(slot.answerIndex) ?? 0) + 1);
    seen.add(slot.slotId);
  }
  if (seen.size !== allowed.size)
    return { kind: 'rejected', reason: 'MISSING_SLOT' };
  if (
    [...answers.values()].some((count) => count > Math.ceil(output.length / 2))
  ) {
    return { kind: 'rejected', reason: 'CONCENTRATED_ANSWER_PATTERN' };
  }
  return { kind: 'accepted', slots: output };
}
