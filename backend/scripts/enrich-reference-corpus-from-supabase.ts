import 'dotenv/config';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { Client } from 'pg';

type Json = Record<string, unknown>;
type Corpus = { source: Json; questions: Json[] };
type Stored = { subject: string; unitNumber: number; sourcePayload: Json; logicalSourceId: string };

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_SUPABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_SUPABASE_URL is required.');
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();
  try {
    const result = await client.query<Stored>(
      `select subject, unit_number as "unitNumber", logical_source_id as "logicalSourceId", source_payload as "sourcePayload"
       from reference_questions`,
    );
    const stored = result.rows;
    const root = path.resolve(__dirname, '../..');
    const corpusDir = path.join(root, 'artifacts/reference-corpus-v2');
    let matched = 0;
    let enriched = 0;
    let unmatched = 0;
    for (const file of readdirSync(corpusDir).filter((name) => name.endsWith('.json'))) {
      const filePath = path.join(corpusDir, file);
      const corpus = JSON.parse(readFileSync(filePath, 'utf8')) as Corpus;
      if (!isObject(corpus.source) || !Array.isArray(corpus.questions)) continue;
      let changed = false;
      for (const question of corpus.questions) {
        const row = findStored(stored, corpus.source, question);
        if (!row) {
          unmatched += 1;
          continue;
        }
        matched += 1;
        const source = isObject(row.sourcePayload.source) ? row.sourcePayload.source : {};
        const before = JSON.stringify(question);
        question.unitNumber = row.unitNumber;
        question.legacySourceFilename = stringValue(source.filename) || question.legacySourceFilename;
        question.answerProvenance = 'official';
        if (!isAnswer(question.correctAnswer)) question.correctAnswer = row.sourcePayload.correctAnswer;
        if (stringValue(question.explanation) === '' && stringValue(row.sourcePayload.explanation) !== '') question.explanation = row.sourcePayload.explanation;
        if (arrayOfStrings(question.targetConcepts).length === 0) question.targetConcepts = arrayOfStrings(row.sourcePayload.targetConcepts);
        const questionChanged = before !== JSON.stringify(question);
        changed ||= questionChanged;
        if (questionChanged) enriched += 1;
      }
      if (changed) writeFileSync(filePath, `${JSON.stringify(corpus, null, 2)}\n`);
    }
    process.stdout.write(JSON.stringify({ matched, enriched, unmatched }) + '\n');
  } finally {
    await client.end();
  }
}

function findStored(rows: readonly Stored[], source: Json, question: Json): Stored | null {
  const sourceType = stringValue(source.sourceType);
  const subject = stringValue(source.subject);
  const year = numberValue(source.year);
  const examType = stringValue(source.examType);
  const unit = numberValue(source.unitNumber);
  const questionNumber = numberValue(question.questionNumber);
  const candidates = rows.filter((row) => {
    const payloadSource = isObject(row.sourcePayload.source) ? row.sourcePayload.source : {};
    if (stringValue(payloadSource.type) !== sourceType || stringValue(payloadSource.subject) !== subject) return false;
    if (numberValue(row.sourcePayload.questionNumber) !== questionNumber) return false;
    if (sourceType === 'moi') return numberValue(payloadSource.year) === year && stringValue(payloadSource.examType) === examType;
    return numberValue(payloadSource.unitNumber) === unit;
  });
  return candidates.length === 1 ? candidates[0] : null;
}

function isObject(value: unknown): value is Json { return typeof value === 'object' && value !== null && !Array.isArray(value); }
function stringValue(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
function numberValue(value: unknown): number { return typeof value === 'number' ? value : Number(value); }
function arrayOfStrings(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []; }
function isAnswer(value: unknown): boolean { return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= 5; }

void main().catch((error: unknown) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
