import { getTplSchema } from './tpl-schemas';
import type { ReferenceGenerationBatch } from './reference-blueprint.types';
import type { ReferenceBlueprintOutput } from './reference-blueprint-validator';

export function buildReferenceGenerationBatchRequest(
  batch: ReferenceGenerationBatch,
  blueprints: readonly ReferenceBlueprintOutput[],
): string {
  if (batch.slots.length === 0 || batch.slots.length > 5) {
    throw new Error('Generation batch must contain one to five slots.');
  }
  const schema = getTplSchema(batch.template);
  if (schema === null)
    throw new Error('Generation batch requires a structured TPL.');
  return JSON.stringify({
    task: 'Generate validated questions from semantic blueprints.',
    template: batch.template,
    responseSchema: schema,
    questions: blueprints.map((blueprint) => ({
      slotId: blueprint.slotId,
      scenarioBrief: blueprint.scenarioBrief,
      claims: blueprint.claims,
      answerIndex: blueprint.answerIndex,
    })),
  });
}
