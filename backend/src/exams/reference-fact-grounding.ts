import type { StructuredTplName } from './tpl-schemas';

export type ReferenceFactGroundingSource = Readonly<{
  stimulus: string;
}>;

export type ReferenceFactGroundingResult =
  | Readonly<{ kind: 'accepted' }>
  | Readonly<{
      kind: 'rejected';
      reason: 'MATRIX_SOURCE_FACT_MISMATCH';
      missingTerms: readonly string[];
    }>;

const GENERIC_TABLE_TERMS = new Set(['구분', '내용', '항목', '비고']);
const MINIMUM_MATRIX_TERM_COVERAGE = 1;

export function matrixGroundingTerms(
  source: ReferenceFactGroundingSource,
): readonly string[] {
  const terms = new Map<string, string>();
  for (const line of source.stimulus.split('\n')) {
    if (!line.includes('|') || /^\s*\|?\s*:?-{3,}/.test(line)) continue;
    for (const cell of line.split('|')) {
      const term = cell.trim();
      const normalized = normalize(term);
      if (
        normalized.length < 2 ||
        GENERIC_TABLE_TERMS.has(normalized) ||
        terms.has(normalized)
      ) {
        continue;
      }
      terms.set(normalized, term);
    }
  }
  return [...terms.values()];
}

export function validateReferenceFactGrounding(
  input: Readonly<{
    source: ReferenceFactGroundingSource;
    template: StructuredTplName;
    stimulusData: Readonly<Record<string, unknown>>;
  }>,
): ReferenceFactGroundingResult {
  if (input.template !== 'TPL_COMPARATIVE_MATRIX') {
    return { kind: 'accepted' };
  }

  const sourceTerms = matrixGroundingTerms(input.source);
  if (sourceTerms.length === 0) return { kind: 'accepted' };

  const rendered = normalize(JSON.stringify(input.stimulusData));
  const matched = sourceTerms.filter((term) =>
    rendered.includes(normalize(term)),
  );
  const requiredCount = Math.min(
    MINIMUM_MATRIX_TERM_COVERAGE,
    sourceTerms.length,
  );
  if (matched.length >= requiredCount) return { kind: 'accepted' };

  return {
    kind: 'rejected',
    reason: 'MATRIX_SOURCE_FACT_MISMATCH',
    missingTerms: sourceTerms.filter((term) => !matched.includes(term)),
  };
}

function normalize(value: string): string {
  return value.toLocaleLowerCase().replace(/[^0-9a-z가-힣]/g, '');
}
