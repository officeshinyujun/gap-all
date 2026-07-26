import type { UnitRange } from './reference-frame.types';
import {
  DEFAULT_DISTRACTOR_AXES,
  type NormalizedSourceReference,
  type ReferenceSelectionResult,
  type ReferenceSelectorRequest,
  type ReferenceSelectorShortfallReason,
  type SelectedConcept,
} from './reference-selector.types';
import {
  compare,
  conceptKey,
  containsUnit,
  isValidUnitRange,
  parseReference,
  selectAxes,
  stableHash,
  uniqueReasons,
  unitNumberFromName,
} from './reference-selector.utils';
export { DEFAULT_DISTRACTOR_AXES } from './reference-selector.types';
export type {
  ReferenceSelectionResult,
  ReferenceSelectorRequest,
  ReferenceSelectorShortfall,
  ReferenceSelectorShortfallReason,
  NormalizedSourceReference,
  SelectedConcept,
  SelectedParsedReference,
} from './reference-selector.types';
type MutableConcept = {
  readonly sourceLabels: Set<string>;
  readonly textbookLabels: Set<string>;
  readonly unitNumbers: Set<number>;
};

export function selectReferences(
  request: ReferenceSelectorRequest,
): ReferenceSelectionResult {
  if (!isValidUnitRange(request.unitRange)) {
    return shortfall(request, 0, ['INVALID_UNIT_RANGE']);
  }
  if (
    !Number.isInteger(request.requestedReferenceCount) ||
    request.requestedReferenceCount <= 0
  ) {
    return shortfall(request, 0, ['INVALID_REQUESTED_REFERENCE_COUNT']);
  }

  const parsedReferences = request.parsedReferences.map((reference) =>
    parseReference(reference, request.subject),
  );
  const invalidReferenceCount = parsedReferences.filter(
    (result) => !result.ok,
  ).length;
  const references = parsedReferences.flatMap((result) =>
    result.ok ? [result.value] : [],
  );
  const inRangeConcepts = new Map<string, MutableConcept>();
  const outOfRangeConcepts = new Set<string>();

  for (const unit of request.unitConcepts) {
    const unitNumber = unitNumberFromName(unit.unitName);
    if (unitNumber !== null) {
      addConcepts(
        unit.concepts,
        unitNumber,
        request.unitRange,
        inRangeConcepts,
        outOfRangeConcepts,
        'textbook',
      );
    }
  }
  for (const reference of references) {
    addConcepts(
      reference.target.concepts,
      reference.unitNumber,
      request.unitRange,
      inRangeConcepts,
      outOfRangeConcepts,
      'source',
    );
  }

  const conceptResult = selectConcepts(
    request.requestedConcepts,
    inRangeConcepts,
    outOfRangeConcepts,
  );
  if (!conceptResult.ok) {
    return shortfall(request, 0, conceptResult.reasons);
  }
  const axisResult = selectAxes(request.requestedDistractorAxes);
  if (!axisResult.ok) {
    return shortfall(request, 0, axisResult.reasons);
  }

  const inRangeReferences = references.filter((reference) =>
    containsUnit(request.unitRange, reference.unitNumber),
  );
  const requestedSourceIds =
    request.sourceIds === undefined ? undefined : new Set(request.sourceIds);
  const uniqueReferences = uniqueBySource(
    requestedSourceIds === undefined
      ? inRangeReferences
      : inRangeReferences.filter((reference) =>
          requestedSourceIds.has(reference.source.sourceId),
        ),
  );
  const eligibleReferences = filterEligibleReferences(
    uniqueReferences,
    request.eligibleReferenceConcepts,
  );
  if (eligibleReferences.length < request.requestedReferenceCount) {
    const reasons: ReferenceSelectorShortfallReason[] = [
      'INSUFFICIENT_REFERENCES',
    ];
    if (invalidReferenceCount > 0) reasons.push('INVALID_REFERENCE');
    if (references.length > inRangeReferences.length) {
      reasons.push('REFERENCE_OUT_OF_RANGE');
    }
    if (eligibleReferences.length < uniqueReferences.length) {
      reasons.push('SOURCE_TARGET_EXCLUDED');
    }
    return shortfall(
      request,
      eligibleReferences.length,
      reasons,
      invalidReferenceCount,
    );
  }

  return {
    kind: 'selected',
    concepts: conceptResult.concepts,
    distractorAxisCatalog: [...DEFAULT_DISTRACTOR_AXES],
    distractorAxes: axisResult.axes,
    sourceRejectedCount: invalidReferenceCount,
    references: request.includeAllEligibleReferences
      ? orderBySeed(eligibleReferences, request.seed)
      : orderBySeed(eligibleReferences, request.seed).slice(
          0,
          request.requestedReferenceCount,
        ),
  };
}

