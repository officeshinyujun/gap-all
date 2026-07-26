import type { UnitConcepts } from '../textbook/textbook.service';
import type {
  SourceIdentity,
  SubjectStyle,
  UnitRange,
} from './reference-frame.types';
import type { ReferenceArchetype } from './reference-archetype';

export const DEFAULT_DISTRACTOR_AXES = [
  'condition_omission',
  'scope_reversal',
  'causal_reversal',
  'criterion_substitution',
  'sequence_inversion',
] as const;

export type ReferenceSelectorShortfallReason =
  | 'AMBIGUOUS_CONCEPT'
  | 'AXIS_NOT_ALLOWED'
  | 'CONCEPT_NOT_CANONICAL'
  | 'CONCEPT_OUT_OF_RANGE'
  | 'INVALID_REQUESTED_REFERENCE_COUNT'
  | 'INSUFFICIENT_REFERENCES'
  | 'INVALID_REFERENCE'
  | 'INVALID_UNIT_RANGE'
  | 'REFERENCE_OUT_OF_RANGE'
  | 'SOURCE_TARGET_EXCLUDED';

export type ReferenceSelectorRequest = Readonly<{
  subject: SubjectStyle;
  unitRange: UnitRange;
  requestedConcepts: readonly string[];
  requestedDistractorAxes: readonly string[];
  requestedReferenceCount: number;
  includeAllEligibleReferences?: boolean;
  seed: string;
  unitConcepts: readonly UnitConcepts[];
  parsedReferences: readonly unknown[];
  sourceIds?: readonly string[];
  eligibleReferenceConcepts?: readonly string[];
}>;

export type SelectedConcept = Readonly<{
  concept: string;
  unitNumbers: readonly number[];
}>;

export type NormalizedSourceTarget = Readonly<{
  primaryConcept: string;
  concepts: readonly [string];
}>;

export type SelectedParsedReference = Readonly<{
  source: SourceIdentity;
  unitNumber: number;
  questionNumber: number;
  stem: string;
  stimulus: string;
  viewItems?: readonly string[];
  choices: readonly string[];
  targetConcepts: readonly string[];
  archetype?: ReferenceArchetype;
}>;

export type NormalizedSourceReference = SelectedParsedReference &
  Readonly<{
    target: NormalizedSourceTarget;
    targetConcepts: readonly [string];
  }>;

export type ReferenceSelectorShortfall = Readonly<{
  requestedReferenceCount: number;
  availableReferenceCount: number;
  sourceRejectedCount: number;
  reasons: readonly ReferenceSelectorShortfallReason[];
}>;

export type ReferenceSelectionResult =
  | Readonly<{
      kind: 'selected';
      concepts: readonly SelectedConcept[];
      distractorAxisCatalog: readonly string[];
      distractorAxes: readonly string[];
      sourceRejectedCount?: number;
      references: readonly NormalizedSourceReference[];
    }>
  | Readonly<{ kind: 'shortfall'; shortfall: ReferenceSelectorShortfall }>;
