import type { ReferenceQuestion } from '../entities/reference-question.entity';
import { canGenerateAiTemplate, getTplGenerationSpec } from './ai-tpl-capabilities';
import { parseReference } from './reference-selector.utils';
import type { SubjectStyle } from './reference-frame.types';

export type AiCatalogInventoryRow = Readonly<{
  subject: string;
  unitNumber: number;
  template: string;
  raw: number;
  parseable: number;
  certifiedAnswer: number;
  renderable: number;
  answerEngineSupported: number;
  aiEligible: number;
  distinctBaseSource: number;
  projectedVariants: number;
  excludedByReason: Readonly<Record<string, number>>;
}>;

export type AiCatalogInventory = Readonly<{
  totalRows: number;
  rows: readonly AiCatalogInventoryRow[];
}>;

type Bucket = {
  subject: string;
  unitNumber: number;
  template: string;
  raw: number;
  parseable: number;
  certifiedAnswer: number;
  renderable: number;
  answerEngineSupported: number;
  aiEligible: number;
  sources: Set<string>;
  projectedVariants: number;
  excludedByReason: Record<string, number>;
};

export function buildAiCatalogInventory(
  rows: readonly Pick<ReferenceQuestion, 'logicalSourceId' | 'subject' | 'unitNumber' | 'sourcePayload'>[],
): AiCatalogInventory {
  const buckets = new Map<string, Bucket>();
  for (const row of rows) {
    const subject = subjectStyle(row.subject);
    const parsed = subject === null ? null : parseReference(row.sourcePayload, subject);
    const template = parsed?.ok === true ? parsed.value.archetype?.sourceTemplate ?? 'UNCLASSIFIED' : 'UNPARSEABLE';
    const key = `${row.subject}:${row.unitNumber}:${template}`;
    const bucket = buckets.get(key) ?? {
      subject: row.subject,
      unitNumber: row.unitNumber,
      template,
      raw: 0,
      parseable: 0,
      certifiedAnswer: 0,
      renderable: 0,
      answerEngineSupported: 0,
      aiEligible: 0,
      sources: new Set<string>(),
      projectedVariants: 0,
      excludedByReason: {},
    };
    bucket.raw += 1;
    if (parsed?.ok !== true) {
      increment(bucket.excludedByReason, 'INVALID_SOURCE_PAYLOAD');
      buckets.set(key, bucket);
      continue;
    }
    bucket.parseable += 1;
    bucket.sources.add(parsed.value.source.sourceId);
    if (parsed.value.correctAnswer !== null) bucket.certifiedAnswer += 1;
    const spec = getTplGenerationSpec(template);
    if (spec?.answerEngineAvailable === true) bucket.answerEngineSupported += 1;
    if (spec?.rendererFixturePassed === true) bucket.renderable += 1;
    if (spec === undefined) {
      increment(bucket.excludedByReason, 'UNSUPPORTED_TEMPLATE');
    } else if (!canGenerateAiTemplate(template, parsed.value.stimulus)) {
      increment(bucket.excludedByReason, spec.enabled ? 'INVALID_TEMPLATE_DATA' : 'AI_DISABLED');
    } else if (template === 'TPL_CONVERSATIONAL_FLOW' && parsed.value.stimulus.split('\n').filter((line) => line.includes(':')).length < 2) {
      increment(bucket.excludedByReason, 'CONVERSATION_TOO_SHORT');
    } else {
      bucket.aiEligible += 1;
      bucket.projectedVariants += parsed.value.archetype?.stimulusRole === 'case' ? 3 : 1;
    }
    buckets.set(key, bucket);
  }
  return {
    totalRows: rows.length,
    rows: [...buckets.values()].sort((a, b) => a.subject.localeCompare(b.subject) || a.unitNumber - b.unitNumber || a.template.localeCompare(b.template)).map(({ sources, ...bucket }) => ({
      ...bucket,
      distinctBaseSource: sources.size,
    })),
  };
}

function subjectStyle(value: string): SubjectStyle | null {
  return value === 'success' || value === 'sungjik' ? 'success' : value === 'kongil' ? 'kongil' : null;
}

function increment(record: Record<string, number>, key: string): void {
  record[key] = (record[key] ?? 0) + 1;
}
