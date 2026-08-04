import 'dotenv/config';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { DataSource } from 'typeorm';
import { ReferenceQuestion } from '../src/entities/reference-question.entity';

type CertifiedRecord = Readonly<{
  logicalSourceId: string;
  subject: string;
  unitNumber: number;
  parseVersion: 'reference-pdf-v2';
  payload: Record<string, unknown>;
}>;
type Certification = Readonly<{ certified: readonly CertifiedRecord[] }>;
type Action = Readonly<{
  action: 'insert' | 'update' | 'unchanged';
  logicalSourceId: string;
  oldHash: string | null;
  newHash: string;
}>;

const CONFIRMATION = 'APPLY_REFERENCE_PDF_V2_TO_SUPABASE';

async function main(): Promise<void> {
  const root = path.resolve(__dirname, '../..');
  const certificationPath = path.join(
    root,
    'artifacts/reference-certification-v2.json',
  );
  const certification = JSON.parse(
    requireFile(certificationPath),
  ) as Certification;
  // Multiple corpus snapshots can describe the same logical question; apply
  // only the last certified payload to avoid self-conflicts in one transaction.
  const certified = [
    ...new Map(
      certification.certified.map((record) => [record.logicalSourceId, record]),
    ).values(),
  ];
  const databaseUrl = process.env.DATABASE_SUPABASE_URL;
  if (databaseUrl === undefined || databaseUrl.trim() === '')
    throw new Error('DATABASE_SUPABASE_URL is required.');
  const dataSource = new DataSource({
    type: 'postgres',
    url: databaseUrl,
    entities: [ReferenceQuestion],
    synchronize: false,
  });
  await dataSource.initialize();
  try {
    const repository = dataSource.getRepository(ReferenceQuestion);
    const current = await repository.find();
    const bySourceId = new Map(
      current.map((row) => [row.logicalSourceId, row]),
    );
    const actions = certified.map((record) => {
      const newHash = hash(record.payload);
      const existing = bySourceId.get(record.logicalSourceId);
      return {
        action:
          existing === undefined
            ? 'insert'
            : existing.contentHash === newHash
              ? 'unchanged'
              : 'update',
        logicalSourceId: record.logicalSourceId,
        oldHash: existing?.contentHash ?? null,
        newHash,
      } satisfies Action;
    });
    const report = {
      mode: process.argv.includes('--apply') ? 'apply-requested' : 'dry-run',
      certifiedCount: certified.length,
      currentCount: current.length,
      actions,
      counts: countActions(actions),
    };
    const reportPath = path.join(
      root,
      'artifacts/reference-sync-v2-dry-run.json',
    );
    mkdirSync(path.dirname(reportPath), { recursive: true });
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    process.stdout.write(
      `${JSON.stringify({ reportPath, counts: report.counts })}\n`,
    );
    if (!process.argv.includes('--apply')) return;
    requireConfirmation();
    const backupPath = path.join(
      root,
      `artifacts/reference-sync-v2-backup-${new Date().toISOString().replaceAll(':', '-')}.json`,
    );
    writeFileSync(backupPath, `${JSON.stringify(current, null, 2)}\n`, 'utf8');
    await dataSource.transaction(async (manager) => {
      for (const record of certified) {
        const existing = bySourceId.get(record.logicalSourceId);
        const parameters = [
          record.logicalSourceId,
          hash(record.payload),
          record.subject,
          record.unitNumber,
          stringValue(record.payload.source, 'provenancePath') ??
            record.logicalSourceId,
          record.parseVersion,
          JSON.stringify(record.payload),
        ];
        if (existing === undefined) {
          const result = await manager.query(
            `INSERT INTO reference_questions
              (logical_source_id, content_hash, subject, unit_number,
               provenance_path, parse_version, source_payload)
             VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
             ON CONFLICT (logical_source_id) DO NOTHING`,
            parameters,
          );
          void result;
          continue;
        }
        const lockedRows: Array<{ content_hash: string }> = await manager.query(
          'SELECT content_hash FROM reference_questions WHERE id = $1 FOR UPDATE',
          [existing.id],
        );
        if (lockedRows[0]?.content_hash !== existing.contentHash)
          throw new Error(
            `Concurrent update conflict: ${record.logicalSourceId}`,
          );
        const result = await manager.query(
          `UPDATE reference_questions
           SET content_hash = $1, subject = $2, unit_number = $3,
               provenance_path = $4, parse_version = $5, source_payload = $6::jsonb
           WHERE id = $7
           RETURNING id`,
          [
            parameters[1],
            parameters[2],
            parameters[3],
            parameters[4],
            parameters[5],
            parameters[6],
            existing.id,
          ],
        );
        void result;
      }
    });
    process.stdout.write(`${JSON.stringify({ applied: true, backupPath })}\n`);
  } finally {
    await dataSource.destroy();
  }
}

function countActions(
  actions: readonly Action[],
): Record<Action['action'], number> {
  return {
    insert: actions.filter((action) => action.action === 'insert').length,
    update: actions.filter((action) => action.action === 'update').length,
    unchanged: actions.filter((action) => action.action === 'unchanged').length,
  };
}

function requireConfirmation(): void {
  if (!process.argv.includes(`--confirmation=${CONFIRMATION}`)) {
    throw new Error(`Apply requires --confirmation=${CONFIRMATION}`);
  }
}

function hash(value: unknown): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function requireFile(filePath: string): string {
  return readFileSync(filePath, 'utf8');
}

function stringValue(value: unknown, key: string): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return null;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === 'string' && candidate.trim() !== ''
    ? candidate
    : null;
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
