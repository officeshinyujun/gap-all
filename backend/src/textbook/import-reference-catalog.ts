import * as fs from 'node:fs';
import * as path from 'node:path';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import {
  ReferenceCatalogImportService,
  type ReferenceCatalogImportRecord,
} from './reference-catalog-import.service';

const SUBJECTS = [
  { folder: 'sungjik', subject: 'success' },
  { folder: 'kongil', subject: 'kongil' },
] as const;

type SourceMetadata = Readonly<{
  filename: string;
  unitNumber: number;
  questionNumber: number;
}>;

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const service = app.get(ReferenceCatalogImportService);
    const databaseName = new URL(process.env.DATABASE_URL ?? '').pathname.slice(
      1,
    );
    const result = await service.importRecords({
      databaseName,
      nodeEnv: process.env.NODE_ENV ?? 'development',
      confirmation: 'RESET_GENERATION_DATA',
      backupManifestId: 'parsed-corpus-v1',
      records: loadRecords(),
    });
    console.log(JSON.stringify(result));
  } finally {
    await app.close();
  }
}

function loadRecords(): readonly ReferenceCatalogImportRecord[] {
  const records: ReferenceCatalogImportRecord[] = [];
  for (const entry of SUBJECTS) {
    const directory = path.resolve(
      __dirname,
      '../../../textbook/parsed',
      entry.folder,
      'all',
    );
    for (const name of fs.readdirSync(directory).sort()) {
      if (!name.endsWith('.json')) continue;
      const filePath = path.join(directory, name);
      const payload: unknown = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      if (!Array.isArray(payload)) continue;
      for (const item of payload) {
        if (!isRecord(item)) continue;
        const source = sourceMetadata(item);
        if (source === null) continue;
        records.push({
          path: path.relative(path.resolve(__dirname, '../../..'), filePath),
          logicalSourceId: `${entry.subject}:${source.unitNumber}:${source.filename}:${source.questionNumber}`,
          subject: entry.subject,
          unitNumber: source.unitNumber,
          parseVersion: 'parsed-corpus-v1',
          payload: item,
        });
      }
    }
  }
  return records;
}

function sourceMetadata(value: unknown): SourceMetadata | null {
  if (!isRecord(value) || !isRecord(value.source)) return null;
  return typeof value.source.filename === 'string' &&
    isPositiveInteger(value.source.unitNumber) &&
    isPositiveInteger(value.questionNumber)
    ? {
        filename: value.source.filename,
        unitNumber: value.source.unitNumber,
        questionNumber: value.questionNumber,
      }
    : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

void main();
