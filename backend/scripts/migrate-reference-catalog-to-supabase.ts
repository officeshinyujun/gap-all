import 'dotenv/config';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { DataSource } from 'typeorm';
import { ReferenceQuestion } from '../src/entities/reference-question.entity';

const ROOT = path.resolve(__dirname, '../..');
const CONFIRMATION = 'APPLY_CATALOG_MIGRATION_TO_SUPABASE_I_CONFIRM';

type CatalogRow = Pick<
  ReferenceQuestion,
  | 'id'
  | 'logicalSourceId'
  | 'subject'
  | 'unitNumber'
  | 'contentHash'
  | 'sourcePayload'
>;

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (
    !args.includes('--write') ||
    !args.includes(`--confirmation=${CONFIRMATION}`)
  ) {
    throw new Error(
      `Usage: migrate-reference-catalog-to-supabase --write --confirmation=${CONFIRMATION}`,
    );
  }

  const ds = new DataSource({
    type: 'postgres',
    url: requiredDbUrl(),
    entities: [ReferenceQuestion],
    synchronize: false,
  });
  await ds.initialize();
  try {
    const rows = await ds.getRepository(ReferenceQuestion).find();
    const plan = buildPlan(rows);

    // Backup
    const bp = writeBackup(plan);
    console.log(`Backup: ${bp}`);

    // Step 1: Rename collision-free legacy rows
    const renamed = await applyRenames(ds, plan);
    console.log(`Renamed: ${renamed} rows`);

    // Step 2: Delete duplicate legacy rows (keep canonicals)
    const deleted = await deleteLegacyDuplicates(ds, plan);
    console.log(`Deleted duplicates: ${deleted} rows`);

    console.log(
      JSON.stringify(
        {
          mode: 'write',
          catalogBefore: rows.length,
          backupPath: path.relative(ROOT, bp),
          renamed,
          deleted,
        },
        null,
        2,
      ),
    );
  } finally {
    if (ds.isInitialized) await ds.destroy();
  }
}

function buildPlan(rows: readonly CatalogRow[]) {
  const groups = new Map<string, CatalogRow[]>();
  for (const row of rows) {
    const cid = canonicalId(row);
    if (cid === null) continue;
    const g = groups.get(cid) ?? [];
    g.push(row);
    groups.set(cid, g);
  }

  const renames: { row: CatalogRow; canonicalId: string }[] = [];
  const duplicates: { group: CatalogRow[]; canonicalId: string }[] = [];

  for (const [canonicalId, group] of groups) {
    const canonicals = group.filter((r) => r.logicalSourceId === canonicalId);
    const legacies = group.filter((r) => r.logicalSourceId !== canonicalId);
    if (legacies.length === 0) continue;

    if (canonicals.length === 0 && legacies.length === 1) {
      renames.push({ row: legacies[0], canonicalId });
    } else if (canonicals.length > 0) {
      duplicates.push({ group, canonicalId });
    }
  }

  return { renames, duplicates, allRows: rows };
}

function canonicalId(row: CatalogRow): string | null {
  const src = asRecord(row.sourcePayload.source);
  const subject =
    canonicalSubject(row.subject) ?? canonicalSubject(src.subject);
  const filename = str(src.filename);
  const qn = posInt(row.sourcePayload.questionNumber);
  const un = posInt(row.unitNumber);
  if (subject === null || filename === null || qn === null || un === null)
    return null;
  return `${subject}:${un}:${filename}:${qn}`;
}

function canonicalSubject(v: unknown): 'success' | 'kongil' | null {
  switch (v) {
    case 'success':
    case 'sungjik':
      return 'success';
    case 'kongil':
      return 'kongil';
    default:
      return null;
  }
}

async function applyRenames(
  ds: DataSource,
  plan: ReturnType<typeof buildPlan>,
) {
  return ds.transaction(async (mgr) => {
    const repo = mgr.getRepository(ReferenceQuestion);
    for (const { row, canonicalId } of plan.renames) {
      row.logicalSourceId = canonicalId;
      row.subject = canonicalId.split(':')[0] ?? row.subject;
      await repo.save(row);
    }
    return plan.renames.length;
  });
}

async function deleteLegacyDuplicates(
  ds: DataSource,
  plan: ReturnType<typeof buildPlan>,
) {
  const ids = plan.duplicates.flatMap((d) =>
    d.group.filter((r) => r.logicalSourceId !== d.canonicalId).map((r) => r.id),
  );
  return ds.transaction(async (mgr) => {
    const repo = mgr.getRepository(ReferenceQuestion);
    for (const id of ids) await repo.delete(id);
    return ids.length;
  });
}

function writeBackup(plan: ReturnType<typeof buildPlan>) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const bp = path.join(
    ROOT,
    '.audit-reports',
    `supabase-catalog-migration-backup-${stamp}.json`,
  );
  const backup = {
    format: 'supabase-catalog-migration-backup-v1',
    createdAt: new Date().toISOString(),
    catalogRowCount: plan.allRows.length,
    renamedCount: plan.renames.length,
    duplicateCount: plan.duplicates.length,
    renames: plan.renames.map((r) => ({
      id: r.row.id,
      from: r.row.logicalSourceId,
      to: r.canonicalId,
    })),
    duplicates: plan.duplicates.map((d) => ({
      canonicalId: d.canonicalId,
      rowIds: d.group.map((r) => r.id),
      logicalSourceIds: d.group.map((r) => r.logicalSourceId),
    })),
  };
  fs.mkdirSync(path.dirname(bp), { recursive: true });
  fs.writeFileSync(bp, JSON.stringify(backup, null, 2) + '\n');
  return bp;
}

function asRecord(v: unknown): Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : {};
}
function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() !== '' ? v : null;
}
function posInt(v: unknown): number | null {
  return typeof v === 'number' && Number.isSafeInteger(v) && v > 0 ? v : null;
}
function requiredDbUrl(): string {
  const u = process.env.DATABASE_URL;
  if (!u) throw new Error('DATABASE_URL required');
  return u;
}

void main();
