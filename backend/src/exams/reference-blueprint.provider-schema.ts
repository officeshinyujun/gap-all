import type { StructuredOutputDescriptor } from './reference-frame.provider-schemas';
import type { ReferenceGenerationBatch } from './reference-blueprint.types';

const stringSchema = { type: 'string', minLength: 1 } as const;

export const REFERENCE_BLUEPRINT_SCHEMA: StructuredOutputDescriptor = {
  name: 'reference_generation_blueprint',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      slots: {
        type: 'array',
        items: {
          type: 'object',
          properties: { slotId: stringSchema, scenarioBrief: stringSchema },
          required: ['slotId', 'scenarioBrief'],
          additionalProperties: false,
        },
      },
    },
    required: ['slots'],
    additionalProperties: false,
  },
};

export function buildReferenceBlueprintPrompt(
  batch: ReferenceGenerationBatch,
): string {
  return JSON.stringify({
    task: 'Create semantic blueprints for assigned slots only.',
    template: batch.template,
    slots: batch.slots.map((slot) => ({
      slotId: slot.slotId,
      targetConcept: slot.targetConcept.concept,
      distractorAxis: slot.distractorAxis,
      stem: slot.reference.stem,
      choices: slot.reference.choices,
      stimulusExcerpt: excerpt(slot.reference.stimulus),
    })),
  });
}

function excerpt(stimulus: string): string {
  return stimulus.length <= 800
    ? stimulus
    : `${stimulus.slice(0, 400)}${stimulus.slice(-400)}`;
}
