/**
 * Repairs embedded view items (ㄱㄴㄷㄹ) in reference_questions stimulus text.
 *
 * Problem: When source_payload has viewItems extracted but the stimulus text
 * still contains the raw ㄱ/ㄴ/ㄷ/ㄹ lines, the frontend shows them twice:
 *   - via stimulus_data TPL rendering (e.g., article paragraphs)
 *   - via combo_block rendering
 *
 * This mirrors the runtime extractEmbeddedViewItems() logic in
 * reference-selector.utils.ts, but applies it as a data-at-rest fix for
 * records where viewItems already exist (the runtime skips stripping when
 * viewItems.length > 0 on line 132, so these records are never auto-cleaned).
 *
 * Usage: npx ts-node scripts/repair-embedded-view-items.ts
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { DataSource } from 'typeorm';
import * as fs from 'fs';

const LOG_FILE = 'scripts/repair-embedded-view-items.log';

/** Matches lines like "ㄱ. text", "ㄴ. text", "ㄱ．text", etc. */
const VIEW_ITEM_LINE = /^[ㄱ-ㅎ][.．]\s+\S/u;

/** Extracts the key character (ㄱ, ㄴ, ㄷ, ...) from a view item line. */
function viewItemKey(line: string): string | null {
  const match = line.trim().match(/^([ㄱ-ㅎ])/u);
  return match?.[1] ?? null;
}

function stripViewItemsFromStimulus(
  stimulus: string,
  targetKeys: ReadonlySet<string>,
): string {
  const lines = stimulus.split(/\r?\n/);
  const result: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!VIEW_ITEM_LINE.test(trimmed)) {
      result.push(line);
      continue;
    }
    const key = viewItemKey(trimmed);
    if (key === null || !targetKeys.has(key)) {
      // Keep lines that don't match known view item keys —
      // they might be legitimate content (e.g. a table entry starting with ㄱ)
      result.push(line);
    }
    // ponytail: else drop the line — it's a view item already extracted into viewItems
  }

  const joined = result.join('\n').trim();
  // ponytail: never return empty string — caller already validated stimulus is non-empty
  return joined === '' ? stimulus : joined;
}

async function main() {
  const url = process.env.DATABASE_SUPABASE_URL;
  if (!url) throw new Error('DATABASE_SUPABASE_URL required');

  const ds = new DataSource({
    type: 'postgres',
    url,
    connectTimeoutMS: 30000,
  });
  await ds.initialize();

  const log = fs.createWriteStream(LOG_FILE, { flags: 'w' });
  log.write(`=== repair-embedded-view-items ${new Date().toISOString()} ===\n\n`);

  // Find reference_questions with:
  // - non-empty viewItems in source_payload
  // - stimulus text containing lines that start with view item markers (ㄱ. etc.)
  const rows = await ds.query(
    `SELECT id, logical_source_id, source_payload
     FROM reference_questions
     WHERE jsonb_array_length(source_payload->'viewItems') > 0
       AND source_payload->>'stimulus' ~ '(^|\n)[ㄱ-ㅎ][.．]\s'`,
  );

  console.log(`Candidates: ${rows.length} rows`);
  log.write(`Candidates: ${rows.length} rows\n`);

  let cleaned = 0;
  let skipped = 0;

  for (const row of rows) {
    const payload = row.source_payload as Record<string, unknown>;
    const stimulus = String(payload.stimulus ?? '').trim();
    if (stimulus === '') {
      skipped++;
      continue;
    }

    const viewItems: string[] = Array.isArray(payload.viewItems)
      ? payload.viewItems.map(String)
      : [];

    // Collect keys from viewItems (e.g. ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ'])
    const targetKeys = new Set<string>();
    for (const item of viewItems) {
      const key = item.trim().match(/^([ㄱ-ㅎ])/u)?.[1];
      if (key) targetKeys.add(key);
    }

    if (targetKeys.size === 0) {
      skipped++;
      continue;
    }

    // Check if stimulus actually has lines matching these keys
    const dirtyLines = stimulus.split('\n').filter((line) => {
      const trimmed = line.trim();
      if (!VIEW_ITEM_LINE.test(trimmed)) return false;
      const key = viewItemKey(trimmed);
      return key !== null && targetKeys.has(key);
    });

    if (dirtyLines.length === 0) {
      skipped++;
      continue;
    }

    const cleanedStimulus = stripViewItemsFromStimulus(stimulus, targetKeys);

    if (cleanedStimulus === stimulus || cleanedStimulus === '') {
      skipped++;
      continue;
    }

    // Update the source_payload with cleaned stimulus
    await ds.query(
      `UPDATE reference_questions
       SET source_payload = jsonb_set(
         source_payload,
         '{stimulus}',
         to_jsonb($1::text)
       )
       WHERE id = $2`,
      [cleanedStimulus, row.id],
    );

    cleaned++;
    const msg = `  Cleaned: ${row.logical_source_id} — removed ${dirtyLines.length} embedded view item line(s)`;
    console.log(msg);
    log.write(msg + '\n');
    if (dirtyLines.length <= 5) {
      for (const line of dirtyLines) {
        const detail = `    → "${line.trim()}"`;
        console.log(detail);
        log.write(detail + '\n');
      }
    }
  }

  const summary = [
    '',
    `=== SUMMARY ===`,
    `Candidates checked: ${rows.length}`,
    `Cleaned (stimulus updated): ${cleaned}`,
    `Skipped (no duplicate found): ${skipped}`,
  ].join('\n');

  console.log(summary);
  log.write(summary + '\n');

  log.end();
  await ds.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
