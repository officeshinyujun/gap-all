import type { SubjectStyle, UnitRange } from './reference-frame.types';
import {
  classifyReferenceArchetype,
  isReferenceCombinationChoiceSet,
} from './reference-archetype';
import {
  DEFAULT_DISTRACTOR_AXES,
  type NormalizedSourceReference,
  type ReferenceSelectorShortfallReason,
} from './reference-selector.types';

const UNIT_NAME_PATTERN = /^(\d+)단원$/;

export const REFERENCE_SOURCE_ELIGIBILITY_REGISTRY_VERSION = 1;

// These sources are retained for provenance but cannot be answered from their
// persisted context. Do not allow them into either reference-generation path.
export const INELIGIBLE_REFERENCE_SOURCE_IDS = new Set<string>([
  'success:10:성직_10단원_문제.pdf:10',
]);

export function isReferenceSourceEligible(sourceId: string): boolean {
  return !INELIGIBLE_REFERENCE_SOURCE_IDS.has(sourceId);
}

export type ParsedReferenceResult =
  | Readonly<{ ok: true; value: NormalizedSourceReference }>
  | Readonly<{ ok: false }>;

export function parseReference(
  value: unknown,
  subject: SubjectStyle,
): ParsedReferenceResult {
  if (!isRecord(value) || !isRecord(value.source)) {
    return { ok: false };
  }
  const unitNumber = whole(value.source.unitNumber);
  const questionNumber = whole(value.questionNumber);
  const filename = nonEmptyText(value.source.filename);
  const stem = cleanQuestionStem(nonEmptyText(value.stem));
  const rawStimulus =
    typeof value.stimulus === 'string' ? value.stimulus.trim() : null;
  const rawViewItems =
    value.viewItems === undefined ? [] : textArray(value.viewItems);
  const choices = textArray(value.choices);
  const correctAnswer = officialAnswer(value.correctAnswer);
  const rawTargetConcepts = textArray(value.targetConcepts);
  const primaryConcept = rawTargetConcepts?.[0];
  if (
    unitNumber === null ||
    questionNumber === null ||
    questionNumber < 1 ||
    filename === null ||
    stem === null ||
    rawStimulus === null ||
    rawViewItems === null ||
    choices === null ||
    choices.length !== 5 ||
    correctAnswer === undefined ||
    primaryConcept === undefined
  ) {
    return { ok: false };
  }
  const { stimulus, viewItems } = extractEmbeddedViewItems(
    rawStimulus,
    rawViewItems,
    choices,
  );
  const target = {
    primaryConcept,
    concepts: [primaryConcept] as const,
  };
  const sourceId = `${subject}:${unitNumber}:${filename}:${questionNumber}`;
  if (!isReferenceSourceEligible(sourceId)) return { ok: false };
  const archetype = classifyReferenceArchetype({
    stem,
    stimulus,
    viewItems,
    choices,
    targetConcepts: target.concepts,
  });
  if (archetype.kind !== 'classified') return { ok: false };
  if (
    stimulus === '' &&
    archetype.value.setStructure?.position !== 'shared_pair'
  ) {
    return { ok: false };
  }
  const sourceHash = `fnv1a:${stableHash(
    [
      sourceId,
      stem,
      stimulus,
      ...viewItems,
      ...choices,
      ...(correctAnswer === null ? [] : [String(correctAnswer)]),
      ...target.concepts,
    ].join('\u0000'),
  )}`;
  return {
    ok: true,
    value: {
      source: { sourceId, sourceHash },
      unitNumber,
      questionNumber,
      stem,
      stimulus,
      viewItems,
      choices,
      correctAnswer,
      targetConcepts: target.concepts,
      target,
      archetype: archetype.value,
      tplStimulusData: isRecord(value.tplStimulusData)
        ? value.tplStimulusData
        : undefined,
      // Official explanation wins; generated fallback is explicitly marked in
      // source_payload and exists only when the official field is absent.
      explanation:
        nonEmptyText(value.explanation) ??
        nonEmptyText(value.generatedExplanation) ??
        undefined,
    },
  };
}

