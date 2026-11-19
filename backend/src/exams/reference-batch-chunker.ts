import type {
  ReferenceBlueprintSlot,
  ReferenceGenerationBatch,
} from './reference-blueprint.types';

const MAX_BATCH_SIZE = 5;

export function chunkReferenceSlots(
  slots: readonly ReferenceBlueprintSlot[],
): readonly ReferenceGenerationBatch[] {
  const grouped = new Map<string, ReferenceBlueprintSlot[]>();
  for (const slot of slots) {
    const group = grouped.get(slot.template) ?? [];
    group.push(slot);
    grouped.set(slot.template, group);
  }
  const batches: ReferenceGenerationBatch[] = [];
  for (const [template, group] of grouped) {
    for (let start = 0; start < group.length; start += MAX_BATCH_SIZE) {
      const batchSlots = group.slice(start, start + MAX_BATCH_SIZE);
      if (batchSlots.length === 0) continue;
      batches.push({
        ordinal: batches.length + 1,
        template: batchSlots[0]?.template ?? template,
        slotIds: batchSlots.map((slot) => slot.slotId),
        slots: batchSlots,
      });
    }
  }
  return batches;
}
