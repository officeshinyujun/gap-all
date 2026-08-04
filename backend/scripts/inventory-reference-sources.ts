import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import * as path from 'node:path';

type SourceType = 'moi' | 'suteck';
type Subject = 'kongil' | 'sungjik';

type PdfInfo = Readonly<{
  relativePath: string;
  sha256: string;
  pageCount: number | null;
  textCharacters: number | null;
  textLayer: 'present' | 'sparse' | 'unreadable';
}>;

type SourceRecord = Readonly<{
  sourceKey: string;
  sourceType: SourceType;
  subject: Subject;
  unitNumber?: number;
  year?: number;
  examType?: string;
  questionPdf: string;
  answerPdf: string | null;
  answerEmbedded: boolean;
  pdfs: readonly PdfInfo[];
}>;

type Manifest = Readonly<{
  version: 'reference-source-manifest-v2';
  generatedAt: string;
  repositoryRoot: string;
  counts: Readonly<{
    authoritativePdfFiles: number;
    suteckPdfFiles: number;
    moiPdfFiles: number;
    sourceRecords: number;
    moiExamDirectories: number;
    pairingErrors: number;
  }>;
  excluded: readonly string[];
  pairingErrors: readonly string[];
  sources: readonly SourceRecord[];
}>;

const EXPECTED_SUTECK_PDFS = 40;
const EXPECTED_MOI_PDFS = 54;
const TEXT_LAYER_SPARSE_THRESHOLD = 100;

