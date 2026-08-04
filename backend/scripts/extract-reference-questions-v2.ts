import 'dotenv/config';
import OpenAI from 'openai';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

type PdfInfo = Readonly<{ relativePath: string }>;
type SourceRecord = Readonly<{
  sourceKey: string;
  sourceType: 'moi' | 'suteck';
  subject: 'kongil' | 'sungjik';
  unitNumber?: number;
  year?: number;
  examType?: string;
  questionPdf: string;
  pdfs: readonly PdfInfo[];
}>;
type Manifest = Readonly<{ sources: readonly SourceRecord[] }>;

type ExtractedQuestion = Readonly<{
  questionNumber: number;
  pageNumbers: readonly number[];
  stem: string;
  stimulus: string;
  viewItems: readonly string[];
  choices: readonly string[];
  visual: Readonly<{
    kind: 'none' | 'table' | 'chart' | 'diagram' | 'document';
    headers: readonly Readonly<{ id: string; label: string }>[];
    rows: readonly Readonly<{ id: string; cells: readonly string[] }>[];
  }>;
}>;

type ExtractionResult = Readonly<{
  source: Readonly<{
    sourceKey: string;
    sourceType: SourceRecord['sourceType'];
    subject: SourceRecord['subject'];
    unitNumber?: number;
    year?: number;
    examType?: string;
    questionPdf: string;
  }>;
  extractionVersion: 'reference-pdf-v2';
  model: string;
  questions: readonly ExtractedQuestion[];
  validationErrors: readonly string[];
}>;

const MODEL = process.env.OPENAI_REFERENCE_EXTRACTION_MODEL ?? 'gpt-4o-mini';

const EXTRACTION_PROMPT = `당신은 한국 직업탐구 시험 PDF의 원문 구조 추출기다.
제공된 page text와 page image에서 문제지만 추출하고, 정답표·해설·페이지 머리말은 무시하라.
Return valid json only.

반드시 지킬 것:
1. 문제의 발문(stem), 제시문(stimulus), ㄱ~ㄹ 보기(viewItems), ①~⑤ 선택지(choices)를 원문 그대로 옮긴다.
2. 문제 번호는 실제 번호를 사용한다. [4~5]처럼 공통 제시문은 각 문제의 pageNumbers와 stimulus에 연결하되 새 내용을 만들지 않는다.
3. 표는 visual.kind=table로 반환한다. headers와 rows의 모든 셀을 원문 순서대로 옮긴다.
4. 표/그래프/도식의 수치와 단위를 추정하거나 반올림하지 않는다. 읽을 수 없으면 빈 값 대신 visual.kind를 none으로 하고 validationError를 추가한다.
5. 정답과 해설은 반환하지 않는다. 정답표/해설 페이지의 숫자를 문제로 착각하지 않는다.
6. 문제지에 없는 문장, 개념, 선택지를 생성하지 않는다.

{"questions":[{"questionNumber":1,"pageNumbers":[1],"stem":"...","stimulus":"...","viewItems":["ㄱ. ..."],"choices":["① ...","② ...","③ ...","④ ...","⑤ ..."],"visual":{"kind":"none","headers":[],"rows":[]}}]}`;

