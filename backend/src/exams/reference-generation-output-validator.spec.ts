import {
  validateReferenceGenerationOutput,
  type ReferenceGeneratedOutput,
} from './reference-generation-output-validator';
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
const question = (
  slotId: string,
  overrides: Partial<ReferenceGeneratedOutput> = {},
): ReferenceGeneratedOutput => ({
  slotId,
  template: 'TPL_CASE_DIAGNOSTIC_FRAME',
  choices: ['1', '2', '3', '4', '5'],
  answerIndex: 1,
  ...overrides,
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

  it.each([
    {
      reason: 'UNKNOWN_SLOT',
      output: [question('unknown'), question('a'), question('b')],
    },
    {
      reason: 'MISSING_SLOT',
      output: [question('a')],
    },
    {
      reason: 'TEMPLATE_MISMATCH',
      output: [
        question('a', { template: 'TPL_ARTICLE' }),
        question('b'),
      ],
    },
    {
      reason: 'INVALID_CHOICES',
      output: [
        question('a', { choices: ['1', '2', '3', '4', ''] }),
        question('b'),
      ],
    },
  ] as const)('$reason is rejected before persistence', ({ reason, output }) => {
    expect(validateReferenceGenerationOutput(batch, output)).toEqual({
      kind: 'rejected',
      reason,
    });
  });

  it('rejects a duplicate slot without relying on missing-slot detection', () => {
    const singleSlotBatch = {
      ...batch,
      slotIds: ['a'] as const,
      slots: [batch.slots[0]!],
    };

    expect(
      validateReferenceGenerationOutput(singleSlotBatch, [
        question('a'),
        question('a'),
      ]),
    ).toEqual({ kind: 'rejected', reason: 'DUPLICATE_SLOT' });
  });
});