function extractEmbeddedViewItems(
  stimulus: string,
  viewItems: readonly string[],
  choices: readonly string[],
): Readonly<{ stimulus: string; viewItems: readonly string[] }> {
  if (viewItems.length > 0 || !isReferenceCombinationChoiceSet(choices)) {
    return { stimulus, viewItems };
  }
  const lines = stimulus.split('\n');
  const blocks: Readonly<{
    start: number;
    end: number;
    items: readonly string[];
  }>[] = [];
  for (let start = 0; start < lines.length; start += 1) {
    const first = lines[start]?.trim() ?? '';
    if (!/^[ㄱ-ㅎ][.．]\s+\S/u.test(first)) continue;
    const items: string[] = [];
    let end = start;
    while (end < lines.length) {
      const line = lines[end]?.trim() ?? '';
      if (!/^[ㄱ-ㅎ][.．]\s+\S/u.test(line)) break;
      items.push(line.replace(/^([ㄱ-ㅎ])[．]/u, '$1.'));
      end += 1;
    }
    if (
      items.length >= 2 &&
      new Set(items.map((item) => item.slice(0, 1))).size === items.length
    ) {
      blocks.push({ start, end, items });
    }
    start = Math.max(start, end - 1);
  }
  const block = blocks.at(-1);
  if (block === undefined) return { stimulus, viewItems };
  return {
    stimulus: lines
      .filter((_, index) => index < block.start || index >= block.end)
      .join('\n')
      .trim(),
    viewItems: block.items,
  };
}

/**
 * Removes passage headers (`[16~17]`) and trailing score labels (`[3점]`)
 * from question stem text so the question is self-contained.
 *
 * Also strips the question-number prefix (e.g. `16. `) that the MOI parser
 * includes when the source exam uses shared-passage numbering.
 */
const PASSAGE_HEADER_PATTERN = /^\s*\[\s*\d+\s*[~～-]\s*\d+\s*\][^\n]*\n?/u;
const SCORE_LABEL_PATTERN = /\s*\[\s*\d+\s*점\s*\]\s*$/u;
const QUESTION_NUMBER_PATTERN = /^\s*\d+\.\s*/u;

export function cleanQuestionStem(raw: string | null): string | null {
  if (raw === null) return null;
  let stem = raw.replace(PASSAGE_HEADER_PATTERN, '');
  stem = stem.replace(QUESTION_NUMBER_PATTERN, '');
  stem = stem.replace(SCORE_LABEL_PATTERN, '');
  const trimmed = stem.trim();
  return trimmed === '' ? null : trimmed;
}

export function unitNumberFromName(unitName: string): number | null {
  const match = UNIT_NAME_PATTERN.exec(unitName.trim());
  return match === null ? null : Number(match[1]);
}

export function isValidUnitRange(range: UnitRange): boolean {
  return (
    Number.isInteger(range.start) &&
    range.start >= 1 &&
    range.end >= range.start
  );
}

export function containsUnit(range: UnitRange, unitNumber: number): boolean {
  return unitNumber >= range.start && unitNumber <= range.end;
}

export function conceptKey(value: string): string {
  return value
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('ko-KR');
}

export function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash = Math.imul(hash ^ value.charCodeAt(index), 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function uniqueReasons(
  reasons: readonly ReferenceSelectorShortfallReason[],
): readonly ReferenceSelectorShortfallReason[] {
  return [...new Set(reasons)].sort(compare);
}

export function selectAxes(requestedAxes: readonly string[]):
  | Readonly<{ ok: true; axes: readonly string[] }>
  | Readonly<{
      ok: false;
      reasons: readonly ReferenceSelectorShortfallReason[];
    }> {
  const axes = [...new Set(requestedAxes.map(conceptKey))].filter(
    (axis) => axis !== '',
  );
  return axes.every((axis) =>
    DEFAULT_DISTRACTOR_AXES.some((allowedAxis) => allowedAxis === axis),
  )
    ? { ok: true, axes: axes.sort(compare) }
    : { ok: false, reasons: ['AXIS_NOT_ALLOWED'] };
}

export function compare(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function whole(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

function officialAnswer(value: unknown): number | null | undefined {
  if (value === undefined || value === null) return null;
  return whole(value) !== null && whole(value)! >= 1 && whole(value)! <= 5
    ? whole(value)!
    : undefined;
}

function nonEmptyText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function textArray(value: unknown): readonly string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }
  const parsed = value.map(nonEmptyText);
  return parsed.every((item): item is string => item !== null) ? parsed : null;
}
