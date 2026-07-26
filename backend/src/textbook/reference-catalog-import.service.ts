import { createHash } from 'node:crypto';
import {
  ReferenceQuestionCatalog,
  type ReferenceQuestionCatalogInput,
} from '../exams/reference-question-catalog';
import {
  validateGenerationDataResetRequest,
  type GenerationDataResetRequest,
} from '../exams/generation-data-reset.service';

export type ReferenceCatalogImportRecord = Readonly<{
  path: string;
  logicalSourceId: string;
  subject: string;
  unitNumber: number;
  parseVersion: string;
  payload: Readonly<Record<string, unknown>>;
}>;

export type ReferenceCatalogDryRunManifest = Readonly<{
  sourceFileCount: number;
  acceptedCount: number;
  rejected: readonly Readonly<{ path: string; reason: string }>[];
  plannedInsertCount: number;
  manifestHash: string;
}>;

export type ReferenceCatalogImportRequest = GenerationDataResetRequest &
  Readonly<{
    records: readonly ReferenceCatalogImportRecord[];
  }>;

export type ReferenceCatalogImportManifest = Readonly<{
  sourceFileCount: number;
  insertedCount: number;
  existingCount: number;
  manifestHash: string;
}>;

export type ReferenceCatalogImportTransaction = Readonly<{
  findByLogicalSourceId: (
    logicalSourceId: string,
  ) => Promise<ReferenceQuestionCatalogInput | null>;
  insert: (record: ReferenceQuestionCatalogInput) => Promise<void>;
}>;

export type ReferenceCatalogImportDependencies = Readonly<{
  runInTransaction: <T>(
    work: (transaction: ReferenceCatalogImportTransaction) => Promise<T>,
  ) => Promise<T>;
}>;

export class ReferenceCatalogImportError extends Error {
  readonly name = 'ReferenceCatalogImportError';

  constructor(
    readonly path: string,
    readonly reason: 'INVALID_PARSED_REFERENCE' | 'SOURCE_VERSION_CONFLICT',
  ) {
    super(`${reason}: ${path}`);
  }
}

export class ReferenceCatalogImportConfigurationError extends Error {
  readonly name = 'ReferenceCatalogImportConfigurationError';

  constructor() {
    super('Reference catalog import requires transaction dependencies.');
  }
}

export class ReferenceCatalogImportService {
  constructor(
    private readonly dependencies?: ReferenceCatalogImportDependencies,
  ) {}

  dryRun(
    records: readonly ReferenceCatalogImportRecord[],
    catalog: ReferenceQuestionCatalog,
  ): ReferenceCatalogDryRunManifest {
    const rejected: Array<{ path: string; reason: string }> = [];
    let acceptedCount = 0;
    let plannedInsertCount = 0;

    for (const record of records) {
      const parsed = toCatalogInput(record);
      if (parsed === null) {
        rejected.push({
          path: record.path,
          reason: 'INVALID_PARSED_REFERENCE',
        });
        continue;
      }
      const result = catalog.insert(parsed);
      if (result.kind === 'version_conflict') {
        rejected.push({ path: record.path, reason: 'SOURCE_VERSION_CONFLICT' });
        continue;
      }
      acceptedCount += 1;
      if (result.kind === 'inserted') plannedInsertCount += 1;
    }

    return {
      sourceFileCount: records.length,
      acceptedCount,
      rejected,
      plannedInsertCount,
      manifestHash: hash(records),
    };
  }

  async importRecords(
    request: ReferenceCatalogImportRequest,
  ): Promise<ReferenceCatalogImportManifest> {
    validateGenerationDataResetRequest(request);
    const dependencies = this.dependencies;
    if (dependencies === undefined) {
      throw new ReferenceCatalogImportConfigurationError();
    }

    return dependencies.runInTransaction(async (transaction) => {
      let insertedCount = 0;
      let existingCount = 0;

      for (const record of request.records) {
        const parsed = toCatalogInput(record);
        if (parsed === null) {
          throw new ReferenceCatalogImportError(
            record.path,
            'INVALID_PARSED_REFERENCE',
          );
        }

        const existing = await transaction.findByLogicalSourceId(
          parsed.logicalSourceId,
        );
        if (existing === null) {
          await transaction.insert(parsed);
          insertedCount += 1;
          continue;
        }
        if (existing.contentHash !== parsed.contentHash) {
          throw new ReferenceCatalogImportError(
            record.path,
            'SOURCE_VERSION_CONFLICT',
          );
        }
        existingCount += 1;
      }

      return {
        sourceFileCount: request.records.length,
        insertedCount,
        existingCount,
        manifestHash: hash(request.records),
      };
    });
  }
}

function toCatalogInput(
  record: ReferenceCatalogImportRecord,
): ReferenceQuestionCatalogInput | null {
  if (
    record.path.trim().length === 0 ||
    record.logicalSourceId.trim().length === 0 ||
    record.subject.trim().length === 0 ||
    !Number.isInteger(record.unitNumber) ||
    record.unitNumber <= 0 ||
    record.parseVersion.trim().length === 0
  ) {
    return null;
  }
  return {
    logicalSourceId: record.logicalSourceId,
    contentHash: hash(record.payload),
    subject: record.subject,
    unitNumber: record.unitNumber,
    provenancePath: record.path,
    parseVersion: record.parseVersion,
    sourcePayload: record.payload,
  };
}

function hash(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}
