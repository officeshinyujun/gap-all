import {
  buildReferenceBlueprintPrompt,
  REFERENCE_BLUEPRINT_SCHEMA,
} from './reference-blueprint.provider-schema';
import type { ReferenceGenerationBatch } from './reference-blueprint.types';

const batch = {
  ordinal: 1,
  template: 'TPL_CASE_DIAGNOSTIC_FRAME',
  slotIds: ['slot-1'],
  slots: [
    {
      slotId: 'slot-1',
      reference: {
        source: { sourceId: 's', sourceHash: 'h' },
        unitNumber: 1,
        questionNumber: 1,
        stem: 'stem',
        stimulus: 'x'.repeat(900),
        choices: ['1', '2', '3', '4', '5'],
        targetConcepts: ['old'],
      },
      targetConcept: { concept: 'new', unitNumbers: [1] },
      supportingConcepts: [],
      distractorAxis: 'scope_reversal',
      responseMode: 'single_selection',
      template: 'TPL_CASE_DIAGNOSTIC_FRAME',
    },
  ],
} as const satisfies ReferenceGenerationBatch;

describe('reference blueprint provider contract', () => {
  it('uses a strict schema and emits one template with compact assigned slots', () => {
    const prompt = JSON.parse(buildReferenceBlueprintPrompt(batch)) as Record<
      string,
      unknown
    >;
    expect(REFERENCE_BLUEPRINT_SCHEMA.schema.additionalProperties).toBe(false);
    expect(prompt.template).toBe('TPL_CASE_DIAGNOSTIC_FRAME');
    expect(JSON.stringify(prompt)).not.toContain('sourceId');
    expect(JSON.stringify(prompt)).not.toContain('sourceHash');
    expect(
      (prompt.slots as Array<Record<string, string>>)[0]?.stimulusExcerpt,
    ).toHaveLength(800);
  });
});
