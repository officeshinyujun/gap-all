import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

type SourceRecord = Readonly<{
  sourceKey: string;
  sourceType: 'moi' | 'suteck';
  questionPdf: string;
  answerPdf: string | null;
}>;
type Manifest = Readonly<{ sources: readonly SourceRecord[] }>;
type Corpus = {
  source: SourceRecord;
  questions: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

const NUMERALS = '①②③④⑤';

function main(): void {
  const repositoryRoot = path.resolve(__dirname, '../..');
  const manifestPath =
    argumentValue('--manifest=') ??
    path.join(repositoryRoot, 'artifacts/reference-source-manifest-v2.json');
  const corpusRoot =
    argumentValue('--corpus=') ??
    path.join(repositoryRoot, 'artifacts/reference-corpus-v2');
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
  const files = new Map(
    readdirSync(corpusRoot)
      .filter((name) => name.endsWith('.json'))
      .map((name) => [name, path.join(corpusRoot, name)]),
  );
  let updated = 0;
  let unresolved = 0;
  for (const source of manifest.sources.filter(isPilotSource)) {
    const corpusPath = [...files.entries()].find(([name]) =>
      name.includes(safeName(source.sourceKey)),
    )?.[1];
    if (corpusPath === undefined) continue;
    const corpus = JSON.parse(readFileSync(corpusPath, 'utf8')) as Corpus;
    const answerText = extractAnswerText(repositoryRoot, source);
    const answers = extractAnswers(answerText, source.sourceType === 'suteck');
    for (const question of corpus.questions) {
      const questionNumber = numberValue(question.questionNumber);
      const answer = answers.get(questionNumber);
      if (answer === undefined) {
        unresolved += 1;
        continue;
      }
      question.correctAnswer = answer;
      question.answerProvenance = 'official';
      updated += 1;
    }
    corpus.answerExtraction = {
      provenance: 'official',
      extractedCount: answers.size,
      unresolvedQuestionCount: corpus.questions.filter(
        (question) =>
          numberValue(question.questionNumber) > 0 &&
          question.correctAnswer === undefined,
      ).length,
    };
    writeFileSync(corpusPath, `${JSON.stringify(corpus, null, 2)}\n`, 'utf8');
  }
  process.stdout.write(`${JSON.stringify({ updated, unresolved })}\n`);
  if (unresolved > 0) process.exitCode = 1;
}

function extractAnswerText(
  repositoryRoot: string,
  source: SourceRecord,
): string {
  const answerPath =
    source.answerPdf === null ? source.questionPdf : source.answerPdf;
  return execFileSync(
    'pdftotext',
    ['-layout', path.join(repositoryRoot, answerPath), '-'],
    {
      encoding: 'utf8',
      maxBuffer: 20 * 1024 * 1024,
    },
  );
}

function extractAnswers(text: string, embedded: boolean): Map<number, number> {
  const lines = text.split('\n');
  const answerLines = embedded
    ? lines
        .filter(
          (line) => [...line.matchAll(/\b(\d{1,2})\s*([①②③④⑤])/gu)].length >= 3,
        )
        .slice(0, 2)
    : lines;
  const answers = new Map<number, number>();
  for (const line of answerLines) {
    for (const match of line.matchAll(/\b(\d{1,2})\s*([①②③④⑤])/gu)) {
      const questionNumber = Number(match[1]);
      const answer = NUMERALS.indexOf(match[2] ?? '') + 1;
      if (
        questionNumber >= 1 &&
        questionNumber <= 20 &&
        answer >= 1 &&
        answer <= 5
      ) {
        answers.set(questionNumber, answer);
      }
    }
  }
  return answers;
}

function isPilotSource(source: SourceRecord): boolean {
  if (source.sourceType === 'suteck') return /:(6|11)$/u.test(source.sourceKey);
  return source.sourceKey.includes(':2024:6월_모의평가');
}

function numberValue(value: unknown): number {
  return typeof value === 'number' ? value : Number(value);
}

function safeName(value: string): string {
  return value.replaceAll(/[^a-zA-Z0-9._-]+/gu, '_');
}

function argumentValue(prefix: string): string | null {
  const value = process.argv.find((argument) => argument.startsWith(prefix));
  return value === undefined ? null : value.slice(prefix.length);
}

void main();
