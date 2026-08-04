import 'dotenv/config';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { Client } from 'pg';

type Json = Record<string, any>;
type Stored = { id: string; content_hash: string; subject: string; unit_number: number; source_payload: Json };
const CONFIRMATION = 'APPLY_GENERATED_REFERENCE_EXPLANATIONS_V1';

async function main(): Promise<void> {
  const url = process.env.DATABASE_SUPABASE_URL;
  if (!url) throw new Error('DATABASE_SUPABASE_URL is required.');
  const root = path.resolve(__dirname, '../..');
  const corpusDir = path.join(root, 'artifacts/reference-corpus-v2');
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<Stored>('select id, content_hash, subject, unit_number, source_payload from reference_questions');
    const generated = new Map<string, string>();
    for (const file of readdirSync(corpusDir).filter((name) => name.endsWith('.json'))) {
      const corpus = JSON.parse(readFileSync(path.join(corpusDir, file), 'utf8')) as Json;
      for (const question of corpus.questions ?? []) {
        const text = stringValue(question.generatedExplanation);
        if (!text) continue;
        const row = rows.find((candidate) => matches(candidate, corpus.source, question));
        if (row) generated.set(row.id, text);
      }
    }
    const actions = rows.flatMap((row) => {
      const text = generated.get(row.id);
      if (!text || stringValue(row.source_payload.generatedExplanation) === text) return [];
      const payload = { ...row.source_payload, generatedExplanation: text, generatedExplanationProvenance: 'subagent-generated', generatedExplanationVersion: 'manual-v1' };
      return [{ row, payload, hash: hash(payload) }];
    });
    const report = { mode: process.argv.includes('--apply') ? 'apply-requested' : 'dry-run', matched: generated.size, updates: actions.length };
    const reportPath = path.join(root, 'artifacts/reference-generated-explanation-sync-v1.json');
    writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({ ...report, reportPath })}\n`);
    if (!process.argv.includes('--apply')) return;
    if (!process.argv.includes(`--confirmation=${CONFIRMATION}`)) throw new Error(`Apply requires --confirmation=${CONFIRMATION}`);
    const backupPath = path.join(root, `artifacts/reference-generated-explanation-backup-${new Date().toISOString().replaceAll(':', '-')}.json`);
    mkdirSync(path.dirname(backupPath), { recursive: true });
    writeFileSync(backupPath, `${JSON.stringify(rows, null, 2)}\n`);
    await client.query('begin');
    try {
      for (const action of actions) {
        await client.query('update reference_questions set content_hash=$1, source_payload=$2::jsonb where id=$3', [action.hash, JSON.stringify(action.payload), action.row.id]);
      }
      await client.query('commit');
    } catch (error) { await client.query('rollback'); throw error; }
    process.stdout.write(`${JSON.stringify({ applied: actions.length, backupPath })}\n`);
  } finally { await client.end(); }
}

function matches(row: Stored, source: Json, question: Json): boolean {
  const candidate = row.source_payload?.source ?? {};
  if (candidate.type !== source.sourceType || candidate.subject !== source.subject) return false;
  if (Number(row.source_payload?.questionNumber) !== Number(question.questionNumber)) return false;
  if (source.sourceType === 'moi') return Number(candidate.year) === Number(source.year) && candidate.examType === source.examType;
  return Number(candidate.unitNumber) === Number(source.unitNumber);
}
function stringValue(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
function hash(value: unknown): string { return `sha256:${createHash('sha256').update(JSON.stringify(value)).digest('hex')}`; }

void main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
