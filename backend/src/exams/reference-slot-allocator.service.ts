import { CANONICAL_TPL_BY_INFORMATION_SHAPE } from './reference-tpl-selector';
import type { ReferenceSlotAllocation } from './reference-blueprint.types';
import type { SelectedReferenceSelection } from './reference-frame-planner.types';

export function allocateReferenceSlots(
  selection: SelectedReferenceSelection,
  requestedCount: number,
): ReferenceSlotAllocation {
  if (
    !Number.isInteger(requestedCount) ||
    requestedCount <= 0 ||
    selection.references.length < requestedCount
  ) {
    return { kind: 'capacity_failure', reason: 'INSUFFICIENT_REFERENCES' };
  }
  const slots = selection.references
    .slice(0, requestedCount)
    .map((reference, index) => {
      const targetConcept =
        selection.concepts[index % selection.concepts.length];
      const distractorAxis =
        selection.distractorAxes[index % selection.distractorAxes.length];
      if (targetConcept === undefined || distractorAxis === undefined) {
        throw new Error(
          'Selected references require concepts and distractor axes.',
        );
      }
      return {
        slotId: `slot-${index + 1}`,
        reference,
        targetConcept,
        supportingConcepts: selection.concepts.filter(
          (concept) => concept !== targetConcept,
        ),
        distractorAxis,
        responseMode: 'single_selection' as const,
        template: CANONICAL_TPL_BY_INFORMATION_SHAPE.case_profile,
      };
    });
  return { kind: 'allocated', slots };
}
