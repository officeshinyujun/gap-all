import { ReferenceQuestionCatalog } from '../exams/reference-question-catalog';
import type { ReferenceQuestionCatalogInput } from '../exams/reference-question-catalog';
import { GenerationDataResetError } from '../exams/generation-data-reset.service';
import {
  ReferenceCatalogImportError,
  ReferenceCatalogImportService,
  type ReferenceCatalogImportDependencies,
  type ReferenceCatalogImportTransaction,
} from './reference-catalog-import.service';

const record = {
  path: 'fixture/1.json',
  logicalSourceId: 'success:1:1',
  subject: 'success',
  unitNumber: 1,
  parseVersion: 'v1',
  payload: { stem: 'fixture' },
} as const;

const approvedRequest = {
  databaseName: 'gap_generation_test',
  nodeEnv: 'test',
  confirmation: 'RESET_GENERATION_DATA',
  backupManifestId: 'backup-20260721',
} as const;

class InMemoryReferenceCatalogImportTransaction implements ReferenceCatalogImportTransaction {
  constructor(readonly entries: Map<string, ReferenceQuestionCatalogInput>) {}

  findByLogicalSourceId(
    logicalSourceId: string,
  ): Promise<ReferenceQuestionCatalogInput | null> {
    return Promise.resolve(this.entries.get(logicalSourceId) ?? null);
  }

  insert(record: ReferenceQuestionCatalogInput): Promise<void> {
    this.entries.set(record.logicalSourceId, record);
    return Promise.resolve();
  }
}

class InMemoryReferenceCatalogImportHarness implements ReferenceCatalogImportDependencies {
  private entries = new Map<string, ReferenceQuestionCatalogInput>();
  transactionCount = 0;

  get records(): readonly ReferenceQuestionCatalogInput[] {
    return [...this.entries.values()];
  }

  async runInTransaction<T>(
    work: (transaction: ReferenceCatalogImportTransaction) => Promise<T>,
  ): Promise<T> {
    this.transactionCount += 1;
    const transaction = new InMemoryReferenceCatalogImportTransaction(
      new Map(this.entries),
    );
    const result = await work(transaction);
    this.entries = transaction.entries;
    return result;
  }
}

describe('ReferenceCatalogImportService', () => {
  it('makes a deterministic manifest and second dry-run plans no inserts', () => {
    const service = new ReferenceCatalogImportService();
    const catalog = new ReferenceQuestionCatalog();
    const first = service.dryRun([record], catalog);
    const second = service.dryRun([record], catalog);
    expect(first.plannedInsertCount).toBe(1);
    expect(second.plannedInsertCount).toBe(0);
    expect(first.manifestHash).toBe(second.manifestHash);
  });

  it('reports malformed records without mutating the catalog', () => {
    const manifest = new ReferenceCatalogImportService().dryRun(
      [{ ...record, unitNumber: 0 }],
      new ReferenceQuestionCatalog(),
    );
    expect(manifest).toMatchObject({ acceptedCount: 0, plannedInsertCount: 0 });
    expect(manifest.rejected).toEqual([
      { path: 'fixture/1.json', reason: 'INVALID_PARSED_REFERENCE' },
    ]);
  });

  it.each([
    { ...approvedRequest, nodeEnv: 'production' },
    { ...approvedRequest, databaseName: 'gap' },
    { ...approvedRequest, confirmation: 'wrong' },
    { ...approvedRequest, backupManifestId: '   ' },
  ])(
    'rejects unsafe database import requests before opening a transaction',
    async (request) => {
      const harness = new InMemoryReferenceCatalogImportHarness();
      const service = new ReferenceCatalogImportService(harness);

      await expect(
        service.importRecords({ ...request, records: [record] }),
      ).rejects.toBeInstanceOf(GenerationDataResetError);
      expect(harness.transactionCount).toBe(0);
      expect(harness.records).toEqual([]);
    },
  );

  it('rolls back all writes when a later record is malformed', async () => {
    const harness = new InMemoryReferenceCatalogImportHarness();
    const service = new ReferenceCatalogImportService(harness);

    await expect(
      service.importRecords({
        ...approvedRequest,
        records: [record, { ...record, path: '' }],
      }),
    ).rejects.toBeInstanceOf(ReferenceCatalogImportError);

    expect(harness.transactionCount).toBe(1);
    expect(harness.records).toEqual([]);
  });

  it('makes an exact second import a no-op while preserving immutable metadata', async () => {
    const harness = new InMemoryReferenceCatalogImportHarness();
    const service = new ReferenceCatalogImportService(harness);

    const first = await service.importRecords({
      ...approvedRequest,
      records: [record],
    });
    const second = await service.importRecords({
      ...approvedRequest,
      records: [record],
    });

    expect(first).toMatchObject({ insertedCount: 1, existingCount: 0 });
    expect(second).toMatchObject({ insertedCount: 0, existingCount: 1 });
    expect(harness.records).toEqual([
      {
        logicalSourceId: 'success:1:1',
        contentHash:
          'sha256:6f629ef02269861e3f5a7f355b021ce600872f43bf797afb33a0fc2bf58c9f5c',
        subject: 'success',
        unitNumber: 1,
        provenancePath: 'fixture/1.json',
        parseVersion: 'v1',
        sourcePayload: { stem: 'fixture' },
      },
    ]);
  });

  it('rolls back newly inserted records when a logical source version conflicts', async () => {
    const harness = new InMemoryReferenceCatalogImportHarness();
    const service = new ReferenceCatalogImportService(harness);
    await service.importRecords({ ...approvedRequest, records: [record] });

    await expect(
      service.importRecords({
        ...approvedRequest,
        records: [
          { ...record, logicalSourceId: 'success:1:2' },
          { ...record, payload: { stem: 'changed' } },
        ],
      }),
    ).rejects.toBeInstanceOf(ReferenceCatalogImportError);

    expect(harness.records).toHaveLength(1);
    expect(harness.records[0]).toMatchObject({
      logicalSourceId: 'success:1:1',
    });
  });
});