function main(): void {
  const repositoryRoot = path.resolve(__dirname, '../..');
  const questionRoot = path.join(repositoryRoot, 'question');
  const outputPath =
    argumentValue('--output=') ??
    path.join(repositoryRoot, 'artifacts/reference-source-manifest-v2.json');
  const manifest = buildManifest(repositoryRoot, questionRoot);

  mkdirSync(path.dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  process.stdout.write(
    `${JSON.stringify({ outputPath, counts: manifest.counts })}\n`,
  );

  if (manifest.pairingErrors.length > 0) {
    throw new Error(
      `Source inventory has ${manifest.pairingErrors.length} pairing error(s).`,
    );
  }
  if (
    manifest.counts.suteckPdfFiles !== EXPECTED_SUTECK_PDFS ||
    manifest.counts.moiPdfFiles !== EXPECTED_MOI_PDFS
  ) {
    throw new Error(
      `Unexpected authoritative PDF counts: suteck=${manifest.counts.suteckPdfFiles}, moi=${manifest.counts.moiPdfFiles}`,
    );
  }
}

function buildManifest(repositoryRoot: string, questionRoot: string): Manifest {
  const excluded = [
    'question/to_ocr/** (excluded until hash/source mapping proves it is authoritative)',
    'question/moi.zip',
    '**/.DS_Store',
    'question/api_keys.txt',
  ];
  const suteck = inventorySuteck(repositoryRoot, questionRoot);
  const moi = inventoryMoi(repositoryRoot, questionRoot);
  const sources = [...suteck.sources, ...moi.sources].sort((a, b) =>
    a.sourceKey.localeCompare(b.sourceKey),
  );
  const allPdfFiles = [...suteck.pdfs, ...moi.pdfs];
  return {
    version: 'reference-source-manifest-v2',
    generatedAt: new Date().toISOString(),
    repositoryRoot,
    counts: {
      authoritativePdfFiles: allPdfFiles.length,
      suteckPdfFiles: suteck.pdfs.length,
      moiPdfFiles: moi.pdfs.length,
      sourceRecords: sources.length,
      moiExamDirectories: moi.examDirectoryCount,
      pairingErrors: [...suteck.errors, ...moi.errors].length,
    },
    excluded,
    pairingErrors: [...suteck.errors, ...moi.errors],
    sources,
  };
}

function inventorySuteck(
  repositoryRoot: string,
  questionRoot: string,
): InventoryResult {
  const directory = path.join(questionRoot, 'suteck');
  const pdfPaths = walk(directory).filter((filePath) =>
    filePath.endsWith('.pdf'),
  );
  const errors: string[] = [];
  const sources: SourceRecord[] = [];
  const pdfs = pdfPaths.map((filePath) => pdfInfo(repositoryRoot, filePath));

  for (const filePath of pdfPaths.sort()) {
    const relativePath = relative(repositoryRoot, filePath);
    const folder = path.basename(path.dirname(filePath));
    const subject = subjectFromSuteckFolder(folder);
    const unitNumber = unitFromFilename(path.basename(filePath));
    if (subject === null || unitNumber === null) {
      errors.push(`SUTECK_METADATA_UNPARSEABLE:${relativePath}`);
      continue;
    }
    sources.push({
      sourceKey: `suteck:${subject}:${unitNumber}`,
      sourceType: 'suteck',
      subject,
      unitNumber,
      questionPdf: relativePath,
      answerPdf: null,
      answerEmbedded: /문제뒤.*답지/u.test(filePath),
      pdfs: [pdfInfo(repositoryRoot, filePath)],
    });
  }
  return { sources, pdfs, errors, examDirectoryCount: 0 };
}

function inventoryMoi(
  repositoryRoot: string,
  questionRoot: string,
): InventoryResult {
  const root = path.join(questionRoot, 'moi');
  const sources: SourceRecord[] = [];
  const pdfs: PdfInfo[] = [];
  const errors: string[] = [];
  let examDirectoryCount = 0;

  for (const directory of walkDirectories(root)) {
    const files = readdirSync(directory)
      .filter((name) => name.endsWith('.pdf'))
      .map((name) => path.join(directory, name))
      .sort();
    if (files.length === 0) continue;
    const metadata = moiMetadata(root, directory);
    if (metadata === null) {
      errors.push(
        `MOI_METADATA_UNPARSEABLE:${relative(repositoryRoot, directory)}`,
      );
      continue;
    }
    examDirectoryCount += 1;
    const answerFiles = files.filter((filePath) =>
      /정답|해설/u.test(path.basename(filePath)),
    );
    const questionFiles = files.filter(
      (filePath) => !answerFiles.includes(filePath),
    );
    if (questionFiles.length !== 1 || answerFiles.length !== 1) {
      errors.push(
        `MOI_PAIRING:${relative(repositoryRoot, directory)}:questions=${questionFiles.length}:answers=${answerFiles.length}`,
      );
      continue;
    }
    const questionPdf = questionFiles[0];
    const answerPdf = answerFiles[0];
    if (questionPdf === undefined || answerPdf === undefined) continue;
    const sourcePdfs = [
      pdfInfo(repositoryRoot, questionPdf),
      pdfInfo(repositoryRoot, answerPdf),
    ];
    pdfs.push(...sourcePdfs);
    sources.push({
      sourceKey: `moi:${metadata.subject}:${metadata.year}:${metadata.examType}`,
      sourceType: 'moi',
      subject: metadata.subject,
      year: metadata.year,
      examType: metadata.examType,
      questionPdf: relative(repositoryRoot, questionPdf),
      answerPdf: relative(repositoryRoot, answerPdf),
      answerEmbedded: false,
      pdfs: sourcePdfs,
    });
  }
  return { sources, pdfs, errors, examDirectoryCount };
}

type InventoryResult = Readonly<{
  sources: readonly SourceRecord[];
  pdfs: readonly PdfInfo[];
  errors: readonly string[];
  examDirectoryCount: number;
}>;

function subjectFromSuteckFolder(folder: string): Subject | null {
  if (folder.normalize('NFC').includes('공업')) return 'kongil';
  if (folder.normalize('NFC').includes('성공적인')) return 'sungjik';
  return null;
}

function unitFromFilename(filename: string): number | null {
  const match = filename.normalize('NFC').match(/^(\d{1,2})강/u);
  if (match?.[1] === undefined) return null;
  const value = Number(match[1]);
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

function moiMetadata(
  moiRoot: string,
  directory: string,
): Readonly<{ subject: Subject; year: number; examType: string }> | null {
  const relativeDirectory = path.relative(moiRoot, directory).split(path.sep);
  const [subjectName, yearText, examType] = relativeDirectory;
  const subject =
    subjectName === 'sungjik' || subjectName === 'kongil' ? subjectName : null;
  const year = yearText === undefined ? NaN : Number(yearText);
  if (subject === null || !Number.isSafeInteger(year) || examType === undefined)
    return null;
  return { subject, year, examType: examType.normalize('NFC') };
}

function pdfInfo(repositoryRoot: string, filePath: string): PdfInfo {
  const relativePath = relative(repositoryRoot, filePath);
  const bytes = readFileSync(filePath);
  let pageCount: number | null = null;
  let textCharacters: number | null = null;
  let textLayer: PdfInfo['textLayer'] = 'unreadable';
  try {
    const info = execFileSync('pdfinfo', [filePath], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    pageCount = Number(info.match(/^Pages:\s+(\d+)/mu)?.[1] ?? NaN);
    if (!Number.isSafeInteger(pageCount)) pageCount = null;
    const text = execFileSync('pdftotext', ['-raw', filePath, '-'], {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    textCharacters = text.length;
    textLayer =
      text.length < TEXT_LAYER_SPARSE_THRESHOLD ? 'sparse' : 'present';
  } catch {
    // Keep the file in the manifest; later OCR can handle unreadable text layers.
  }
  return {
    relativePath,
    sha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    pageCount,
    textCharacters,
    textLayer,
  };
}

function walk(directory: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(directory)) {
    const filePath = path.join(directory, entry);
    if (statSync(filePath).isDirectory()) result.push(...walk(filePath));
    else result.push(filePath);
  }
  return result;
}

function walkDirectories(directory: string): string[] {
  const result: string[] = [];
  for (const entry of readdirSync(directory)) {
    const filePath = path.join(directory, entry);
    if (!statSync(filePath).isDirectory()) continue;
    result.push(filePath, ...walkDirectories(filePath));
  }
  return result;
}

function relative(repositoryRoot: string, filePath: string): string {
  return path
    .relative(repositoryRoot, filePath)
    .split(path.sep)
    .join('/')
    .normalize('NFC');
}

function argumentValue(prefix: string): string | null {
  const value = process.argv.find((argument) => argument.startsWith(prefix));
  return value === undefined ? null : value.slice(prefix.length);
}

void main();
