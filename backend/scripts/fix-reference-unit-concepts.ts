import 'dotenv/config';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';

const TEXTBOOK_CONCEPTS_PATH = path.resolve(
  __dirname,
  '..',
  '..',
  'textbook',
  'concepts',
);

interface MismatchRow {
  id: string;
  fromUnit: number;
  toUnit: number;
  concept: string;
  confidence: 'exact' | 'fuzzy' | 'unknown';
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(`Usage: fix:reference-unit-concepts [--apply]

  --dry-run   (default) Read-only report
  --apply     Apply unit_number corrections for EXACT-match concepts only`);
    return;
  }

  const shouldApply = args.includes('--apply');
  const subjectConcepts = loadSubjectConcepts();
  const conceptToUnits = buildReverseIndex(subjectConcepts);
  const dataSource = new DataSource({
    type: 'postgres',
    url: requiredDatabaseUrl(),
    synchronize: false,
  });

  try {
    await dataSource.initialize();
    const queryRunner = dataSource.createQueryRunner();

    const rows = await queryRunner.query(
      `SELECT id, unit_number, source_payload->>'targetConcepts' as concepts
       FROM reference_questions
       WHERE subject IN ('success', 'sungjik')
       ORDER BY unit_number`,
    );

    const mismatches = findMismatches(
      rows,
      subjectConcepts.sungjik ?? {},
      conceptToUnits,
    );

    const exact = mismatches.filter((m) => m.confidence === 'exact');
    const fuzzy = mismatches.filter((m) => m.confidence === 'fuzzy');
    const unknown = mismatches.filter((m) => m.confidence === 'unknown');

    console.log(`=== UNIT-CONCEPT FIX REPORT ===`);
    console.log(`Total mismatches: ${mismatches.length}`);
    console.log(`Exact match (safe to auto-fix): ${exact.length}`);
    console.log(`Fuzzy match (needs review): ${fuzzy.length}`);
    console.log(`Unknown: ${unknown.length}`);
    console.log();

    if (exact.length > 0) {
      console.log(`--- EXACT (will be auto-fixed with --apply) ---`);
      const grouped = groupBy(
        exact,
        (m) => `${m.concept} (unit ${m.fromUnit}→${m.toUnit})`,
      );
      for (const [label, items] of Object.entries(grouped)) {
        console.log(
          `  ${items[0].id.slice(0, 8)}... (+${items.length - 1} more) ${label}`,
        );
      }
      console.log();
    }

    if (fuzzy.length > 0) {
      console.log(`--- FUZZY (needs manual review) ---`);
      const grouped = groupBy(
        fuzzy,
        (m) => `${m.concept} (unit ${m.fromUnit}→${m.toUnit})`,
      );
      for (const [label, items] of Object.entries(grouped)) {
        console.log(
          `  ${items[0].id.slice(0, 8)}... (+${items.length - 1} more) ${label}`,
        );
      }
      console.log();
    }

    if (shouldApply && exact.length > 0) {
      console.log(`Applying ${exact.length} unit_number corrections...`);
      for (const m of exact) {
        await queryRunner.query(
          `UPDATE reference_questions SET unit_number = $1 WHERE id = $2`,
          [m.toUnit, m.id],
        );
      }
      console.log('Done.');
    } else if (shouldApply && exact.length === 0) {
      console.log('No exact-match corrections to apply.');
    }

    await queryRunner.release();
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}

function loadSubjectConcepts(): Record<string, Record<number, string[]>> {
  const index: Record<string, Record<number, string[]>> = {};
  for (const folder of fs.readdirSync(TEXTBOOK_CONCEPTS_PATH)) {
    const folderPath = path.join(TEXTBOOK_CONCEPTS_PATH, folder);
    if (!fs.statSync(folderPath).isDirectory()) continue;
    const subjectIndex: Record<number, string[]> = {};
    for (const file of fs.readdirSync(folderPath)) {
      const match = file.match(/Unit_(\d+)\.json/);
      if (!match) continue;
      const unitNum = parseInt(match[1], 10);
      const data = JSON.parse(
        fs.readFileSync(path.join(folderPath, file), 'utf-8'),
      );
      subjectIndex[unitNum] = data.concepts ?? [];
    }
    index[folder] = subjectIndex;
  }
  return index;
}

function buildReverseIndex(
  subjectConcepts: Record<string, Record<number, string[]>>,
): Record<string, number[]> {
  const index: Record<string, number[]> = {};
  for (const units of Object.values(subjectConcepts)) {
    for (const [unitNum, concepts] of Object.entries(units)) {
      for (const c of concepts) {
        (index[c] = index[c] || []).push(parseInt(unitNum, 10));
      }
    }
  }
  return index;
}

function findMismatches(
  rows: any[],
  subjectIndex: Record<number, string[]>,
  conceptToUnits: Record<string, number[]>,
): MismatchRow[] {
  const mismatches: MismatchRow[] = [];
  for (const row of rows) {
    let concepts: string[];
    try {
      concepts = JSON.parse(row.concepts);
    } catch {
      continue;
    }
    if (!Array.isArray(concepts) || concepts.length === 0) continue;
    const primary = concepts[0];
    const currentUnit = row.unit_number;
    const currentConcepts = subjectIndex[currentUnit];
    if (!currentConcepts) continue;
    if (
      currentConcepts.includes(primary) ||
      fuzzyMatch(primary, currentConcepts)
    )
      continue;

    // Check for exact match in another unit
    const targetUnits = conceptToUnits[primary];
    if (targetUnits) {
      const best = targetUnits.find((u) => u !== currentUnit);
      if (best !== undefined) {
        mismatches.push({
          id: row.id,
          fromUnit: currentUnit,
          toUnit: best,
          concept: primary,
          confidence: 'exact',
        });
        continue;
      }
    }

    // Check for fuzzy match in another unit
    let found = false;
    for (const [unitNum, concepts] of Object.entries(subjectIndex)) {
      const u = parseInt(unitNum, 10);
      if (u === currentUnit) continue;
      if (fuzzyMatch(primary, concepts)) {
        mismatches.push({
          id: row.id,
          fromUnit: currentUnit,
          toUnit: u,
          concept: primary,
          confidence: 'fuzzy',
        });
        found = true;
        break;
      }
    }
    if (!found) {
      mismatches.push({
        id: row.id,
        fromUnit: currentUnit,
        toUnit: 0,
        concept: primary,
        confidence: 'unknown',
      });
    }
  }
  return mismatches;
}

function fuzzyMatch(concept: string, validConcepts: string[]): boolean {
  const norm = (s: string): string => s.replace(/\s+/g, '');
  const sourceNorm = norm(concept);
  for (const tc of validConcepts) {
    const tcNorm = norm(tc);
    if (
      sourceNorm === tcNorm ||
      sourceNorm.includes(tcNorm) ||
      tcNorm.includes(sourceNorm)
    ) {
      return true;
    }
  }
  const sourceTokens = concept.split(/\s+/).filter(Boolean);
  for (const tc of validConcepts) {
    const tcTokens = tc.split(/\s+/).filter(Boolean);
    for (const st of sourceTokens) {
      for (const tt of tcTokens) {
        if (st === tt) return true;
      }
    }
  }
  return false;
}

function groupBy<T>(
  items: T[],
  keyFn: (item: T) => string,
): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const item of items) {
    const key = keyFn(item);
    (groups[key] = groups[key] || []).push(item);
  }
  return groups;
}

function requiredDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl === undefined || databaseUrl.trim() === '') {
    throw new Error('DATABASE_URL is required.');
  }
  return databaseUrl;
}

void main();
