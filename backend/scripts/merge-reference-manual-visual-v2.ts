import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

type JsonObject = Record<string, unknown>;
type Corpus = { source: JsonObject; questions: JsonObject[] };

const root = path.resolve(__dirname, '../..');
const corpusDir = path.join(root, 'artifacts/reference-corpus-v2');
const reviewDir = path.join(root, 'artifacts/reference-manual-visual-review');

function main(): void {
  const corpusBySource = new Map<string, { file: string; corpus: Corpus }>();
  for (const file of readdirSync(corpusDir).filter((name) => name.endsWith('.json'))) {
    const corpus = JSON.parse(readFileSync(path.join(corpusDir, file), 'utf8')) as Corpus;
    const sourceKey = stringValue(corpus.source.sourceKey);
    if (sourceKey !== '') corpusBySource.set(sourceKey, { file, corpus });
  }

  const backup: JsonObject[] = [];
  let overlays = 0;
  let tables = 0;
  let missing = 0;
  for (const file of readdirSync(reviewDir).filter((name) => name.endsWith('.json'))) {
    const review = JSON.parse(readFileSync(path.join(reviewDir, file), 'utf8')) as JsonObject;
    for (const item of reviewItems(review)) {
      const source = corpusBySource.get(item.sourceKey);
      const question = source?.corpus.questions.find(
        (candidate) => numberValue(candidate.questionNumber) === item.questionNumber,
      );
      if (source === undefined || question === undefined) {
        missing += 1;
        continue;
      }
      overlays += 1;
      backup.push({ sourceKey: item.sourceKey, questionNumber: item.questionNumber, question: structuredClone(question) });
      question.manualVisualReview = {
        status: item.status,
        sourceFile: file,
        page: item.page,
        visualKind: item.visualKind ?? (isObject(item.visual) ? item.visual.kind : null),
        reviewRequired: item.review_required ?? item.status === 'review_required',
      };
      if (item.status !== 'review_required') {
        const table = normalizeTable(item);
        if (table !== null) {
          question.visual = table;
          question.tableRepair = 'manual-visual-review';
          tables += 1;
        }
      }
    }
  }

  const backupDir = path.join(root, 'artifacts/reference-corpus-v2-backups');
  mkdirSync(backupDir, { recursive: true });
  const backupPath = path.join(backupDir, `manual-visual-${new Date().toISOString().replaceAll(':', '-')}.json`);
  writeFileSync(backupPath, `${JSON.stringify(backup, null, 2)}\n`);
  for (const { file, corpus } of corpusBySource.values()) {
    writeFileSync(path.join(corpusDir, file), `${JSON.stringify(corpus, null, 2)}\n`);
  }
  process.stdout.write(JSON.stringify({ overlays, tables, missing, backupPath }) + '\n');
  if (missing > 0) process.exitCode = 1;
}

function reviewItems(review: JsonObject): Array<JsonObject & { sourceKey: string; questionNumber: number }> {
  if (Array.isArray(review.questions)) {
    return review.questions.flatMap((item) => {
      if (!isObject(item)) return [];
      const sourceKey = stringValue(item.sourceKey) || stringValue(review.sourceKey);
      const questionNumber = numberValue(item.questionNumber);
      return sourceKey !== '' && Number.isInteger(questionNumber) ? [{ ...item, sourceKey, questionNumber }] : [];
    });
  }
  if (!Array.isArray(review.sources)) return [];
  return review.sources.flatMap((source) => {
    if (!isObject(source)) return [];
    const sourceKey = stringValue(source.sourceKey);
    return Array.isArray(source.candidates)
      ? source.candidates.flatMap((item) => {
          if (!isObject(item)) return [];
          const questionNumber = numberValue(item.questionNumber);
          return sourceKey !== '' && Number.isInteger(questionNumber) ? [{ ...item, sourceKey, questionNumber }] : [];
        })
      : [];
  });
}

function normalizeTable(item: JsonObject): JsonObject | null {
  const visual = isObject(item.visual) ? item.visual : item;
  const direct = tableFrom(visual);
  if (direct !== null) return direct;
  const sections = Array.isArray(visual.sections) ? visual.sections : [];
  const section = sections.find((candidate) => isObject(candidate) && Array.isArray(candidate.columns) && Array.isArray(candidate.rows));
  return isObject(section) ? tableFrom(section) : null;
}

function tableFrom(value: JsonObject): JsonObject | null {
  if (!Array.isArray(value.headers) || !Array.isArray(value.rows) || value.headers.length === 0 || value.rows.length === 0) return null;
  const headers = value.headers.map((label, index) => ({ id: `h${index + 1}`, label: String(label) }));
  const rows = value.rows.filter(Array.isArray).map((cells, index) => ({ id: `r${index + 1}`, cells: cells.map(String) }));
  return rows.length > 0 && rows.every((row) => row.cells.length === headers.length)
    ? { kind: 'table', headers, rows }
    : null;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function stringValue(value: unknown): string { return typeof value === 'string' ? value.trim() : ''; }
function numberValue(value: unknown): number { return typeof value === 'number' ? value : Number(value); }

main();
