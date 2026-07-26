import type { ReferenceFidelitySpec } from './reference-fidelity-spec';

export type ReferenceCopyPolicyMatch = Readonly<{
  protectedSegmentIndex: number;
  sourceStart: number;
  renderedStart: number;
  length: number;
  overlap: string;
}>;

export type ReferenceCopyPolicyResult =
  | Readonly<{ kind: 'accepted' }>
  | Readonly<{
      kind: 'rejected';
      reason: 'VERBATIM_SOURCE_SEGMENT';
      matches: readonly ReferenceCopyPolicyMatch[];
    }>;

export type ReferenceDensityResult =
  | Readonly<{ kind: 'accepted' }>
  | Readonly<{
      kind: 'rejected';
      reason: 'INSUFFICIENT_STIMULUS_DENSITY' | 'EXCESSIVE_STIMULUS_DENSITY';
    }>;

const COPY_PROTECTED_SEGMENT_MINIMUM_LENGTH = 24;
const COPY_OVERLAP_MINIMUM_LENGTH = 48;
const COPY_OVERLAP_RATIO = 0.8;

export function validateReferenceCopyPolicy(
  spec: ReferenceFidelitySpec,
  renderedText: string,
): ReferenceCopyPolicyResult {
  const normalizedRendered = normalize(renderedText);
  const allowedTerms = new Set(spec.targetConcepts.map(normalize));
  const matches: ReferenceCopyPolicyMatch[] = [];
  for (const [
    protectedSegmentIndex,
    segment,
  ] of spec.protectedSourceSegments.entries()) {
    const normalizedSegment = normalize(segment);
    if (allowedTerms.has(normalizedSegment)) continue;
    const match = firstUnapprovedOverlap(normalizedRendered, normalizedSegment);
    if (match !== undefined) {
      matches.push({ protectedSegmentIndex, ...match });
    }
  }
  if (matches.length > 0) {
    return { kind: 'rejected', reason: 'VERBATIM_SOURCE_SEGMENT', matches };
  }
  return { kind: 'accepted' };
}

export function validateReferenceDensity(
  spec: ReferenceFidelitySpec,
  stimulusText: string,
): ReferenceDensityResult {
  const minimumLength = Math.max(
    12,
    Math.ceil(spec.density.stimulusLength * 0.5),
  );
  const maximumLength = Math.max(
    minimumLength,
    Math.ceil(spec.density.stimulusLength * 20),
  );
  const normalizedLength = normalize(stimulusText).length;
  if (normalizedLength < minimumLength) {
    return { kind: 'rejected', reason: 'INSUFFICIENT_STIMULUS_DENSITY' };
  }
  if (normalizedLength > maximumLength) {
    return { kind: 'rejected', reason: 'EXCESSIVE_STIMULUS_DENSITY' };
  }
  return { kind: 'accepted' };
}

function firstUnapprovedOverlap(
  rendered: string,
  segment: string,
): Omit<ReferenceCopyPolicyMatch, 'protectedSegmentIndex'> | undefined {
  if (segment.length < COPY_PROTECTED_SEGMENT_MINIMUM_LENGTH) return undefined;
  const overlapLength = Math.min(
    segment.length,
    Math.max(
      COPY_OVERLAP_MINIMUM_LENGTH,
      Math.ceil(segment.length * COPY_OVERLAP_RATIO),
    ),
  );
  for (
    let sourceStart = 0;
    sourceStart <= segment.length - overlapLength;
    sourceStart += 1
  ) {
    const renderedStart = rendered.indexOf(
      segment.slice(sourceStart, sourceStart + overlapLength),
    );
    if (renderedStart >= 0) {
      return {
        sourceStart,
        renderedStart,
        length: overlapLength,
        overlap: segment.slice(sourceStart, sourceStart + overlapLength),
      };
    }
  }
  return undefined;
}

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLocaleLowerCase('ko-KR');
}
