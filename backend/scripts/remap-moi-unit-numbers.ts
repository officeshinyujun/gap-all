import 'dotenv/config';
import { Client } from 'pg';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import * as path from 'node:path';

const SUBJECT_MAP: Record<string, string> = {
  success: 'sungjik',
  industry: 'kongil',
};

function ck(s: string): string {
  return String(s)
    .normalize('NFC')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('ko-KR');
}

/** Two-way substring match after both normalization and space removal. */
function matchesNorm(a: string, b: string): boolean {
  if (a.includes(b) || b.includes(a)) return true;
  // Remove all spaces for Korean compound word matching (조선업 ↔ 조선 공업)
  const sa = a.replace(/\s+/g, '');
  const sb = b.replace(/\s+/g, '');
  return sa.includes(sb) || sb.includes(sa);
}

/** Core term (before first parenthesis), space-removed. */
function coreTerm(s: string): string {
  return s.replace(/\(.*$/, '').replace(/\s+/g, '').trim();
}

async function main(): Promise<void> {
  const client = new Client({
    connectionString: process.env.DATABASE_SUPABASE_URL!,
    statement_timeout: 120000,
  });
  await client.connect();

  const backupRows = (await client.query(
    `SELECT logical_source_id, subject, unit_number, source_payload
     FROM reference_questions
     WHERE logical_source_id LIKE '%모의%' OR logical_source_id LIKE '%수능%'`,
  )).rows;
  const backupPath = path.resolve(
    __dirname,
    '../../artifacts/remap-moi-v2-backup-' +
      new Date().toISOString().replace(/:/g, '-') + '.json',
  );
  writeFileSync(backupPath, JSON.stringify(backupRows, null, 2), 'utf8');
  console.log(`Backup: ${backupPath} (${backupRows.length} rows)`);

  let totalChanged = 0;

  for (const [slug, dbSubject] of Object.entries(SUBJECT_MAP)) {
    const dbRefSubject = slug === 'success' ? 'success' : 'kongil';

    // Read concept names from both textbook_concepts and textbook_concept_cards
    const conceptRows = (await client.query<{
      unit_number: number;
      concept_name: string;
    }>(
      `SELECT u.unit_number, c.concept_name
       FROM textbook_concepts c
       JOIN textbook_units u ON u.id = c.unit_id
       WHERE u.subject = $1
       UNION
       SELECT u.unit_number, cc.name AS concept_name
       FROM textbook_concept_cards cc
       JOIN textbook_units u ON u.id = cc.unit_id
       WHERE u.subject = $1`,
      [dbSubject],
    )).rows;

    const byUnit = new Map<number, string[]>();
    for (const r of conceptRows) {
      const list = byUnit.get(r.unit_number) ?? [];
      list.push(r.concept_name);
      byUnit.set(r.unit_number, list);
    }
    // Normalize: full concept + space-stripped + core + space-stripped-core
    const normByUnit = new Map<number, { full: string[]; noSpace: string[]; core: string[]; coreNoSpace: string[] }>();
    for (const [u, concepts] of byUnit) {
      const full = concepts.map(ck);
      const noSpace = full.map((s) => s.replace(/\s+/g, ''));
      const core = full.map(coreTerm);
      const coreNoSpace = core.map((s) => s.replace(/\s+/g, ''));
      normByUnit.set(u, { full, noSpace, core, coreNoSpace });
    }
    const allUnits = [...normByUnit.keys()].sort((a, b) => a - b);

    const moiRows = (await client.query<{
      logical_source_id: string;
      unit_number: number;
      source_payload: Record<string, unknown>;
      target_concepts: unknown;
    }>(
      `SELECT logical_source_id, unit_number, source_payload,
              source_payload->'targetConcepts' AS target_concepts
       FROM reference_questions
       WHERE subject = $1
         AND (logical_source_id LIKE '%모의%' OR logical_source_id LIKE '%수능%')
       ORDER BY logical_source_id`,
      [dbRefSubject],
    )).rows;

    let changed = 0, unchanged = 0, noMatch = 0;

    for (const row of moiRows) {
      const tcs = row.target_concepts;
      const concepts: string[] = (
        Array.isArray(tcs)
          ? tcs
          : typeof tcs === 'string'
            ? JSON.parse(tcs)
            : []
      ).filter((c: unknown) => typeof c === 'string' && c.length > 0) as string[];
      const nc = concepts.map(ck);
      if (nc.length === 0) { unchanged++; continue; }

      let bestUnit = row.unit_number;
      let bestScore = 0;

      for (const [unit, norms] of normByUnit) {
        let score = 0;
        for (const c of nc) {
          const cs = c.replace(/\s+/g, '');
          const core = coreTerm(c);

          // Full concept match (both normal & space-stripped)
          if (norms.full.some((u) => matchesNorm(c, u))) score += 2;
          else if (norms.noSpace.some((u) => matchesNorm(cs, u))) score += 2;

          // Core term match (space-stripped)
          if (norms.coreNoSpace.some((u) => matchesNorm(core, u))) score += 1;
          else if (norms.core.some((u) => {
            const uc = coreTerm(u);
            return uc === core || uc.startsWith(core) || core.startsWith(uc);
          })) score += 1;
        }
        if (score > bestScore) { bestScore = score; bestUnit = unit; }
      }

      if (bestUnit !== row.unit_number) {
        changed++;
        const payload = { ...row.source_payload };
        const source = { ...(payload.source as Record<string, unknown> ?? {}) };
        source.unitNumber = bestUnit;
        payload.source = source;
        const contentHash =
          'sha256:' +
          createHash('sha256').update(JSON.stringify(payload)).digest('hex');
        await client.query(
          `UPDATE reference_questions
           SET unit_number = $1, content_hash = $2, source_payload = $3::jsonb
           WHERE logical_source_id = $4`,
          [bestUnit, contentHash, JSON.stringify(payload), row.logical_source_id],
        );
      } else if (bestScore === 0) {
        noMatch++;
        unchanged++;
      } else {
        unchanged++;
      }
    }

    // Print distribution
    const afterDist = new Map<number, number>();
    for (const u of allUnits) afterDist.set(u, 0);
    const verifyRows = (await client.query<{ unit_number: number; count: string }>(
      `SELECT unit_number, COUNT(*)::text
       FROM reference_questions
       WHERE subject = $1
         AND (logical_source_id LIKE '%모의%' OR logical_source_id LIKE '%수능%')
       GROUP BY unit_number
       ORDER BY unit_number`,
      [dbRefSubject],
    )).rows;
    for (const r of verifyRows) afterDist.set(r.unit_number, parseInt(r.count, 10));

    console.log(`\n${slug}:`);
    for (const [u, c] of [...afterDist.entries()].sort((a, b) => a[0] - b[0])) {
      const bar = '█'.repeat(Math.max(1, Math.round(c / 2)));
      console.log(`  u${String(u).padStart(2)}: ${String(c).padStart(3)} ${bar}`);
    }
    console.log(`  total=${moiRows.length} changed=${changed} unchanged=${unchanged} noMatch=${noMatch}`);
    totalChanged += changed;
  }

  console.log(`\nTotal changed: ${totalChanged}`);
  await client.end();
}

main().catch((err) => { console.error(err); process.exit(1); });
