/**
 * Repairs stimulus data issues in reference_questions:
 * 1. Removes passage headers ([N~M]) from stimuli
 * 2. Propagates stimuli from primary to shared-pair questions
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { DataSource } from 'typeorm';

const PASSAGE_HEADER = /^\s*\[\s*\d+\s*[~\uFF5E\u2013-]\s*\d+\s*\][^\n]*\n?/u;

async function main() {
  const url = process.env.DATABASE_SUPABASE_URL;
  if (!url) throw new Error('DATABASE_SUPABASE_URL required');

  const ds = new DataSource({
    type: 'postgres',
    url,
    connectTimeoutMS: 30000,
  });
  await ds.initialize();

  // 1. Clean passage headers from stimuli
  const stimHeaderRows = await ds.query(
    `SELECT id, logical_source_id, source_payload->>'stimulus' as stim
     FROM reference_questions
     WHERE source_payload->>'stimulus' ~ '\\[\\d+[~〜\\-]\\d+\\]'`,
  );

  let stimCleaned = 0;
  for (const row of stimHeaderRows) {
    const cleaned = row.stim.replace(PASSAGE_HEADER, '').trim();
    if (cleaned !== row.stim && cleaned !== '') {
      await ds.query(
        `UPDATE reference_questions
         SET source_payload = jsonb_set(
           source_payload,
           '{stimulus}',
           to_jsonb($1::text)
         )
         WHERE id = $2`,
        [cleaned, row.id],
      );
      stimCleaned++;
      console.log(`  Cleaned stim: ${row.logical_source_id}`);
    }
  }
  console.log(`Stimulus passage headers cleaned: ${stimCleaned}`);

  // 2. Propagate stimuli to empty-stim shared-pair questions
  const emptyStimRows = await ds.query(
    `SELECT id, logical_source_id, source_payload
     FROM reference_questions
     WHERE source_payload->>'stimulus' = ''
        OR source_payload->>'stimulus' IS NULL`,
  );

  let propagated = 0;
  for (const row of emptyStimRows) {
    const p = row.source_payload;
    const fn = p.source?.filename as string | undefined;
    const qn = (p.source?.questionNumber ?? p.questionNumber) as
      | number
      | undefined;
    if (!fn || !qn) continue;

    // Find previous question in same source file
    const prevRows = await ds.query(
      `SELECT source_payload->>'stimulus' as stim
       FROM reference_questions
       WHERE logical_source_id LIKE $1
       LIMIT 1`,
      [`%:${fn}:${qn - 1}`],
    );

    if (prevRows.length > 0 && prevRows[0].stim) {
      const inherited = String(prevRows[0].stim);
      await ds.query(
        `UPDATE reference_questions
         SET source_payload = jsonb_set(
           source_payload,
           '{stimulus}',
           to_jsonb($1::text)
         )
         WHERE id = $2`,
        [inherited, row.id],
      );
      propagated++;
      console.log(
        `  Propagated: ${row.logical_source_id} <- prev Q${qn - 1}`,
      );
    }
  }
  console.log(`Stimulus propagated: ${propagated}`);

  // Final count
  const remain = await ds.query(
    `SELECT count(*) as c
     FROM reference_questions
     WHERE source_payload->>'stimulus' = ''
        OR source_payload->>'stimulus' IS NULL`,
  );
  console.log(`Remaining empty stimulus: ${remain[0].c}`);

  await ds.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
