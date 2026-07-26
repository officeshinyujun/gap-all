import 'dotenv/config';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DataSource } from 'typeorm';
import { parseReference } from '../src/exams/reference-selector.utils';

type ParsedReference = Record<string, unknown> & {
  source?: Readonly<Record<string, unknown>>;
  questionNumber?: unknown;
};

type RepairTarget = Readonly<{
  sourcePath: string;
  filename: string;
  questionNumber: number;
  unitNumber: number;
  logicalSourceIds: readonly string[];
}>;

const TEXTBOOK_ROOT = path.resolve(__dirname, '..', '..', 'textbook', 'parsed');

const REPAIR_TARGETS: readonly RepairTarget[] = [
  {
    sourcePath: 'kongil/all/7단원.json',
    filename: '공일_7단원_문제.pdf',
    questionNumber: 5,
    unitNumber: 7,
    logicalSourceIds: [
      'kongil:7:공일_7단원_문제.pdf:5',
      'kongil:suteck:공일_7단원_문제.pdf:5',
    ],
  },
  {
    sourcePath: 'kongil/moi/2022_수능.json',
    filename: 'kongil_2022_수능_03 직탐(공업 일반)_문제.pdf',
    questionNumber: 20,
    unitNumber: 19,
    logicalSourceIds: [
      'kongil:moi:kongil_2022_수능_03 직탐(공업 일반)_문제.pdf:20',
    ],
  },
  {
    sourcePath: 'kongil/moi/2022_9월_모의평가.json',
    filename: 'kongil_2022_9월_모의평가_03 직탐(공업 일반)_문제.pdf',
    questionNumber: 20,
    unitNumber: 7,
    logicalSourceIds: [
      'kongil:moi:kongil_2022_9월_모의평가_03 직탐(공업 일반)_문제.pdf:20',
    ],
  },
  {
    sourcePath: 'kongil/moi/2025_9월_모의평가.json',
    filename: 'kongil_2025_9월_모의평가_03 공업 일반_문제.pdf',
    questionNumber: 20,
    unitNumber: 19,
    logicalSourceIds: [
      'kongil:moi:kongil_2025_9월_모의평가_03 공업 일반_문제.pdf:20',
    ],
  },
];

async function main(): Promise<void> {
  const apply = parseCommand(process.argv.slice(2));
  const repairs = REPAIR_TARGETS.flatMap(loadRepair);
  const sourceIds = [
    ...new Set(repairs.map((repair) => repair.parsedSourceId)),
  ];

  if (!apply) {
    renderPlan(repairs);
    return;
  }

  const dataSource = new DataSource({
    type: 'postgres',
    url: requiredDatabaseUrl(),
    synchronize: false,
  });
  try {
    await dataSource.initialize();
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      for (const repair of repairs) {
        const existing = await queryRunner.query(
          `SELECT id FROM reference_questions
           WHERE logical_source_id = $1
           FOR UPDATE`,
          [repair.sourceId],
        );
        if (!Array.isArray(existing) || existing.length !== 1) {
          throw new Error(`Expected exactly one row for ${repair.sourceId}.`);
        }
        await queryRunner.query(
          `UPDATE reference_questions
           SET source_payload = $1::jsonb, content_hash = $2
           WHERE logical_source_id = $3`,
          [JSON.stringify(repair.payload), repair.contentHash, repair.sourceId],
        );
      }
      await queryRunner.query(
        `DELETE FROM reference_frame_cache WHERE source_id = ANY($1::varchar[])`,
        [sourceIds],
      );
      await queryRunner.commitTransaction();
      renderPlan(repairs);
      process.stdout.write('Applied reference-context repairs.\n');
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}

function loadRepair(target: RepairTarget): readonly Repair[] {
  const references = JSON.parse(
    fs.readFileSync(path.join(TEXTBOOK_ROOT, target.sourcePath), 'utf8'),
  ) as unknown;
  if (!Array.isArray(references)) {
    throw new Error(`Expected an array in ${target.sourcePath}.`);
  }
  const payload = references.find(
    (value): value is ParsedReference =>
      isRecord(value) &&
      value.questionNumber === target.questionNumber &&
      isRecord(value.source) &&
      value.source.filename === target.filename,
  );
  if (payload === undefined) {
    throw new Error(
      `Missing question ${target.questionNumber} in ${target.sourcePath}.`,
    );
  }
  const parsed = parseReference(
    payloadWithUnitNumber(payload, target.unitNumber),
    'kongil',
  );
  if (!parsed.ok) {
    throw new Error(
      `Repaired payload is not selectable: ${target.sourcePath}.`,
    );
  }
  return target.logicalSourceIds.map((sourceId) => ({
    sourceId,
    payload,
    contentHash: contentHash(payload),
    parsedSourceId: parsed.value.source.sourceId,
  }));
}

function payloadWithUnitNumber(
  payload: ParsedReference,
  unitNumber: number,
): ParsedReference {
  if (!isRecord(payload.source)) {
    throw new Error('Reference payload is missing source metadata.');
  }
  return {
    ...payload,
    source: { ...payload.source, unitNumber },
  };
}

type Repair = Readonly<{
  sourceId: string;
  payload: ParsedReference;
  contentHash: string;
  parsedSourceId: string;
}>;

function renderPlan(repairs: readonly Repair[]): void {
  for (const repair of repairs) {
    process.stdout.write(
      `${repair.sourceId} -> ${repair.parsedSourceId} (${repair.contentHash})\n`,
    );
  }
}

function contentHash(payload: unknown): string {
  return `sha256:${createHash('sha256')
    .update(JSON.stringify(payload))
    .digest('hex')}`;
}

function parseCommand(arguments_: readonly string[]): boolean {
  if (arguments_.length === 0) return false;
  if (arguments_.length === 1 && arguments_[0] === '--apply') return true;
  throw new Error('Usage: repair:reference-context [--apply]');
}

function requiredDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.trim() === '') {
    throw new Error('DATABASE_URL is required.');
  }
  return databaseUrl;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

void main();
