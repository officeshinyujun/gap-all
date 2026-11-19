import type { SubjectStyle, UnitRange } from './reference-frame.types';
import { classifyReferenceArchetype } from './reference-archetype';
import {
  DEFAULT_DISTRACTOR_AXES,
  type ReferenceSelectorShortfallReason,
  type SelectedParsedReference,
} from './reference-selector.types';

const UNIT_NAME_PATTERN = /^(\d+)단원$/;

export type ParsedReferenceResult =
  | Readonly<{ ok: true; value: SelectedParsedReference }>
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
  const stem = nonEmptyText(value.stem);
  const stimulus =
    typeof value.stimulus === 'string' ? value.stimulus.trim() : null;
  const viewItems =
    value.viewItems === undefined ? [] : textArray(value.viewItems);
  const choices = textArray(value.choices);
  const targetConcepts = textArray(value.targetConcepts);
  if (
    unitNumber === null ||
    questionNumber === null ||
    questionNumber < 1 ||
    filename === null ||
    stem === null ||
    stimulus === null ||
    viewItems === null ||
    choices === null ||
    choices.length !== 5 ||
    targetConcepts === null ||
    targetConcepts.length === 0
  ) {
    return { ok: false };
  }
  const sourceId = `${subject}:${unitNumber}:${filename}:${questionNumber}`;
  const archetype = classifyReferenceArchetype({
    stem,
    stimulus,
    viewItems,
    choices,
    targetConcepts,
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
      ...targetConcepts,
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
      targetConcepts,
      archetype: archetype.value,
    },
  };
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

export function canonicalize(value: string): string {
  return value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase();
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
  const axes = [...new Set(requestedAxes.map(canonicalize))].filter(
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