function filterEligibleReferences(
  references: readonly NormalizedSourceReference[],
  eligibleReferenceConcepts: readonly string[] | undefined,
): readonly NormalizedSourceReference[] {
  if (eligibleReferenceConcepts === undefined) return references;
  const eligibleConcepts = new Set(
    eligibleReferenceConcepts
      .map(conceptKey)
      .filter((concept) => concept !== ''),
  );
  return references.filter((reference) => {
    return eligibleConcepts.has(conceptKey(reference.target.primaryConcept));
  });
}

function selectConcepts(
  requestedConcepts: readonly string[],
  inRangeConcepts: ReadonlyMap<string, MutableConcept>,
  outOfRangeConcepts: ReadonlySet<string>,
):
  | Readonly<{ ok: true; concepts: readonly SelectedConcept[] }>
  | Readonly<{
      ok: false;
      reasons: readonly ReferenceSelectorShortfallReason[];
    }> {
  const reasons: ReferenceSelectorShortfallReason[] = [];
  const concepts: SelectedConcept[] = [];
  const seen = new Set<string>();
  for (const requestedConcept of requestedConcepts) {
    const canonical = conceptKey(requestedConcept);
    if (canonical === '' || seen.has(canonical)) continue;
    seen.add(canonical);
    const concept = inRangeConcepts.get(canonical);
    if (concept === undefined) {
      reasons.push(
        outOfRangeConcepts.has(canonical)
          ? 'CONCEPT_OUT_OF_RANGE'
          : 'CONCEPT_NOT_CANONICAL',
      );
    } else {
      const labels =
        concept.textbookLabels.size > 0
          ? concept.textbookLabels
          : concept.sourceLabels;
      if (labels.size !== 1) {
        reasons.push('AMBIGUOUS_CONCEPT');
        continue;
      }
      const [label] = [...labels];
      if (label === undefined) {
        reasons.push('CONCEPT_NOT_CANONICAL');
        continue;
      }
      concepts.push({
        concept: label,
        unitNumbers: [...concept.unitNumbers].sort(
          (left, right) => left - right,
        ),
      });
    }
  }
  return reasons.length > 0 || concepts.length === 0
    ? {
        ok: false,
        reasons: uniqueReasons(
          reasons.length > 0 ? reasons : ['CONCEPT_NOT_CANONICAL'],
        ),
      }
    : {
        ok: true,
        concepts: concepts.sort((left, right) =>
          compare(left.concept, right.concept),
        ),
      };
}

function addConcepts(
  concepts: readonly string[],
  unitNumber: number,
  unitRange: UnitRange,
  inRangeConcepts: Map<string, MutableConcept>,
  outOfRangeConcepts: Set<string>,
  source: 'source' | 'textbook',
): void {
  for (const concept of concepts) {
    const label = conceptKey(concept) === '' ? null : concept.trim();
    const canonical = conceptKey(concept);
    if (label === null || canonical === '') continue;
    if (!containsUnit(unitRange, unitNumber)) {
      outOfRangeConcepts.add(canonical);
      continue;
    }
    const existing = inRangeConcepts.get(canonical) ?? {
      sourceLabels: new Set<string>(),
      textbookLabels: new Set<string>(),
      unitNumbers: new Set<number>(),
    };
    const labels =
      source === 'textbook' ? existing.textbookLabels : existing.sourceLabels;
    labels.add(label);
    existing.unitNumbers.add(unitNumber);
    inRangeConcepts.set(canonical, existing);
  }
}

function uniqueBySource(
  references: readonly NormalizedSourceReference[],
): readonly NormalizedSourceReference[] {
  const sorted = [...references].sort((left, right) => {
    const sourceOrder = compare(left.source.sourceId, right.source.sourceId);
    return sourceOrder === 0
      ? compare(left.source.sourceHash, right.source.sourceHash)
      : sourceOrder;
  });
  const seen = new Set<string>();
  return sorted.filter((reference) => {
    if (seen.has(reference.source.sourceId)) return false;
    seen.add(reference.source.sourceId);
    return true;
  });
}

function orderBySeed(
  references: readonly NormalizedSourceReference[],
  seed: string,
): readonly NormalizedSourceReference[] {
  return [...references].sort((left, right) => {
    const leftRank = stableHash(`${seed}\u0000${left.source.sourceId}`);
    const rightRank = stableHash(`${seed}\u0000${right.source.sourceId}`);
    return leftRank === rightRank
      ? compare(left.source.sourceId, right.source.sourceId)
      : compare(leftRank, rightRank);
  });
}

function shortfall(
  request: ReferenceSelectorRequest,
  availableReferenceCount: number,
  reasons: readonly ReferenceSelectorShortfallReason[],
  sourceRejectedCount = 0,
): ReferenceSelectionResult {
  return {
    kind: 'shortfall',
    shortfall: {
      requestedReferenceCount: request.requestedReferenceCount,
      availableReferenceCount,
      sourceRejectedCount,
      reasons: uniqueReasons(reasons),
    },
  };
}
