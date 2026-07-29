import { ReferenceQuestion } from '../entities/reference-question.entity';
import {
  ReferenceConceptCatalogResolver,
  reconcileReferenceConceptCatalog,
  type ReferenceConceptCatalogReader,
} from '../exams/reference-concept-catalog-resolver';
import type { SubjectStyle } from '../exams/reference-frame.types';
import { parseReference } from '../exams/reference-selector.utils';

export type PersistedReferenceQuestion = Pick<
  ReferenceQuestion,
  'logicalSourceId' | 'subject' | 'unitNumber' | 'sourcePayload'
>;

export type ReferenceCatalogPreflightReader = Readonly<{
  find: () => Promise<readonly PersistedReferenceQuestion[]>;
}>;

export const REFERENCE_CATALOG_PREFLIGHT_RESULTS = [
  'AMBIGUOUS_PRIMARY_TARGET',
  'CATALOG_SUBJECT_MISMATCH',
  'CATALOG_UNIT_MISMATCH',
  'INVALID_LOGICAL_SOURCE_ID',
  'INVALID_SOURCE_PAYLOAD',
  'MISSING_OFFICIAL_ANSWER',
  'MISSING_PRIMARY_TARGET',
  'RESOLVED',
  'SOURCE_ID_PAYLOAD_MISMATCH',
  'UNRESOLVED_PRIMARY_TARGET',
] as const;

export type ReferenceCatalogPreflightResult =
  (typeof REFERENCE_CATALOG_PREFLIGHT_RESULTS)[number];

export type ReferenceCatalogPreflightRow = Readonly<{
  sourceId: string;
  canonicalId: string | null;
  result: ReferenceCatalogPreflightResult;
}>;

export type ReferenceCatalogPreflightReport = Readonly<{
  status: 'passed' | 'failed';
  totalRowCount: number;
  failedRowCount: number;
  rows: readonly ReferenceCatalogPreflightRow[];
}>;

type ValidatedCatalogRow = Readonly<{
  sourceId: string;
  subject: SubjectStyle;
  unitNumber: number;
  primaryConcept: string;
}>;

export class ReferenceCatalogPreflightService {
  constructor(
    private readonly catalogReader: ReferenceCatalogPreflightReader,
    private readonly conceptCatalogReader: ReferenceConceptCatalogReader,
  ) {}

  async preflight(): Promise<ReferenceCatalogPreflightReport> {
    const persistedRows = await this.catalogReader.find();
    const rows: ReferenceCatalogPreflightRow[] = [];
    const validRows: ValidatedCatalogRow[] = [];

    for (const persistedRow of persistedRows) {
      const validated = validateCatalogRow(persistedRow);
      switch (validated.kind) {
        case 'rejected':
          rows.push({
            sourceId: persistedRow.logicalSourceId,
            canonicalId: null,
            result: validated.result,
          });
          break;
        case 'validated':
          validRows.push(validated.value);
          break;
        default:
          return assertNever(validated);
      }
    }

    for (const validRow of validRows) {
      rows.push(await this.reconcile(validRow));
    }

    const sortedRows = rows.sort(compareRows);
    const failedRowCount = sortedRows.filter(
      ({ result }) => result !== 'RESOLVED',
    ).length;
    return {
      status: failedRowCount === 0 ? 'passed' : 'failed',
      totalRowCount: persistedRows.length,
      failedRowCount,
      rows: sortedRows,
    };
  }

  private async reconcile(
    row: ValidatedCatalogRow,
  ): Promise<ReferenceCatalogPreflightRow> {
    const catalog = await new ReferenceConceptCatalogResolver(
      this.conceptCatalogReader,
    ).resolve(row.subject, row.unitNumber, row.unitNumber);
    const reconciliation = reconcileReferenceConceptCatalog(
      catalog,
      [
        {
          sourceId: row.sourceId,
          unit: row.unitNumber,
          canonicalLabel: row.primaryConcept,
        },
      ],
      row.subject,
    );
    switch (reconciliation.kind) {
      case 'ambiguous':
        return {
          sourceId: row.sourceId,
          canonicalId: null,
          result: 'AMBIGUOUS_PRIMARY_TARGET',
        };
      case 'reconciled': {
        const canonicalId = reconciliation.sourceConceptIds.get(row.sourceId);
        return canonicalId === undefined
          ? {
              sourceId: row.sourceId,
              canonicalId: null,
              result: 'UNRESOLVED_PRIMARY_TARGET',
            }
          : { sourceId: row.sourceId, canonicalId, result: 'RESOLVED' };
      }
      default:
        return assertNever(reconciliation);
    }
  }
}

