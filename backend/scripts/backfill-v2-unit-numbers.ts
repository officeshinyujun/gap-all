import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

type Json = Record<string, unknown>;
type Corpus = { source: Json; questions: Json[] };

function main(): void {
  const root = path.resolve(__dirname, '../..');
  const corpusDir = path.join(root, 'artifacts/reference-corpus-v2');
  const parsedRoot = path.join(root, 'textbook/parsed');

  // Build index from v1 parsed MOI data: sourceKey → unitNumber
  const unitIndex = new Map<string, number>();
  for (const subject of ['kongil', 'sungjik']) {
    const moiDir = path.join(parsedRoot, subject, 'moi');
    for (const file of readdirSafe(moiDir)) {
      if (!file.endsWith('.json')) continue;
      const items: unknown = JSON.parse(
        readFileSync(path.join(moiDir, file), 'utf8'),
      );
      if (!Array.isArray(items)) continue;
      for (const item of items) {
        if (!isRecord(item) || !isRecord(item.source)) continue;
        const qn = numberValue(item.questionNumber);
        const unit = numberValue(item.unitNumber); // top-level unitNumber
        if (qn < 1 || unit < 1) continue;
        const key = sourceKey(item.source, qn);
        if (key !== null) unitIndex.set(key, unit);
      }
    }
  }

  // Enrich v2 corpus with unit numbers
  let matched = 0;
  let fixed = 0;
  let skipped = 0;
  for (const file of readdirSync(corpusDir).filter((n) => n.endsWith('.json'))) {
    const filePath = path.join(corpusDir, file);
    const corpus = JSON.parse(readFileSync(filePath, 'utf8')) as Corpus;
    if (!isRecord(corpus.source) || !Array.isArray(corpus.questions)) continue;
    let changed = false;

    for (const question of corpus.questions) {
      const qn = numberValue(question.questionNumber);
      if (qn < 1) continue;
      const key = sourceKey(corpus.source, qn);
      if (key === null) continue;

      const unit = unitIndex.get(key);
      if (unit === undefined) {
        skipped += 1;
        continue;
      }
      matched += 1;

      const existingUnit = numberValue(question.unitNumber);
      if (existingUnit < 1) {
        question.unitNumber = unit;
        fixed += 1;
        changed = true;
      }

      // Also set source-level unitNumber for suteck
      const srcUnit = numberValue(corpus.source.unitNumber);
      if (srcUnit < 1 && stringValue(corpus.source.sourceType) === 'suteck') {
        corpus.source.unitNumber = unit;
        changed = true;
      }
    }

    if (changed) {
      writeFileSync(filePath, `${JSON.stringify(corpus, null, 2)}\n`, 'utf8');
    }
  }

  process.stdout.write(
    `${JSON.stringify({ matched, fixed, skipped })}\n`,
  );
}

function sourceKey(source: Json, questionNumber: number): string | null {
  const type = stringValue(source.sourceType ?? source.type);
  const subject = stringValue(source.subject);
  if (!type || !subject) return null;
  if (type === 'suteck') {
    const unit = numberValue(source.unitNumber);
    if (unit < 1) return null;
    return `suteck:${subject}:${unit}:${questionNumber}`;
  }
  if (type === 'moi') {
    const year = numberValue(source.year);
    const examType = stringValue(source.examType);
    if (year < 2000 || !examType) return null;
    return `moi:${subject}:${year}:${examType}:${questionNumber}`;
  }
  return null;
}

function isRecord(value: unknown): value is Json {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
function numberValue(value: unknown): number {
  return typeof value === 'number' ? value : Number(value);
}
function readdirSafe(dir: string): string[] {
  try { return readdirSync(dir); } catch { return []; }
}

void main();
