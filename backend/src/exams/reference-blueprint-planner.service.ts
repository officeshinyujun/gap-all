import { ReferenceFramePlannerModelClient } from './reference-frame-planner.model-client';
import type { ReferenceFramePlannerDependencies } from './reference-frame-planner.types';
import type { ReferenceGenerationBatch } from './reference-blueprint.types';
import {
  buildReferenceBlueprintPrompt,
  REFERENCE_BLUEPRINT_SCHEMA,
} from './reference-blueprint.provider-schema';
import {
  validateReferenceBlueprint,
  type ReferenceBlueprintOutput,
} from './reference-blueprint-validator';

export type ReferenceBlueprintPlannerResult =
  | Readonly<{
      kind: 'planned';
      slots: readonly ReferenceBlueprintOutput[];
      attempts: number;
    }>
  | Readonly<{ kind: 'rejected'; reason: string; attempts: number }>;

export class ReferenceBlueprintPlannerService {
  private readonly client: ReferenceFramePlannerModelClient;

  constructor(
    private readonly dependencies: ReferenceFramePlannerDependencies,
  ) {
    this.client = new ReferenceFramePlannerModelClient(dependencies);
  }

  async plan(
    batch: ReferenceGenerationBatch,
  ): Promise<ReferenceBlueprintPlannerResult> {
    for (
      let attempts = 1;
      attempts <= Math.min(this.dependencies.maxAttempts, 2);
      attempts += 1
    ) {
      const response = await this.client.create(
        buildReferenceBlueprintPrompt(batch),
        REFERENCE_BLUEPRINT_SCHEMA,
      );
      if (!response.ok) {
        if (
          !response.failure.retryable ||
          attempts === Math.min(this.dependencies.maxAttempts, 2)
        ) {
          return {
            kind: 'rejected',
            reason: response.failure.reason,
            attempts,
          };
        }
        continue;
      }
      const content = response.value.choices[0]?.message.content;
      if (content === null || content === undefined)
        return { kind: 'rejected', reason: 'MODEL_EMPTY_RESPONSE', attempts };
      const parsed = parseSlots(content);
      if (parsed === null)
        return { kind: 'rejected', reason: 'INVALID_BLUEPRINT', attempts };
      const validated = validateReferenceBlueprint(batch, parsed);
      return validated.kind === 'accepted'
        ? { kind: 'planned', slots: validated.slots, attempts }
        : { kind: 'rejected', reason: validated.reason, attempts };
    }
    return { kind: 'rejected', reason: 'MODEL_REQUEST_FAILED', attempts: 0 };
  }
}

function parseSlots(
  content: string,
): readonly ReferenceBlueprintOutput[] | null {
  try {
    const parsed: unknown = JSON.parse(content);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('slots' in parsed) ||
      !Array.isArray(parsed.slots)
    )
      return null;
    return parsed.slots.every(isBlueprintOutput) ? parsed.slots : null;
  } catch {
    return null;
  }
}

function isBlueprintOutput(value: unknown): value is ReferenceBlueprintOutput {
  if (typeof value !== 'object' || value === null) return false;
  if (!('slotId' in value) || typeof value.slotId !== 'string') return false;
  if (!('scenarioBrief' in value) || typeof value.scenarioBrief !== 'string')
    return false;
  if (!('answerIndex' in value) || typeof value.answerIndex !== 'number')
    return false;
  return (
    'claims' in value &&
    Array.isArray(value.claims) &&
    value.claims.every(
      (claim) =>
        typeof claim === 'object' &&
        claim !== null &&
        'verdict' in claim &&
        typeof claim.verdict === 'boolean',
    )
  );
}
