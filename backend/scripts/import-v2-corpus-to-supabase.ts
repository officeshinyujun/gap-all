import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { Client } from 'pg';

type Json = Record<string, unknown>;
type CertifiedRecord = Readonly<{
  logicalSourceId: string;
  subject: 'success' | 'kongil';
  unitNumber: number;
  parseVersion: 'reference-pdf-v2';
  payload: Json;
}>;
type CertificationReport = Readonly<{
  certified: readonly CertifiedRecord[];
  counts: Readonly<{ total: number; certified: number; blocked: number }>;
}>;
type Row = { id: string; logical_source_id: string; content_hash: string };

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_SUPABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_SUPABASE_URL is required.');

  const root = path.resolve(__dirname, '../..');
  const certPath = path.join(root, 'artifacts/reference-certification-v2.json');
  const report = JSON.parse(readFileSync(certPath, 'utf8')) as CertificationReport;

  const dryRun = process.argv.includes('--dry-run');
  const mode = dryRun ? 'dry-run' : 'write';

  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    // Fetch existing logical_source_ids for dedup
    const existing = await client.query<Row>(
      'select id, logical_source_id, content_hash from reference_questions',
    );
    const existingById = new Map(existing.rows.map((r: Row) => [r.logical_source_id, r]));

    let inserted = 0;
    let skipped = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const record of report.certified) {
      const contentHash = hash(record.payload);
      const existingRow = existingById.get(record.logicalSourceId);

      if (existingRow !== undefined) {
        if ((existingRow as Row).content_hash === contentHash) {
          skipped += 1;
          continue;
        }
        // Content changed — update
        if (!dryRun) {
          await client.query(
            `update reference_questions
             set content_hash = $1, subject = $2, unit_number = $3,
                 provenance_path = $4, parse_version = $5, source_payload = $6::jsonb
             where logical_source_id = $7`,
            [
              contentHash,
              record.subject,
              record.unitNumber,
              provenancePath(record),
              record.parseVersion,
              JSON.stringify(record.payload),
              record.logicalSourceId,
            ],
          );
        }
        updated += 1;
        continue;
      }

      // New record — insert
      if (!dryRun) {
        await client.query(
          `insert into reference_questions
             (logical_source_id, content_hash, subject, unit_number,
              provenance_path, parse_version, source_payload)
           values ($1, $2, $3, $4, $5, $6, $7::jsonb)
           on conflict (logical_source_id) do nothing`,
          [
            record.logicalSourceId,
            contentHash,
            record.subject,
            record.unitNumber,
            provenancePath(record),
            record.parseVersion,
            JSON.stringify(record.payload),
          ],
        );
      }
      inserted += 1;
    }

    const summary = { mode, certified: report.counts.certified, inserted, updated, skipped, errors };
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);

    if (errors.length > 0) process.exitCode = 1;
  } finally {
    await client.end();
  }
}

function provenancePath(record: CertifiedRecord): string {
  const src = record.payload.source as Json | undefined;
  return typeof src?.filename === 'string'
    ? `textbook/parsed/${record.subject === 'success' ? 'sungjik' : record.subject}/all/${src.filename}`
    : `reference-pdf-v2/${record.logicalSourceId}`;
}

function hash(payload: Json): string {
  return `sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
