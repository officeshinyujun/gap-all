import { isRecord } from './reference-frame.validation-utils';

const REASON_CODE = /^[A-Z][A-Z0-9_]*$/;

export type ReferenceVariantSemanticVerdict =
  | Readonly<{ kind: 'accepted'; reasonCode: string }>
  | Readonly<{
      kind: 'rejected';
      reason: 'SEMANTIC_VERIFIER_MALFORMED' | 'SEMANTIC_VERIFIER_REJECTED';
      reasonCode?: string;
    }>;

export function parseReferenceVariantSemanticVerdict(
  content: string | null | undefined,
): ReferenceVariantSemanticVerdict {
  if (content === null || content === undefined) {
    return { kind: 'rejected', reason: 'SEMANTIC_VERIFIER_MALFORMED' };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return { kind: 'rejected', reason: 'SEMANTIC_VERIFIER_MALFORMED' };
  }
  if (
    !isRecord(parsed) ||
    typeof parsed.accepted !== 'boolean' ||
    typeof parsed.reasonCode !== 'string' ||
    !REASON_CODE.test(parsed.reasonCode)
  ) {
    return { kind: 'rejected', reason: 'SEMANTIC_VERIFIER_MALFORMED' };
  }
  return parsed.accepted
    ? { kind: 'accepted', reasonCode: parsed.reasonCode }
    : {
        kind: 'rejected',
        reason: 'SEMANTIC_VERIFIER_REJECTED',
        reasonCode: parsed.reasonCode,
      };
}
