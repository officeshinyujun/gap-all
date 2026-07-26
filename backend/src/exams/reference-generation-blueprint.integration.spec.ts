import { chunkReferenceSlots } from './reference-batch-chunker';
import { ReferenceGenerationUsageCollector } from './reference-generation-usage';
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

describe('reference generation blueprint flow', () => {
  it('proves one blueprint plus two five-item generation calls for ten homogeneous slots', () => {
    const batches = chunkReferenceSlots(
      Array.from({ length: 10 }, (_, index) => slot(index + 1)),
    );
    const usage = new ReferenceGenerationUsageCollector();
    usage.record({
      runId: 'run',
      stage: 'blueprint',
      batchOrdinal: 0,
      model: 'mock',
      promptTokens: null,
      completionTokens: null,
      retry: false,
      requestBytes: 1,
    });
    for (const batch of batches)
      usage.record({
        runId: 'run',
        stage: 'generation',
        batchOrdinal: batch.ordinal,
        model: 'mock',
        promptTokens: null,
        completionTokens: null,
        retry: false,
        requestBytes: 1,
      });
    expect(batches.map((batch) => batch.slots.length)).toEqual([5, 5]);
    expect(usage.all()).toHaveLength(3);
  });
});
