import {
  INFORMATION_SHAPES,
  type ContractReasonCode,
  type ContractValidationResult,
  type InformationShape,
  type SourceIdentity,
  type SubjectStyle,
  type UnitRange,
} from './reference-frame.types';

export type InvalidContractResult = Extract<
  ContractValidationResult<never>,
  { ok: false }
>;

export type RecordValue = Record<string, unknown>;

export function valid<T>(value: T): ContractValidationResult<T> {
  return { ok: true, value };
}

export function invalid(
  code: ContractReasonCode,
  path: string,
): InvalidContractResult {
  return { ok: false, error: { code, path } };
}

export function isRecord(value: unknown): value is RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

export function whole(value: unknown): number | null {
  return typeof value === 'number' && Number.isInteger(value) ? value : null;
}

export function texts(
  value: unknown,
  minimumLength: number,
): readonly string[] | null {
  if (!Array.isArray(value) || value.length < minimumLength) {
    return null;
  }

  const parsed: string[] = [];
  for (const item of value) {
    const itemText = text(item);
    if (itemText === null) {
      return null;
    }
    parsed.push(itemText);
  }
  return parsed;
}

export function exact(
  value: RecordValue,
  keys: readonly string[],
  path: string,
): InvalidContractResult | null {
  const unknownKey = Object.keys(value).find((key) => !keys.includes(key));
  if (unknownKey !== undefined) {
    return invalid('UNKNOWN_FIELD', `${path}.${unknownKey}`);
  }

  const missingKey = keys.find((key) => !Object.hasOwn(value, key));
  return missingKey === undefined
    ? null
    : invalid('MISSING_REQUIRED_FIELD', `${path}.${missingKey}`);
}

export function matches<T extends string>(
  value: string,
  allowed: readonly T[],
): value is T {
  return allowed.some((item) => item === value);
}

export function parseSource(
  value: unknown,
  path: string,
): ContractValidationResult<SourceIdentity> {
  if (!isRecord(value)) {
    return invalid('INVALID_OBJECT', path);
  }

  const keyError = exact(value, ['sourceId', 'sourceHash'], path);
  if (keyError !== null) {
    return keyError;
  }

  const sourceId = text(value.sourceId);
  const sourceHash = text(value.sourceHash);
  return sourceId === null || sourceHash === null
    ? invalid('INVALID_FIELD_VALUE', path)
    : valid({ sourceId, sourceHash });
}

export function parseUnitRange(
  value: unknown,
  path: string,
): ContractValidationResult<UnitRange> {
  if (!isRecord(value)) {
    return invalid('MISSING_UNIT_RANGE', path);
  }

  if (!Object.hasOwn(value, 'start') || !Object.hasOwn(value, 'end')) {
    return invalid('MISSING_UNIT_RANGE', path);
  }

  const keyError = exact(value, ['start', 'end'], path);
  if (keyError !== null) {
    return keyError;
  }

  const start = whole(value.start);
  const end = whole(value.end);
  return start === null || end === null || start < 1 || end < start
    ? invalid('INVALID_UNIT_RANGE', path)
    : valid({ start, end });
}

export function parseSubject(
  value: unknown,
  path: string,
): ContractValidationResult<SubjectStyle> {
  return value === 'success' || value === 'kongil'
    ? valid(value)
    : invalid('INVALID_FIELD_VALUE', path);
}

export function parseInformationShape(
  value: unknown,
  path: string,
): ContractValidationResult<InformationShape> {
  const shape = text(value);
  return shape !== null && matches(shape, INFORMATION_SHAPES)
    ? valid(shape)
    : invalid('INVALID_FIELD_VALUE', path);
}

export function parseJson<T>(
  json: string,
  path: string,
  validate: (input: unknown) => ContractValidationResult<T>,
): ContractValidationResult<T> {
  try {
    return validate(JSON.parse(json));
  } catch {
    return invalid('INVALID_JSON', path);
  }
}
