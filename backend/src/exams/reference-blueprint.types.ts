import type { ResponseMode } from './reference-frame.types';
import type {
  SelectedConcept,
  SelectedParsedReference,
} from './reference-selector.service';
import type { StructuredTplName } from './tpl-schemas';

export type ReferenceBlueprintSlot = Readonly<{
  slotId: string;
  reference: SelectedParsedReference;
  targetConcept: SelectedConcept;
  supportingConcepts: readonly SelectedConcept[];
  distractorAxis: string;
  responseMode: ResponseMode;
  template: StructuredTplName;
}>;

export type ReferenceSlotAllocation =
  | Readonly<{ kind: 'allocated'; slots: readonly ReferenceBlueprintSlot[] }>
  | Readonly<{ kind: 'capacity_failure'; reason: 'INSUFFICIENT_REFERENCES' }>;

export type ReferenceGenerationBatch = Readonly<{
  ordinal: number;
  template: StructuredTplName;
  slotIds: readonly string[];
  slots: readonly ReferenceBlueprintSlot[];
}>;
