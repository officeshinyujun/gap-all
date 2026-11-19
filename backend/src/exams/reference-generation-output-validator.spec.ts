import { validateReferenceGenerationOutput } from './reference-generation-output-validator';
import type { ReferenceGenerationBatch } from './reference-blueprint.types';

const batch: ReferenceGenerationBatch = {
  ordinal: 1,
  template: 'TPL_CASE_DIAGNOSTIC_FRAME',
  slotIds: ['a', 'b'],
  slots: [
    {
      slotId: 'a',
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
    {
      slotId: 'b',
      reference: {
        source: { sourceId: 's2', sourceHash: 'h2' },
        unitNumber: 1,
        questionNumber: 2,
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
const question = (slotId: string) => ({
  slotId,
  template: 'TPL_CASE_DIAGNOSTIC_FRAME',
  choices: ['1', '2', '3', '4', '5'],
  answerIndex: 1,
});

describe('validateReferenceGenerationOutput', () => {
  it('maps unordered output by slot id and rejects drift', () => {
    expect(
      validateReferenceGenerationOutput(batch, [question('b'), question('a')]),
    ).toMatchObject({
      kind: 'accepted',
      ordered: [question('a'), question('b')],
    });
    expect(validateReferenceGenerationOutput(batch, [question('a')])).toEqual({
      kind: 'rejected',
      reason: 'MISSING_SLOT',
    });
    expect(
      validateReferenceGenerationOutput(batch, [question('a'), question('a')]),
    ).toEqual({ kind: 'rejected', reason: 'DUPLICATE_SLOT' });
  });
});
