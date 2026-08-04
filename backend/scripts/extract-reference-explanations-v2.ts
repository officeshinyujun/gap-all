import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';

type Corpus = {
  source: { sourceKey: string; sourceType: string; questionPdf: string };
  questions: Array<Record<string, unknown>>;
};

function main(): void {
  const root = path.resolve(__dirname, '../..');
  const corpusRoot = path.join(root, 'artifacts/reference-corpus-v2');
  let updated = 0;
  let unresolved = 0;
  for (const file of readdirSync(corpusRoot).filter((name) =>
    name.endsWith('.json'),
  )) {
    const corpusPath = path.join(corpusRoot, file);
    const corpus = JSON.parse(readFileSync(corpusPath, 'utf8')) as Corpus;
    if (corpus.source.sourceType !== 'suteck') continue;
    const pdfText = execFileSync(
      'pdftotext',
      ['-raw', path.join(root, corpus.source.questionPdf), '-'],
      { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
    );
    const explanations = extractFirstUnit(pdfText);
    for (const question of corpus.questions) {
      const number = numberValue(question.questionNumber);
      const explanation = explanations.get(number);
      if (explanation === undefined) {
        unresolved += 1;
        continue;
      }
      question.explanation = explanation;
      question.answerProvenance = 'official';
      updated += 1;
    }
    writeFileSync(corpusPath, `${JSON.stringify(corpus, null, 2)}\n`, 'utf8');
  }
  process.stdout.write(`${JSON.stringify({ updated, unresolved })}\n`);
  if (unresolved > 0) process.exitCode = 1;
}

function extractFirstUnit(text: string): Map<number, string> {
  const markers = [
    ...text.matchAll(/^\s*(\d{1,2})\s+(?:출제\s*의도|해설)/gmu),
  ];
  const results = new Map<number, string>();
  for (let index = 0; index < markers.length; index += 1) {
    const marker = markers[index];
    if (marker === undefined) continue;
    const number = Number(marker[1]);
    if (number < 1 || number > 10 || results.has(number)) {
      if (results.size === 10) break;
      continue;
    }
    const next = markers[index + 1]?.index ?? text.length;
    const section = text
      .slice(marker.index ?? 0, next)
      .replace(/\s+/gu, ' ')
      .trim();
    if (section.length > 50) results.set(number, section);
    if (results.size === 10) break;
  }
  return results;
}

function numberValue(value: unknown): number {
  return typeof value === 'number' ? value : Number(value);
}

void main();
