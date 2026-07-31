/**
 * Syncs answer keys from gichul_find txt files to Supabase reference_questions.
 * Covers kongil 2021-2025 exams (except image-only 2025 수능).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as dotenv from 'dotenv';
dotenv.config();

import { DataSource } from 'typeorm';
import { parseOfficialAnswerKeyText } from '../src/exams/question-parser.service';

const TXT_ROOT = path.resolve(
  __dirname,
  '../../../../playground/gichul_find/downloads/kongil_txt',
);

function loadAnswersFromTxt(): Map<string, Map<number, number>> {
  const keys = new Map<string, Map<number, number>>();
  for (const year of fs.readdirSync(TXT_ROOT).sort()) {
    const yd = path.join(TXT_ROOT, year);
    if (!fs.statSync(yd).isDirectory()) continue;
    for (const examType of fs.readdirSync(yd).sort()) {
      const ed = path.join(yd, examType);
      if (!fs.statSync(ed).isDirectory()) continue;
      for (const fn of fs.readdirSync(ed)) {
        if (!fn.includes('정답')) continue;
        const text = fs.readFileSync(path.join(ed, fn), 'utf8');
        const parsed = parseOfficialAnswerKeyText(text);
        if (parsed.size === 0) continue;
        const key = `${year}:${examType.normalize('NFC')}`;
        const existing = keys.get(key) ?? new Map<number, number>();
        for (const [qn, ans] of parsed) existing.set(qn, ans);
        keys.set(key, existing);
      }
    }
  }
  return keys;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const answerKeys = loadAnswersFromTxt();
  console.log(`Loaded ${answerKeys.size} answer key sets from txt files`);
  for (const [key, map] of answerKeys) {
    console.log(`  kongil ${key}: ${map.size} answers`);
  }

  const url = process.env.DATABASE_SUPABASE_URL;
  if (!url) throw new Error('DATABASE_SUPABASE_URL required');

  const ds = new DataSource({ type: 'postgres', url, connectTimeoutMS: 30000 });
  await ds.initialize();

  const rows = await ds.query(
    `SELECT id, logical_source_id, source_payload FROM reference_questions`,
  );

  let updated = 0;
  let matched = 0;
  let notFound = 0;
  let debugCount = 0;

  for (const row of rows) {
    if (debugCount === 0 && updated === 0 && matched === 0) {
      const sp = row.source_payload;
      console.log('DEBUG first row type:', typeof sp, 'keys:', sp ? Object.keys(sp).slice(0,5) : 'null');
      if (typeof sp === 'object' && sp) {
        console.log('  source:', typeof sp.source, sp.source?.type);
      }
    }
    const src = row.source_payload?.source;
    if (src?.type !== 'moi' || src?.subject !== 'kongil') continue;

    const qn = src?.questionNumber as number | undefined;
    if (!qn) continue;

    const year = src?.year as number | undefined;
    const examType = src?.examType as string | undefined;
    if (!year || !examType) continue;

    const key = `${year}:${examType.normalize('NFC')}`;
    const answerMap = answerKeys.get(key);
    if (!answerMap) {
      if (debugCount === 0) {
        console.log('DEBUG: key not found:', JSON.stringify(key));
        console.log('  year:', year, 'examType:', JSON.stringify(examType));
        console.log('  available keys:');
        for (const k of answerKeys.keys()) console.log('   ', JSON.stringify(k));
      }
      continue;
    }
    debugCount++;

    const officialAnswer = answerMap.get(qn);
    if (officialAnswer === undefined) {
      notFound++;
      continue;
    }

    const dbAnswer = row.source_payload?.correctAnswer;
    if (dbAnswer === officialAnswer) {
      matched++;
    } else {
      if (!dryRun) {
        await ds.query(
          `UPDATE reference_questions
           SET source_payload = jsonb_set(
             source_payload,
             '{correctAnswer}',
             to_jsonb($1::int)
           )
           WHERE id = $2`,
          [officialAnswer, row.id],
        );
      }
      updated++;
      console.log(
        `${dryRun ? '[DRY] ' : ''}Updated ${row.logical_source_id}: ${dbAnswer} -> ${officialAnswer}`,
      );
    }
  }

  console.log(`\nProcessed: ${debugCount}`);
  console.log(`Matched: ${matched}`);
  console.log(`Updated: ${updated}`);
  console.log(`Not found: ${notFound}`);
  console.log(`Mode: ${dryRun ? 'DRY RUN' : 'WRITE'}`);

  await ds.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