async function main(): Promise<void> {
  const repositoryRoot = path.resolve(__dirname, '../..');
  const manifestPath =
    argumentValue('--manifest=') ??
    path.join(repositoryRoot, 'artifacts/reference-source-manifest-v2.json');
  const evidenceRoot =
    argumentValue('--evidence=') ??
    path.join(repositoryRoot, 'artifacts/reference-evidence-v2');
  const outputRoot =
    argumentValue('--output=') ??
    path.join(repositoryRoot, 'artifacts/reference-corpus-v2');
  const mode = process.argv.includes('--all') ? 'all' : 'pilot';
  const requestedSource = argumentValue('--source=');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
  const sources = manifest.sources.filter((source) =>
    requestedSource !== null
      ? source.sourceKey === requestedSource
      : (mode === 'all' || isPilotSource(source)) &&
        (!process.argv.includes('--missing') ||
          !existsSync(path.join(outputRoot, `${safeName(source.sourceKey)}.json`))),
  );
  if (sources.length === 0) throw new Error(`No ${mode} sources selected.`);

  const client = new OpenAI({ apiKey: requiredApiKey() });
  for (const source of sources) {
    const result = await extractSource(
      client,
      source,
      repositoryRoot,
      evidenceRoot,
    );
    const outputPath = path.join(
      outputRoot,
      `${safeName(source.sourceKey)}.json`,
    );
    requireDirectory(outputPath);
    writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
    process.stdout.write(
      `${JSON.stringify({
        sourceKey: source.sourceKey,
        questions: result.questions.length,
        errors: result.validationErrors.length,
      })}\n`,
    );
  }
}

async function extractSource(
  client: OpenAI,
  source: SourceRecord,
  repositoryRoot: string,
  evidenceRoot: string,
): Promise<ExtractionResult> {
  const questionPdfIndex = source.pdfs.findIndex(
    (pdf) => pdf.relativePath === source.questionPdf,
  );
  if (questionPdfIndex < 0)
    throw new Error(`Question PDF missing: ${source.sourceKey}`);
  const evidenceDirectory = path.join(
    evidenceRoot,
    safeName(source.sourceKey),
    String(questionPdfIndex + 1),
  );
  const layoutText = readFileSync(
    path.join(evidenceDirectory, 'layout.txt'),
    'utf8',
  );
  const pageFiles = readdirSync(evidenceDirectory)
    .filter((name) => /^page-\d+\.png$/u.test(name))
    .sort((a, b) => pageNumber(a) - pageNumber(b));
  if (pageFiles.length === 0)
    throw new Error(`No page evidence: ${source.sourceKey}`);

  const pageTexts = layoutText.split('\f');
  const questions: ExtractedQuestion[] = [];
  for (let start = 0; start < pageFiles.length; start += 2) {
    const chunk = pageFiles.slice(start, start + 2);
    const chunkQuestions = await extractChunk(
      client,
      source.sourceKey,
      evidenceDirectory,
      chunk,
      pageTexts,
    );
    questions.push(...chunkQuestions);
  }
  const validationErrors = validateQuestions(questions);
  return {
    source: {
      sourceKey: source.sourceKey,
      sourceType: source.sourceType,
      subject: source.subject,
      unitNumber: source.unitNumber,
      year: source.year,
      examType: source.examType,
      questionPdf: source.questionPdf,
    },
    extractionVersion: 'reference-pdf-v2',
    model: MODEL,
    questions,
    validationErrors,
  };
}

async function extractChunk(
  client: OpenAI,
  sourceKey: string,
  evidenceDirectory: string,
  pageFiles: readonly string[],
  pageTexts: readonly string[],
): Promise<ExtractedQuestion[]> {
  const content: OpenAI.Chat.Completions.ChatCompletionContentPart[] = [
    {
      type: 'text',
      text: `${EXTRACTION_PROMPT}\n\n${pageFiles
        .map((file) => {
          const page = pageNumber(file);
          return `[PAGE ${page}]\n${pageTexts[page - 1] ?? ''}`;
        })
        .join('\n')}`,
    },
  ];
  for (const pageFile of pageFiles) {
    const page = pageNumber(pageFile);
    content.push({ type: 'text', text: `\n[PAGE IMAGE ${page}]` });
    content.push({
      type: 'image_url',
      image_url: {
        url: `data:image/png;base64,${readFileSync(
          path.join(evidenceDirectory, pageFile),
        ).toString('base64')}`,
        detail: 'high',
      },
    });
  }
  const response = await client.chat.completions.create({
    model: MODEL,
    messages: [{ role: 'user', content }],
    response_format: { type: 'json_object' },
    temperature: 0,
  });
  const raw = response.choices[0]?.message?.content;
  if (raw === undefined || raw === null || raw.trim() === '')
    throw new Error(`Empty extraction: ${sourceKey}`);
  const parsed = JSON.parse(raw) as { questions?: unknown };
  return Array.isArray(parsed.questions)
    ? parsed.questions.map((question, index) =>
        normalizeQuestion(question, index),
      )
    : [];
}

