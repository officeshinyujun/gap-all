import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DataSource } from 'typeorm';
import { ReferenceQuestion } from '../src/entities/reference-question.entity';

const ROOT = path.resolve(__dirname, '../..');
const PARSED_ROOT = path.join(ROOT, 'textbook', 'parsed');
const SUBJECTS = [
  { folder: 'sungjik', subject: 'success' },
  { folder: 'kongil', subject: 'kongil' },
] as const;
const write = process.argv.includes('--write');

type SourceRecord = Readonly<{
  sourceKey: string;
  payload: Record<string, unknown>;
}>;

async function main(): Promise<void> {
  const dataSource = new DataSource({
    type: 'postgres',
    url: requiredDatabaseUrl(),
    entities: [ReferenceQuestion],
    synchronize: false,
  });
  try {
    await dataSource.initialize();
    const sourceRecords = loadSourceRecords();
    const sourceByKey = new Map(
      sourceRecords.map((record) => [record.sourceKey, record]),
    );
    const repository = dataSource.getRepository(ReferenceQuestion);
    const catalog = await repository.find();
    const updates = catalog.flatMap((row) => {
      const catalogSourceKey = sourceKey(row.sourcePayload);
      const source =
        catalogSourceKey === null
          ? undefined
          : sourceByKey.get(catalogSourceKey);
      if (
        source === undefined ||
        !isOfficialAnswer(source.payload.correctAnswer) ||
        row.sourcePayload.correctAnswer === source.payload.correctAnswer
      ) {
        return [];
      }
      return [{ row, payload: source.payload }];
    });

    if (write) {
      await dataSource.transaction(async (manager) => {
        for (const update of updates) {
          const merged = preserveUnitNumber(update.row.sourcePayload, update.payload);
          update.row.sourcePayload = merged;
          update.row.contentHash = contentHash(merged);
          update.row.parseVersion = 'parsed-corpus-v2-answer-key';
          await manager.getRepository(ReferenceQuestion).save(update.row);
        }
      });
    }

    process.stdout.write(
      `${JSON.stringify(
        {
          mode: write ? 'write' : 'dry-run',
          sourceRecordCount: sourceRecords.length,
          catalogRecordCount: catalog.length,
          updatedCatalogCount: updates.length,
        },
        null,
        2,
      )}\n`,
    );
    if (!write && updates.length > 0) process.exitCode = 2;
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}

function loadSourceRecords(): readonly SourceRecord[] {
  const records: SourceRecord[] = [];
  for (const entry of SUBJECTS) {
    const directory = path.join(PARSED_ROOT, entry.folder, 'all');
    for (const name of fs.readdirSync(directory).sort()) {
      if (!name.endsWith('.json')) continue;
      const parsed = JSON.parse(
        fs.readFileSync(path.join(directory, name), 'utf8'),
      ) as unknown;
      if (!Array.isArray(parsed)) continue;
      for (const payload of parsed) {
        const sourceKeyValue = sourceKey(payload);
        if (sourceKeyValue === null || !isRecord(payload)) continue;
        records.push({
          sourceKey: sourceKeyValue,
          payload,
        });
      }
    }
  }
  return records;
}

function sourceKey(value: unknown): string | null {
  if (!isRecord(value) || !isRecord(value.source)) return null;
  const source = value.source;
  if (
    typeof source.type !== 'string' ||
    typeof source.subject !== 'string' ||
    typeof source.filename !== 'string' ||
    !isPositiveInteger(value.questionNumber)
  ) {
    return null;
  }
  if (
    source.type === 'moi' &&
    typeof source.year === 'number' &&
    typeof source.examType === 'string'
  ) {
    return `moi:${source.subject}:${source.year}:${source.examType}:${source.filename}:${value.questionNumber}`;
  }
  if (source.type === 'suteck' && isPositiveInteger(source.unitNumber)) {
    return `suteck:${source.subject}:${source.unitNumber}:${source.filename}:${value.questionNumber}`;
  }
  return null;
}

function requiredDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.trim() === '') {
    throw new Error('DATABASE_URL is required.');
  }
  return databaseUrl;
}

function contentHash(payload: Record<string, unknown>): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
}

function isOfficialAnswer(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 5
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function preserveUnitNumber(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
): Record<string, unknown> {
  if (
    !isRecord(incoming.source) ||
    isPositiveInteger(incoming.source.unitNumber)
  ) {
    return incoming;
  }
  if (
    !isRecord(existing.source) ||
    !isPositiveInteger(existing.source.unitNumber)
  ) {
    return incoming;
  }
  return {
    ...incoming,
    source: { ...incoming.source, unitNumber: existing.source.unitNumber },
  };
}

void main();
