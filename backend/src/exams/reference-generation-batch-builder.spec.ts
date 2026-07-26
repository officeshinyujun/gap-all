import { buildReferenceGenerationBatchRequest } from './reference-generation-batch-builder';
import type { ReferenceGenerationBatch } from './reference-blueprint.types';

const batch: ReferenceGenerationBatch = {
  ordinal: 1,
  template: 'TPL_CASE_DIAGNOSTIC_FRAME',
  slotIds: ['slot-1'],
  slots: [
    {
      slotId: 'slot-1',
      reference: {
        source: { sourceId: 'secret-source', sourceHash: 'secret-hash' },
        unitNumber: 1,
        questionNumber: 1,
        stem: 's',
        stimulus: 'x',
        choices: ['1', '2', '3', '4', '5'],
        targetConcepts: ['c'],
      },
      targetConcept: { concept: 'c', unitNumbers: [1] },
      supportingConcepts: [],
      distractorAxis: 'scope_reversal',
      responseMode: 'single_selection',
      template: 'TPL_CASE_DIAGNOSTIC_FRAME',
    },
  ],
};

describe('buildReferenceGenerationBatchRequest', () => {
  it('emits one TPL schema and no source identity', () => {
    const request = buildReferenceGenerationBatchRequest(batch, [
      {
        slotId: 'slot-1',
        scenarioBrief: 'new',
        claims: [{ verdict: true }],
        answerIndex: 1,
      },
    ]);
    expect(request).toContain('case_diagnostic_frame_item');
    expect(request).not.toContain('secret-source');
    expect(request).not.toContain('secret-hash');
  });
});
