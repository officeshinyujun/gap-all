/**
 * Comprehensive reference data integrity audit.
 * Checks: parseReference success, answer keys, TPL rendering, stimulus/stem corruption.
 */
import * as dotenv from 'dotenv';
dotenv.config();

import { DataSource } from 'typeorm';
import { parseReference } from '../src/exams/reference-selector.utils';
import { sourceTemplate, sourcePreservingRender } from '../src/exams/simply-reference-source-preserving.adapter';

async function main() {
  const url = process.env.DATABASE_SUPABASE_URL;
  if (!url) throw new Error('DATABASE_SUPABASE_URL required');

  const ds = new DataSource({ type: 'postgres', url, connectTimeoutMS: 30000 });
  await ds.initialize();

  const rows = await ds.query(
    `SELECT logical_source_id, source_payload, unit_number FROM reference_questions`,
  );

  let parseOk = 0, parseFail = 0;
  let hasAnswer = 0, noAnswer = 0;
  let tplOk = 0, tplFail = 0;
  let emptyStim = 0;
  let dirtyStem = 0;
  let unitMismatch = 0;

  const parseFailIds: string[] = [];
  const noAnswerIds: string[] = [];
  const tplFailIds: string[] = [];
  const dirtyStemIds: string[] = [];

  for (const r of rows) {
    const p = r.source_payload;
    const ref = parseReference(p, 'success');

    if (!ref.ok) {
      parseFail++;
      if (parseFailIds.length < 20) parseFailIds.push(r.logical_source_id);
      continue;
    }
    parseOk++;

    // Answer
    if (typeof ref.value.correctAnswer === 'number' && ref.value.correctAnswer >= 1 && ref.value.correctAnswer <= 5) {
      hasAnswer++;
    } else {
      noAnswer++;
      if (noAnswerIds.length < 20) noAnswerIds.push(r.logical_source_id);
    }

    // TPL
    const tpl = sourceTemplate(ref.value);
    if (!tpl || !sourcePreservingRender(ref.value)) {
      tplFail++;
      if (tplFailIds.length < 20) tplFailIds.push(r.logical_source_id);
    } else {
      tplOk++;
    }

    // Stimulus
    if (!ref.value.stimulus?.trim()) emptyStim++;

    // Stem cleanliness
    const stem = p.stem || '';
    if (/\[\d+[~～\-]\d+\]/.test(stem) || /^\d+\.\s/.test(stem) || /\[\d+점\]/.test(stem)) {
      dirtyStem++;
      if (dirtyStemIds.length < 10) dirtyStemIds.push(r.logical_source_id);
    }

    // Unit number consistency
    const unSrc = p.source?.unitNumber;
    const unDb = r.unit_number;
    if (unSrc && unDb && Number(unSrc) !== Number(unDb)) unitMismatch++;
  }

  console.log('=== Reference Integrity Audit ===');
  console.log(`Total: ${rows.length}`);
  console.log(`Parse OK: ${parseOk}  FAIL: ${parseFail}`);
  console.log(`Has Answer: ${hasAnswer}  No Answer: ${noAnswer}`);
  console.log(`TPL OK: ${tplOk}  TPL FAIL: ${tplFail}`);
  console.log(`Empty Stimulus: ${emptyStim}`);
  console.log(`Dirty Stem: ${dirtyStem}`);
  console.log(`Unit Mismatch: ${unitMismatch}`);

  if (parseFailIds.length) {
    console.log('\nParse FAIL samples:');
    for (const id of parseFailIds) console.log(' ', id);
  }
  if (noAnswerIds.length) {
    console.log('\nNo Answer samples:');
    for (const id of noAnswerIds) console.log(' ', id);
  }
  if (tplFailIds.length) {
    console.log('\nTPL FAIL samples:');
    for (const id of tplFailIds) console.log(' ', id);
  }
  if (dirtyStemIds.length) {
    console.log('\nDirty Stem samples:');
    for (const id of dirtyStemIds) console.log(' ', id);
  }

  await ds.destroy();
}

main().catch((e) => { console.error(e); process.exit(1); });
