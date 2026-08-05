import { validateSimplyReferenceStructuredTpl } from './simply-reference-generation-contract';
import type { StructuredTplName } from './tpl-schemas';

/** Accept an exact renderer-valid source when generated structure is unsafe. */
export function materializeSourcePreservingTpl(
  template: StructuredTplName,
  source: string | undefined,
): Record<string, unknown> | null {
  if (typeof source !== 'string' || source.trim() === '') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || !validateSimplyReferenceStructuredTpl(template, parsed)) {
    return null;
  }
  return parsed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