export function renderReferenceCatalogPreflightJson(
  report: ReferenceCatalogPreflightReport,
): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

export function renderReferenceCatalogPreflightMarkdown(
  report: ReferenceCatalogPreflightReport,
): string {
  return [
    '# Reference Catalog Preflight',
    '',
    `Status: ${report.status}`,
    `Rows: ${report.totalRowCount}`,
    `Failures: ${report.failedRowCount}`,
    '',
    '| Source ID | Canonical ID | Result |',
    '| --- | --- | --- |',
    ...report.rows.map(
      ({ sourceId, canonicalId, result }) =>
        `| ${escapeMarkdown(sourceId)} | ${canonicalId ?? '-'} | ${result} |`,
    ),
    '',
  ].join('\n');
}

export function referenceCatalogPreflightExitCode(
  report: ReferenceCatalogPreflightReport,
): 0 | 1 {
  return report.status === 'passed' ? 0 : 1;
}

function validateCatalogRow(row: PersistedReferenceQuestion):
  | Readonly<{ kind: 'validated'; value: ValidatedCatalogRow }>
  | Readonly<{
      kind: 'rejected';
      result: Exclude<ReferenceCatalogPreflightResult, 'RESOLVED'>;
    }> {
  const logicalSource = parseLogicalSourceId(row.logicalSourceId);
  if (logicalSource === null) {
    return { kind: 'rejected', result: 'INVALID_LOGICAL_SOURCE_ID' };
  }
  if (row.subject !== logicalSource.subject) {
    return { kind: 'rejected', result: 'CATALOG_SUBJECT_MISMATCH' };
  }
  if (row.unitNumber !== logicalSource.unitNumber) {
    return { kind: 'rejected', result: 'CATALOG_UNIT_MISMATCH' };
  }
  if (primaryConcept(row.sourcePayload) === null) {
    return { kind: 'rejected', result: 'MISSING_PRIMARY_TARGET' };
  }
  const parsedReference = parseReference(
    row.sourcePayload,
    logicalSource.subject,
  );
  if (!parsedReference.ok) {
    return { kind: 'rejected', result: 'INVALID_SOURCE_PAYLOAD' };
  }
  if (parsedReference.value.correctAnswer === null) {
    return { kind: 'rejected', result: 'MISSING_OFFICIAL_ANSWER' };
  }
  if (parsedReference.value.source.sourceId !== row.logicalSourceId) {
    return { kind: 'rejected', result: 'SOURCE_ID_PAYLOAD_MISMATCH' };
  }
  return {
    kind: 'validated',
    value: {
      sourceId: row.logicalSourceId,
      subject: logicalSource.subject,
      unitNumber: logicalSource.unitNumber,
      primaryConcept: parsedReference.value.target.primaryConcept,
    },
  };
}

function parseLogicalSourceId(
  value: string,
): Readonly<{ subject: SubjectStyle; unitNumber: number }> | null {
  const parts = value.split(':');
  if (parts.length < 4) return null;
  const subject = subjectStyle(parts[0]);
  const unitNumber = canonicalPositiveInteger(parts[1]);
  const questionNumber = canonicalPositiveInteger(parts.at(-1));
  const filename = parts.slice(2, -1).join(':');
  if (
    subject === null ||
    unitNumber === null ||
    questionNumber === null ||
    filename.trim() === ''
  ) {
    return null;
  }
  return { subject, unitNumber };
}

function subjectStyle(value: string | undefined): SubjectStyle | null {
  switch (value) {
    case 'success':
      return 'success';
    case 'kongil':
      return 'kongil';
    default:
      return null;
  }
}

function canonicalPositiveInteger(value: string | undefined): number | null {
  if (value === undefined || !/^[1-9]\d*$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function primaryConcept(
  value: Readonly<Record<string, unknown>>,
): string | null {
  const targetConcepts = value.targetConcepts;
  if (!Array.isArray(targetConcepts)) return null;
  const target = targetConcepts[0];
  return typeof target === 'string' && target.trim() !== ''
    ? target.trim()
    : null;
}

function compareRows(
  left: ReferenceCatalogPreflightRow,
  right: ReferenceCatalogPreflightRow,
): number {
  return (
    compare(left.sourceId, right.sourceId) ||
    compare(left.canonicalId ?? '', right.canonicalId ?? '') ||
    compare(left.result, right.result)
  );
}

function compare(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}

function escapeMarkdown(value: string): string {
  return value.replaceAll('\\', '\\\\').replaceAll('|', '\\|');
}

function assertNever(value: never): never {
  throw new Error(`Unexpected preflight state: ${JSON.stringify(value)}`);
}
