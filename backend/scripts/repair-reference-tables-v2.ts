import 'dotenv/config';
import OpenAI from 'openai';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

type CorpusQuestion = {
  questionNumber: number;
  pageNumbers: number[];
  stem: string;
  stimulus: string;
  viewItems: string[];
  choices: string[];
  visual: {
    kind: string;
    headers: Array<{ id: string; label: string }>;
    rows: Array<{ id: string; cells: string[] }>;
    cropPath?: string;
  };
  [key: string]: unknown;
};
type Corpus = {
  source: { sourceKey: string };
  questions: CorpusQuestion[];
  [key: string]: unknown;
};

const MODEL = process.env.OPENAI_REFERENCE_EXTRACTION_MODEL ?? 'gpt-4o-mini';
const PROMPT = `Return valid json only. Extract only the visible table from the provided Korean exam page.
Do not infer, summarize, reorder, or invent cells. Preserve every header, row, number, unit, symbol, parenthesis, and blank cell.
If the table cannot be read completely, return {"headers":[],"rows":[]}.
Schema: {"headers":[{"id":"h1","label":"..."}],"rows":[{"id":"r1","cells":["..."]}]}`;

async function main(): Promise<void> {
  const repositoryRoot = path.resolve(__dirname, '../..');
  const corpusRoot = path.join(repositoryRoot, 'artifacts/reference-corpus-v2');
  const evidenceRoot = path.join(
    repositoryRoot,
    'artifacts/reference-evidence-v2',
  );
  const requestedSource = argumentValue('--source=');
  const client = new OpenAI({ apiKey: requiredApiKey() });
  let repaired = 0;
  let rejected = 0;
  for (const file of readdirSync(corpusRoot).filter((name) =>
    name.endsWith('.json'),
  )) {
    const corpusPath = path.join(corpusRoot, file);
    const corpus = JSON.parse(readFileSync(corpusPath, 'utf8')) as Corpus;
    if (requestedSource !== null && corpus.source.sourceKey !== requestedSource)
      continue;
    const evidenceDirectory = findEvidenceDirectory(
      evidenceRoot,
      corpus.source.sourceKey,
    );
    for (const question of corpus.questions) {
      if (
        question.visual.cropPath === undefined &&
        (question.visual.kind !== 'table' || question.visual.rows.length > 0)
      )
        continue;
      if (question.tableRepair === 'accepted') continue;
      const table = await repairTable(
        client,
        repositoryRoot,
        evidenceDirectory,
        question,
      );
      if (
        table.headers.length === 0 ||
        table.rows.length === 0 ||
        table.rows.some((row) => row.cells.length !== table.headers.length)
      ) {
        rejected += 1;
        question.visual = {
          kind: 'table',
          headers: [],
          rows: [],
          cropPath: question.visual.cropPath,
        };
        question.tableRepair = 'rejected_incomplete';
        continue;
      }
      question.visual = {
        kind: 'table',
        ...table,
        cropPath: question.visual.cropPath,
      };
      question.tableRepair = 'accepted';
      repaired += 1;
    }
    writeFileSync(corpusPath, `${JSON.stringify(corpus, null, 2)}\n`, 'utf8');
  }
  process.stdout.write(`${JSON.stringify({ repaired, rejected })}\n`);
}

async function repairTable(
  client: OpenAI,
  repositoryRoot: string,
  evidenceDirectory: string,
  question: CorpusQuestion,
): Promise<{
  headers: Array<{ id: string; label: string }>;
  rows: Array<{ id: string; cells: string[] }>;
}> {
  const page = question.pageNumbers[0] ?? 1;
  const cropPath = stringValue(question.visual.cropPath);
  const pageFile =
    cropPath === ''
      ? path.join(evidenceDirectory, `page-${page}.png`)
      : path.join(repositoryRoot, cropPath);
  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    {
      type: 'text',
      text: `${PROMPT}\n[QUESTION]\n${JSON.stringify({
        questionNumber: question.questionNumber,
        stem: question.stem,
        stimulus: question.stimulus,
        viewItems: question.viewItems,
        choices: question.choices,
      })}`,
    },
    {
      type: 'image_url',
      image_url: {
        url: `data:image/png;base64,${readFileSync(pageFile).toString('base64')}`,
        detail: 'high',
      },
    },
  ];
  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'user', content }],
    response_format: { type: 'json_object' },
    temperature: 0,
  });
  const raw = response.choices[0]?.message?.content;
  if (raw === undefined || raw === null) return { headers: [], rows: [] };
  const parsed = JSON.parse(raw) as { headers?: unknown; rows?: unknown };
  const headers = Array.isArray(parsed.headers)
    ? parsed.headers.filter(isRecord).map((header, index) => ({
        id: stringValue(header.id) || `h${index + 1}`,
        label: stringValue(header.label),
      }))
    : [];
  const rows = Array.isArray(parsed.rows)
    ? parsed.rows.filter(isRecord).map((row, index) => ({
        id: stringValue(row.id) || `r${index + 1}`,
        cells: Array.isArray(row.cells) ? row.cells.map(stringValue) : [],
      }))
    : [];
  return { headers, rows };
}

function findEvidenceDirectory(root: string, sourceKey: string): string {
  const prefix = safeName(sourceKey);
  const sourceDirectory = path.join(root, prefix);
  const candidates = readdirSync(sourceDirectory).filter((name) =>
    /^\d+$/u.test(name),
  );
  const questionPdfDirectory = candidates[0];
  if (questionPdfDirectory === undefined)
    throw new Error(`No evidence for ${sourceKey}`);
  return path.join(sourceDirectory, questionPdfDirectory);
}

function requiredApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (key === undefined || key.trim() === '')
    throw new Error('OPENAI_API_KEY is required.');
  return key;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function safeName(value: string): string {
  return value.replaceAll(/[^a-zA-Z0-9._-]+/gu, '_');
}

function argumentValue(prefix: string): string | null {
  const value = process.argv.find((argument) => argument.startsWith(prefix));
  return value === undefined ? null : value.slice(prefix.length);
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
});
