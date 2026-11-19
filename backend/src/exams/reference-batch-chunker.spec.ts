import { chunkReferenceSlots } from './reference-batch-chunker';
import type { ReferenceBlueprintSlot } from './reference-blueprint.types';

const slot = (index: number): ReferenceBlueprintSlot => ({
  slotId: `slot-${index}`,
  reference: {
    source: { sourceId: `s-${index}`, sourceHash: `h-${index}` },
    unitNumber: 1,
    questionNumber: index,
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
});

describe('chunkReferenceSlots', () => {
  it('splits ten homogeneous slots into two stable five-item batches', () => {
    const batches = chunkReferenceSlots(
      Array.from({ length: 10 }, (_, index) => slot(index + 1)),
    );
    expect(batches.map((batch) => batch.slotIds)).toEqual([
      ['slot-1', 'slot-2', 'slot-3', 'slot-4', 'slot-5'],
      ['slot-6', 'slot-7', 'slot-8', 'slot-9', 'slot-10'],
    ]);
    expect(batches.every((batch) => batch.slots.length <= 5)).toBe(true);
  });

  it('keeps different templates in separate batches', () => {
    const different = {
      ...slot(2),
      template: 'TPL_COMPARATIVE_MATRIX' as const,
    };
    const batches = chunkReferenceSlots([slot(1), different]);
    expect(batches).toHaveLength(2);
    expect(batches.map((batch) => batch.template)).toEqual([
      'TPL_CASE_DIAGNOSTIC_FRAME',
      'TPL_COMPARATIVE_MATRIX',
    ]);
  });
});
