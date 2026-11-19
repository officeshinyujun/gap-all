import type { ReferenceFidelitySpec } from './reference-fidelity-spec';

export type ReferenceCopyPolicyResult =
  | Readonly<{ kind: 'accepted' }>
  | Readonly<{ kind: 'rejected'; reason: 'VERBATIM_SOURCE_SEGMENT' }>;

export type ReferenceDensityResult =
  | Readonly<{ kind: 'accepted' }>
  | Readonly<{
      kind: 'rejected';
      reason: 'INSUFFICIENT_STIMULUS_DENSITY' | 'EXCESSIVE_STIMULUS_DENSITY';
    }>;

const COPY_OVERLAP_MINIMUM_LENGTH = 24;

export function validateReferenceCopyPolicy(
  spec: ReferenceFidelitySpec,
  renderedText: string,
): ReferenceCopyPolicyResult {
  const normalizedRendered = normalize(renderedText);
  const allowedTerms = new Set(spec.targetConcepts.map(normalize));
  for (const segment of spec.protectedSourceSegments) {
    const normalizedSegment = normalize(segment);
    if (
      !allowedTerms.has(normalizedSegment) &&
      hasUnapprovedOverlap(normalizedRendered, normalizedSegment)
    ) {
      return { kind: 'rejected', reason: 'VERBATIM_SOURCE_SEGMENT' };
    }
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

function hasUnapprovedOverlap(rendered: string, segment: string): boolean {
  if (segment.length < COPY_OVERLAP_MINIMUM_LENGTH) return false;
  for (
    let index = 0;
    index <= segment.length - COPY_OVERLAP_MINIMUM_LENGTH;
    index += 1
  ) {
    if (
      rendered.includes(
        segment.slice(index, index + COPY_OVERLAP_MINIMUM_LENGTH),
      )
    ) {
      return true;
    }
  }
  return false;
}

function normalize(value: string): string {
  return value.replace(/\s+/g, ' ').trim().toLocaleLowerCase('ko-KR');
}
