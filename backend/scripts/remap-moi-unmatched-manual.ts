import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Client } from 'pg';

// Manual content-based mapping for the 142 items whose short target labels did
// not match a core study-card label. Cards are read-only; only MOI rows move.
const successUnits = [
  1, 1, 1, 1, 1, 3, 12, 9, 10, 10, 10, 13, 2, 2, 2, 1, 1, 8,
  6, 20, 20, 20, 7, 13, 7, 7, 7, 7, 4, 5, 4, 5, 4, 4, 5, 4, 5,
  5, 5, 5, 4, 4, 17, 17, 16, 14, 14, 14, 14, 4, 16, 15, 15, 17,
  17, 19, 19, 19, 19, 19, 19, 19, 19, 19, 18, 18, 18, 18, 18, 18,
  20, 20, 20,
] as const;

const kongilUnits = [
  1, 1, 3, 3, 1, 3, 1, 1, 6, 4, 5, 4, 7, 5, 8, 20, 10, 10, 20,
  7, 19, 7, 1, 20, 1, 6, 5, 8, 5, 1, 8, 7, 11, 1, 13, 10, 9, 9,
  14, 17, 15, 17, 16, 15, 17, 17, 1, 3, 18, 18, 15, 15, 14, 14,
  14, 15, 7, 8, 6, 11, 10, 6, 10, 8, 11, 13, 11, 20, 9,
] as const;

type Item = {
  logical_source_id: string;
  subject: 'success' | 'kongil';
  current_unit: number;
};

async function main(): Promise<void> {
  const client = new Client({
    connectionString: process.env.DATABASE_SUPABASE_URL,
    statement_timeout: 120_000,
  });
  await client.connect();
  try {
    const items = JSON.parse(
      readFileSync(
        path.resolve(__dirname, '../../artifacts/moi-tagging/unmatched.json'),
        'utf8',
      ),
    ) as Item[];
    const success = items.filter((item) => item.subject === 'success');
    const kongil = items.filter((item) => item.subject === 'kongil');
    if (success.length !== successUnits.length || kongil.length !== kongilUnits.length) {
      throw new Error(`mapping length mismatch: success ${success.length}/${successUnits.length}, kongil ${kongil.length}/${kongilUnits.length}`);
    }

    const backup = await client.query(
      `SELECT logical_source_id, subject, unit_number, content_hash, source_payload
       FROM reference_questions
       WHERE logical_source_id = ANY($1::text[])`,
      [items.map((item) => item.logical_source_id)],
    );
    const backupPath = path.resolve(
      __dirname,
      `../../artifacts/moi-unmatched-manual-backup-${new Date().toISOString().replace(/:/g, '-')}.json`,
    );
    writeFileSync(backupPath, JSON.stringify(backup.rows, null, 2));

    const updates = [
      ...success.map((item, index) => ({ ...item, unit: successUnits[index] })),
      ...kongil.map((item, index) => ({ ...item, unit: kongilUnits[index] })),
    ].filter((item) => item.unit !== item.current_unit);

    console.log({ candidates: items.length, updates: updates.length, backup: backupPath });
    for (const item of updates) console.log(`${item.logical_source_id}: ${item.current_unit} -> ${item.unit}`);

    await client.query('BEGIN');
    for (const item of updates) {
      const row = await client.query<{ source_payload: Record<string, unknown> }>(
        `SELECT source_payload FROM reference_questions WHERE logical_source_id = $1 FOR UPDATE`,
        [item.logical_source_id],
      );
      if (!row.rows[0]) throw new Error(`missing row: ${item.logical_source_id}`);
      const payload = { ...row.rows[0].source_payload };
      const source = {
        ...((payload.source as Record<string, unknown> | undefined) ?? {}),
        unitNumber: item.unit,
      };
      payload.source = source;
      const contentHash = `sha256:${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
      await client.query(
        `UPDATE reference_questions
         SET unit_number = $1, content_hash = $2, source_payload = $3::jsonb
         WHERE logical_source_id = $4`,
        [item.unit, contentHash, JSON.stringify(payload), item.logical_source_id],
      );
    }
    await client.query('COMMIT');
    console.log(`applied: ${updates.length}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
