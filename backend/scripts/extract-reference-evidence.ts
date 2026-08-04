import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import * as path from 'node:path';

type PdfInfo = Readonly<{
  relativePath: string;
  pageCount: number | null;
  textLayer: 'present' | 'sparse' | 'unreadable';
}>;

type SourceRecord = Readonly<{
  sourceKey: string;
  sourceType: 'moi' | 'suteck';
  subject: 'kongil' | 'sungjik';
  unitNumber?: number;
  year?: number;
  examType?: string;
  pdfs: readonly PdfInfo[];
}>;

type Manifest = Readonly<{ sources: readonly SourceRecord[] }>;

function main(): void {
  const repositoryRoot = path.resolve(__dirname, '../..');
  const manifestPath =
    argumentValue('--manifest=') ??
    path.join(repositoryRoot, 'artifacts/reference-source-manifest-v2.json');
  const outputRoot =
    argumentValue('--output=') ??
    path.join(repositoryRoot, 'artifacts/reference-evidence-v2');
  const mode = process.argv.includes('--all') ? 'all' : 'pilot';
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Manifest;
  const sources = manifest.sources.filter((source) =>
    mode === 'all' ? true : isPilotSource(source),
  );
  if (sources.length === 0) throw new Error(`No ${mode} sources selected.`);

  let pdfCount = 0;
  for (const source of sources) {
    const sourceDirectory = path.join(outputRoot, safeName(source.sourceKey));
    for (const [index, pdf] of source.pdfs.entries()) {
      const pdfPath = path.join(repositoryRoot, pdf.relativePath);
      const pdfDirectory = path.join(sourceDirectory, String(index + 1));
      mkdirSync(pdfDirectory, { recursive: true });
      const text = extractLayoutText(pdfPath);
      const questionPageCount = questionPages(source, text, pdf.pageCount);
      writeFileSync(
        path.join(pdfDirectory, 'layout.txt'),
        selectPages(text, questionPageCount),
        'utf8',
      );
      writeFileSync(
        path.join(pdfDirectory, 'metadata.json'),
        `${JSON.stringify(
          { sourceKey: source.sourceKey, questionPageCount, ...pdf },
          null,
          2,
        )}\n`,
        'utf8',
      );
      renderPages(pdfPath, path.join(pdfDirectory, 'page'), questionPageCount);
      removeStalePages(pdfDirectory, questionPageCount);
      pdfCount += 1;
    }
  }

  process.stdout.write(
    `${JSON.stringify({ mode, sourceCount: sources.length, pdfCount, outputRoot })}\n`,
  );
}

function isPilotSource(source: SourceRecord): boolean {
  if (source.sourceType === 'suteck') {
    return source.unitNumber === 6 || source.unitNumber === 11;
  }
  return source.year === 2024 && source.examType === '6월_모의평가';
}

function extractLayoutText(pdfPath: string): string {
  return execFileSync('pdftotext', ['-layout', pdfPath, '-'], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

function renderPages(
  pdfPath: string,
  outputPrefix: string,
  pageCount: number | null,
): void {
  const args = ['-png', '-r', '144'];
  if (pageCount !== null) args.push('-f', '1', '-l', String(pageCount));
  args.push(pdfPath, outputPrefix);
  execFileSync('pdftoppm', args, {
    stdio: 'ignore',
  });
}

function questionPages(
  source: SourceRecord,
  text: string,
  pageCount: number | null,
): number | null {
  if (source.sourceType !== 'suteck') return pageCount;
  const pages = text.split('\f');
  const firstAnswerPage = pages.findIndex((page) =>
    /출제\s*의도|오답\s*피하기/u.test(page),
  );
  return firstAnswerPage < 0 ? pageCount : Math.max(1, firstAnswerPage);
}

function selectPages(text: string, pageCount: number | null): string {
  return pageCount === null
    ? text
    : text.split('\f').slice(0, pageCount).join('\f');
}

function removeStalePages(directory: string, pageCount: number | null): void {
  if (pageCount === null) return;
  for (const name of readdirSync(directory)) {
    const match = name.match(/^page-(\d+)\.png$/u);
    if (match !== null && Number(match[1]) > pageCount) {
      // The next run may reduce a source's question-page range.
      unlinkSync(path.join(directory, name));
    }
  }
}

function safeName(value: string): string {
  return value.replaceAll(/[^a-zA-Z0-9._-]+/gu, '_');
}

function argumentValue(prefix: string): string | null {
  const value = process.argv.find((argument) => argument.startsWith(prefix));
  return value === undefined ? null : value.slice(prefix.length);
}

void main();
