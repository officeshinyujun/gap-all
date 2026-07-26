import { validateReferenceBlueprint } from './reference-blueprint-validator';
import type { ReferenceGenerationBatch } from './reference-blueprint.types';

const batch: ReferenceGenerationBatch = {
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

describe('validateReferenceBlueprint', () => {
  it('accepts exact slot coverage and rejects drift', () => {
    const valid = {
      slotId: 'slot-1',
      scenarioBrief: 'new scenario',
      claims: [{ verdict: true }],
      answerIndex: 1,
    };
    expect(validateReferenceBlueprint(batch, [valid]).kind).toBe('accepted');
    expect(
      validateReferenceBlueprint(batch, [{ ...valid, slotId: 'slot-2' }]),
    ).toEqual({ kind: 'rejected', reason: 'UNKNOWN_SLOT' });
    expect(validateReferenceBlueprint(batch, [])).toEqual({
      kind: 'rejected',
      reason: 'MISSING_SLOT',
    });
    expect(
      validateReferenceBlueprint(batch, [{ ...valid, scenarioBrief: '' }]),
    ).toEqual({ kind: 'rejected', reason: 'EMPTY_SCENARIO' });
    expect(
      validateReferenceBlueprint(batch, [{ ...valid, claims: [] }]),
    ).toEqual({ kind: 'rejected', reason: 'INCOMPLETE_VERDICT' });
  });
});