function normalizeQuestion(value: unknown, index: number): ExtractedQuestion {
  if (!isRecord(value))
    throw new Error(`Question ${index + 1} is not an object.`);
  const visual = isRecord(value.visual) ? value.visual : {};
  const headers = Array.isArray(visual.headers)
    ? visual.headers.filter(isRecord).map((header, headerIndex) => ({
        id: stringValue(header.id) || `h${headerIndex + 1}`,
        label: stringValue(header.label),
      }))
    : [];
  const rows = Array.isArray(visual.rows)
    ? visual.rows.filter(isRecord).map((row, rowIndex) => ({
        id: stringValue(row.id) || `r${rowIndex + 1}`,
        cells: arrayOfStrings(row.cells),
      }))
    : [];
  const kind = stringValue(visual.kind);
  return {
    questionNumber: numberValue(value.questionNumber),
    pageNumbers: arrayOfNumbers(value.pageNumbers),
    stem: stringValue(value.stem),
    stimulus: stringValue(value.stimulus),
    viewItems: arrayOfStrings(value.viewItems),
    choices: arrayOfStrings(value.choices),
    visual: {
      kind:
        kind === 'table' ||
        kind === 'chart' ||
        kind === 'diagram' ||
        kind === 'document'
          ? kind
          : 'none',
      headers,
      rows,
    },
  };
}

function validateQuestions(questions: readonly ExtractedQuestion[]): string[] {
  const errors: string[] = [];
  const numbers = new Set<number>();
  for (const question of questions) {
    const prefix = `Q${question.questionNumber || 'unknown'}`;
    if (
      !Number.isSafeInteger(question.questionNumber) ||
      question.questionNumber < 1
    )
      errors.push(`${prefix}:INVALID_NUMBER`);
    if (numbers.has(question.questionNumber))
      errors.push(`${prefix}:DUPLICATE_NUMBER`);
    numbers.add(question.questionNumber);
    if (question.stem.trim() === '') errors.push(`${prefix}:EMPTY_STEM`);
    if (question.choices.length !== 5)
      errors.push(`${prefix}:CHOICE_COUNT_${question.choices.length}`);
    if (question.visual.kind === 'table') {
      if (
        question.visual.headers.length === 0 ||
        question.visual.rows.length === 0
      )
        errors.push(`${prefix}:EMPTY_TABLE`);
      for (const row of question.visual.rows) {
        if (row.cells.length !== question.visual.headers.length)
          errors.push(`${prefix}:TABLE_COLUMN_MISMATCH`);
      }
    }
  }
  return errors;
}

function isPilotSource(source: SourceRecord): boolean {
  if (source.sourceType === 'suteck')
    return source.unitNumber === 6 || source.unitNumber === 11;
  return source.year === 2024 && source.examType === '6월_모의평가';
}

function requiredApiKey(): string {
  const key = process.env.OPENAI_API_KEY;
  if (key === undefined || key.trim() === '')
    throw new Error('OPENAI_API_KEY is required.');
  return key;
}

function requireDirectory(filePath: string): void {
  const directory = path.dirname(filePath);
  mkdirSync(directory, { recursive: true });
}

function pageNumber(filename: string): number {
  return Number(filename.match(/page-(\d+)\.png/u)?.[1] ?? 0);
}

function safeName(value: string): string {
  return value.replaceAll(/[^a-zA-Z0-9._-]+/gu, '_');
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function numberValue(value: unknown): number {
  return typeof value === 'number' ? value : Number(value);
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(stringValue) : [];
}

function arrayOfNumbers(value: unknown): number[] {
  return Array.isArray(value)
    ? value.map(numberValue).filter(Number.isSafeInteger)
    : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
