/**
 * Comprehensive sweep: find all data quality issues in reference_questions.
 * Run: npx ts-node scripts/audit-all-issues.ts
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { DataSource } from 'typeorm';
import { parseReference } from '../src/exams/reference-selector.utils';

async function main() {
  const url = process.env.DATABASE_SUPABASE_URL;
  if (!url) throw new Error('DATABASE_SUPABASE_URL required');

  const ds = new DataSource({ type: 'postgres', url, connectTimeoutMS: 30000 });
  await ds.initialize();
  const rows = await ds.query(
    `SELECT logical_source_id, source_payload, unit_number FROM reference_questions`,
  );

  // === 1. Parse failures ===
  let parseFails = 0;
  const failIds: string[] = [];
  for (const r of rows) {
    if (!parseReference(r.source_payload, 'success').ok) {
      parseFails++;
      if (failIds.length < 15) failIds.push(r.logical_source_id);
    }
  }

  // === 2. Missing answer for MOI ===
  let moiMissing = 0;
  const moiSamples: string[] = [];
  for (const r of rows) {
    const src = r.source_payload?.source;
    if (src?.type !== 'moi') continue;
    const ans = r.source_payload?.correctAnswer;
    if (typeof ans !== 'number' || ans < 1 || ans > 5) {
      moiMissing++;
      if (moiSamples.length < 10) {
        moiSamples.push(
          `${r.logical_source_id} (${src.year} ${src.examType})`,
        );
      }
    }
  }

  // === 3. Stimulus residuals ===
  let residualHeader = 0;
  const headerList: string[] = [];
  for (const r of rows) {
    const stim = r.source_payload?.stimulus || '';
    if (stim.includes('물음에 답하시오')) {
      residualHeader++;
      if (headerList.length < 10) headerList.push(r.logical_source_id);
    }
  }

  // === 4. Cross-unit adjacent pairs ===
  const byFile: Record<string, typeof rows> = {};
  for (const r of rows) {
    const fn = r.source_payload?.source?.filename;
    if (!fn) continue;
    if (!byFile[fn]) byFile[fn] = [];
    byFile[fn].push(r);
  }
  let crossUnitPairs = 0;
  const crossUnitSamples: string[] = [];
  for (const [, items] of Object.entries(byFile)) {
    items.sort(
      (a, b) =>
        (a.source_payload?.questionNumber ?? 99) -
        (b.source_payload?.questionNumber ?? 99),
    );
    for (let i = 1; i < items.length; i++) {
      const prev = items[i - 1];
      const curr = items[i];
      const pq = prev.source_payload?.questionNumber;
      const cq = curr.source_payload?.questionNumber;
      if (pq && cq && cq === pq + 1 && prev.unit_number !== curr.unit_number) {
        crossUnitPairs++;
        if (crossUnitSamples.length < 10) {
          crossUnitSamples.push(
            `Q${pq}(unit${prev.unit_number}) -> Q${cq}(unit${curr.unit_number}) | ${(prev.source_payload?.source?.filename ?? '').substring(0, 50)}`,
          );
        }
      }
    }
  }

  // === REPORT ===
  console.log('=== COMPREHENSIVE ISSUE REPORT ===');
  console.log(`Total rows: ${rows.length}`);
  console.log('');
  console.log(
    `[1] PARSE FAILURES: ${parseFails} (cannot be processed at all)`,
  );
  for (const id of failIds) console.log(`    ${id}`);
  console.log('');
  console.log(
    `[2] MISSING MOI ANSWER: ${moiMissing} (answer PDF exists but not synced)`,
  );
  for (const s of moiSamples) console.log(`    ${s}`);
  console.log('');
  console.log(
    `[3] STIMULUS REMNANTS: ${residualHeader} (passage header text left in stimulus)`,
  );
  for (const id of headerList) console.log(`    ${id}`);
  console.log('');
  console.log(
    `[4] CROSS-UNIT ADJACENT: ${crossUnitPairs} (consecutive questions in different units)`,
  );
  for (const s of crossUnitSamples) console.log(`    ${s}`);

  await ds.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
