import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

type ExistingQuestion = Readonly<{
  source?: Readonly<{
    type?: string;
    subject?: string;
    year?: number;
    examType?: string;
    filename?: string;
  }>;
  questionNumber?: number;
  unitNumber?: number;
  targetConcepts?: readonly string[];
  stem?: string;
}>;
type Corpus = {
  source: Record<string, unknown>;
  questions: Array<Record<string, unknown>>;
  [key: string]: unknown;
};

function main(): void {
  const repositoryRoot = path.resolve(__dirname, '../..');
  const corpusRoot = path.join(repositoryRoot, 'artifacts/reference-corpus-v2');
  const parsedRoot = path.join(repositoryRoot, 'textbook/parsed');
  const index = loadExistingIndex(parsedRoot);
  let matched = 0;
  let missing = 0;
  let stemMismatches = 0;
  for (const file of readdirSync(corpusRoot).filter((name) =>
    name.endsWith('.json'),
  )) {
    const corpusPath = path.join(corpusRoot, file);
    const corpus = JSON.parse(readFileSync(corpusPath, 'utf8')) as Corpus;
    const source = corpus.source;
    for (const question of corpus.questions) {
      const key = sourceKey(source, question.questionNumber);
      const existing = index.get(key);
      if (existing === undefined) {
        missing += 1;
        continue;
      }
      matched += 1;
      if (existing.unitNumber !== undefined)
        corpus.source.unitNumber = existing.unitNumber;
      question.targetConcepts = existing.targetConcepts ?? [];
      question.legacySourceFilename = existing.source?.filename ?? null;
      if (
        normalize(stringValue(question.stem)) !== normalize(existing.stem ?? '')
      )
        stemMismatches += 1;
    }
    writeFileSync(corpusPath, `${JSON.stringify(corpus, null, 2)}\n`, 'utf8');
  }
  process.stdout.write(
    `${JSON.stringify({ matched, missing, stemMismatches })}\n`,
  );
  if (missing > 0) process.exitCode = 1;
}

function loadExistingIndex(root: string): Map<string, ExistingQuestion> {
  const index = new Map<string, ExistingQuestion>();
  for (const subject of ['kongil', 'sungjik']) {
    for (const mode of ['moi', 'suteck']) {
      const directory = path.join(root, subject, mode);
      for (const file of readdirSafe(directory)) {
        if (!file.endsWith('.json')) continue;
        const values = JSON.parse(
          readFileSync(path.join(directory, file), 'utf8'),
        ) as ExistingQuestion[];
        for (const value of values) {
          const source = value.source;
          if (source === undefined || value.questionNumber === undefined)
            continue;
          index.set(existingKey(source, value), value);
        }
      }
    }
  }
  return index;
}

function sourceKey(
  source: Record<string, unknown>,
  questionNumber: unknown,
): string {
  const type = stringValue(source.sourceType ?? source.type);
  const subject = stringValue(source.subject);
  if (type === 'suteck')
    return `suteck:${subject}:${stringValue(source.unitNumber)}:${stringValue(questionNumber)}`;
  return `moi:${subject}:${stringValue(source.year)}:${stringValue(source.examType)}:${stringValue(questionNumber)}`;
}

function existingKey(
  source: Readonly<NonNullable<ExistingQuestion['source']>>,
  value: ExistingQuestion,
): string {
  const type = source.type ?? '';
  const subject = source.subject ?? '';
  if (type === 'suteck') {
    const unit =
      value.unitNumber ??
      Number(source.filename?.match(/(\d+)단원/u)?.[1] ?? 0);
    return `suteck:${subject}:${unit}:${value.questionNumber}`;
  }
  return `moi:${subject}:${source.year}:${source.examType}:${value.questionNumber}`;
}

function normalize(value: string): string {
  return value.replaceAll(/\s+/gu, '').replaceAll('～', '~');
}

function stringValue(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number'
    ? String(value)
    : '';
}

function readdirSafe(directory: string): string[] {
  try {
    return readdirSync(directory);
  } catch {
    return [];
  }
}

void main();
