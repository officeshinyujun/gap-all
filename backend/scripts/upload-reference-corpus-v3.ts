import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { createClient } from '@supabase/supabase-js';

// artifacts/reference-corpus-v3/built/*.json -> Supabase Storage(reference-figures) + reference_questions(v3 행).
// 기본은 dry-run. --apply 를 줘야 실제로 쓴다. v2 행은 건드리지 않는다.
// usage: node -r ts-node/register scripts/upload-reference-corpus-v3.ts [--apply] [sourceDir ...]

const BUCKET = 'reference-figures';
const PARSE_VERSION = 'reference-pdf-v3';

type Figure = { id: string; cropPath: string; storagePath: string | null; url?: string | null };
type Row = {
  logical_source_id: string;
  content_hash: string;
  subject: string;
  unit_number: number | null;
  unit_numbers: number[];
  provenance_path: string;
  parse_version: string;
  source_payload: { figures: Figure[]; [key: string]: unknown };
};

const repositoryRoot = path.resolve(__dirname, '../..');
const builtRoot = path.join(repositoryRoot, 'artifacts/reference-corpus-v3/built');

function contentHash(payload: unknown): string {
  return `sha256:${createHash('sha256').update(stableStringify(payload)).digest('hex')}`;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function loadRows(sourceDirs: readonly string[]): Map<string, Row[]> {
  const files = readdirSync(builtRoot).filter((name) => name.endsWith('.json'));
  const selected = sourceDirs.length > 0 ? files.filter((name) => sourceDirs.includes(name.replace(/\.json$/, ''))) : files;
  return new Map(selected.map((name) => [name.replace(/\.json$/, ''), JSON.parse(readFileSync(path.join(builtRoot, name), 'utf8')) as Row[]]));
}

function preflight(bySource: Map<string, Row[]>): string[] {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const [sourceDir, rows] of bySource) {
    for (const row of rows) {
      if (row.parse_version !== PARSE_VERSION) problems.push(`${row.logical_source_id}: parse_version ${row.parse_version}`);
      if (row.unit_number === null) problems.push(`${row.logical_source_id}: unit_number missing`);
      if (row.unit_numbers.length === 0) problems.push(`${row.logical_source_id}: unit_numbers empty`);
      if (ids.has(row.logical_source_id)) problems.push(`${row.logical_source_id}: duplicate id`);
      ids.add(row.logical_source_id);
      for (const figure of row.source_payload.figures) {
        try {
          readFileSync(path.join(repositoryRoot, figure.cropPath));
        } catch {
          problems.push(`${sourceDir} ${figure.cropPath}: crop file missing`);
        }
      }
    }
  }
  return problems;
}

async function main(): Promise<void> {
  const apply = process.argv.includes('--apply');
  const sourceDirs = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  const bySource = loadRows(sourceDirs);
  const rowCount = [...bySource.values()].reduce((sum, rows) => sum + rows.length, 0);
  const figureCount = [...bySource.values()].flat().reduce((sum, row) => sum + row.source_payload.figures.length, 0);
  console.log(`${bySource.size} sources, ${rowCount} rows, ${figureCount} figures`);

  const problems = preflight(bySource);
  if (problems.length > 0) {
    console.error(`preflight failed (${problems.length}):\n  ${problems.slice(0, 40).join('\n  ')}`);
    process.exit(1);
  }
  if (!apply) {
    console.log('dry-run: nothing written. Pass --apply to upload.');
    return;
  }

  const supabase = createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_KEY ?? '');
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (listError) throw listError;
  if (!buckets.some((bucket) => bucket.name === BUCKET)) {
    const { error } = await supabase.storage.createBucket(BUCKET, { public: true, allowedMimeTypes: ['image/png'] });
    if (error) throw error;
    console.log(`created bucket ${BUCKET}`);
  }

  const uploadLog: Array<{ sourceDir: string; rows: number; figures: number }> = [];
  for (const [sourceDir, rows] of bySource) {
    const ready: Row[] = [];
    for (const row of rows) {
      const figures: Figure[] = [];
      for (const figure of row.source_payload.figures) {
        const storagePath = `v3/${sourceDir}/${path.basename(figure.cropPath)}`;
        const { error } = await supabase.storage
          .from(BUCKET)
          .upload(storagePath, readFileSync(path.join(repositoryRoot, figure.cropPath)), { contentType: 'image/png', upsert: true });
        if (error) throw new Error(`${storagePath}: ${error.message}`);
        const url = supabase.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;
        figures.push({ ...figure, storagePath, url });
      }
      const payload = { ...row.source_payload, figures };
      ready.push({ ...row, source_payload: payload, content_hash: contentHash(payload) });
    }
    const { error } = await supabase.from('reference_questions').upsert(ready, { onConflict: 'logical_source_id' });
    if (error) throw new Error(`${sourceDir}: ${error.message}`);
    const figureTotal = ready.reduce((sum, row) => sum + row.source_payload.figures.length, 0);
    uploadLog.push({ sourceDir, rows: ready.length, figures: figureTotal });
    console.log(`${sourceDir}: ${ready.length} rows, ${figureTotal} figures`);
  }
  writeFileSync(
    path.join(repositoryRoot, 'artifacts/reference-corpus-v3/upload-log.json'),
    JSON.stringify({ uploadedAt: new Date().toISOString(), bucket: BUCKET, parseVersion: PARSE_VERSION, sources: uploadLog }, null, 1),
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
