import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import * as path from 'node:path';
import { parseReference } from '../src/exams/reference-selector.utils';
import { sourcePreservingRender } from '../src/exams/simply-reference-source-preserving.adapter';

type Corpus = {
  source: Record<string, unknown>;
  questions: Array<Record<string, unknown>>;
};
type CertifiedRecord = Readonly<{
  logicalSourceId: string;
  subject: 'success' | 'kongil';
  unitNumber: number;
  parseVersion: 'reference-pdf-v2';
  payload: Record<string, unknown>;
}>;
type BlockedRecord = Readonly<{
  sourceKey: string;
  questionNumber: number;
  reasons: readonly string[];
}>;

function main(): void {
  const repositoryRoot = path.resolve(__dirname, '../..');
  const corpusRoot = path.join(repositoryRoot, 'artifacts/reference-corpus-v2');
  const outputPath = path.join(
    repositoryRoot,
    'artifacts/reference-certification-v2.json',
  );
  const certified: CertifiedRecord[] = [];
  const blocked: BlockedRecord[] = [];
  for (const file of readdirSync(corpusRoot).filter((name) =>
    name.endsWith('.json'),
  )) {
    const corpus = JSON.parse(
      readFileSync(path.join(corpusRoot, file), 'utf8'),
    ) as Corpus;
    for (const question of corpus.questions) {
      const result = buildRecord(corpus.source, question);
      if (result.kind === 'certified') certified.push(result.value);
      else blocked.push(result.value);
    }
  }
  const report = {
    version: 'reference-certification-v2',
    certified,
    blocked,
    counts: {
      total: certified.length + blocked.length,
      certified: certified.length,
      blocked: blocked.length,
    },
  };
  writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(
    `${JSON.stringify({ outputPath, counts: report.counts })}\n`,
  );
  if (blocked.length > 0) process.exitCode = 1;
}

function buildRecord(
  source: Record<string, unknown>,
  question: Record<string, unknown>,
):
  | Readonly<{ kind: 'certified'; value: CertifiedRecord }>
  | Readonly<{ kind: 'blocked'; value: BlockedRecord }> {
  const sourceKey = stringValue(source.sourceKey);
  const questionNumber = numberValue(question.questionNumber);
  const reasons: string[] = [];
  const subject = sourceSubject(source.subject);
  const questionUnitNumber = numberValue(question.unitNumber);
  const unitNumber = Number.isSafeInteger(questionUnitNumber)
    ? questionUnitNumber
    : numberValue(source.unitNumber);
  const filename =
    stringValue(question.legacySourceFilename) ||
    path.basename(stringValue(source.questionPdf));
  const targetConcepts = arrayOfStrings(question.targetConcepts);
  const choices = arrayOfStrings(question.choices);
  const explanation = stringValue(question.explanation);
  const generatedExplanation = stringValue(question.generatedExplanation);
  const visual = recordValue(question.visual);
  const table = visual?.kind === 'table' ? tableData(visual) : null;
  if (subject === null) reasons.push('INVALID_SUBJECT');
  if (!Number.isSafeInteger(unitNumber) || unitNumber < 1)
    reasons.push('MISSING_UNIT');
  if (filename === '') reasons.push('MISSING_CANONICAL_FILENAME');
  if (targetConcepts.length === 0) reasons.push('MISSING_TARGET_CONCEPT');
  if (choices.length !== 5) reasons.push('INVALID_CHOICE_COUNT');
  if (!Number.isInteger(question.correctAnswer) || numberValue(question.correctAnswer) < 1 || numberValue(question.correctAnswer) > 5)
    reasons.push('MISSING_OFFICIAL_ANSWER');
  if (explanation === '' && generatedExplanation === '')
    reasons.push('MISSING_OFFICIAL_EXPLANATION');
  if (visual?.kind === 'table' && table === null)
    reasons.push('INCOMPLETE_TABLE');
  const stimulus = stimulusText(question, table);
  if (stimulus === '') reasons.push('EMPTY_STIMULUS');
  if (
    reasons.length > 0 ||
    subject === null ||
    !Number.isSafeInteger(unitNumber) ||
    filename === ''
  ) {
    return {
      kind: 'blocked',
      value: { sourceKey, questionNumber, reasons },
    };
  }
  const payload: Record<string, unknown> = {
    source: {
      type: source.sourceType,
      subject,
      subjectKor: subject === 'success' ? '성공적인 직업생활' : '공업 일반',
      unitNumber,
      year: source.year,
      examType: source.examType,
      filename,
    },
    questionNumber,
    stem: stringValue(question.stem),
    stimulus,
    viewItems: arrayOfStrings(question.viewItems),
    choices,
    correctAnswer: numberValue(question.correctAnswer),
    explanation,
    targetConcepts,
  };
  if (generatedExplanation !== '') {
    payload.generatedExplanation = generatedExplanation;
    payload.generatedExplanationProvenance = stringValue(
      question.generatedExplanationProvenance,
    ) || 'subagent-generated';
    payload.generatedExplanationVersion = stringValue(
      question.generatedExplanationVersion,
    ) || 'manual-v1';
  }
  if (table !== null) payload.tplStimulusData = table;
  const parsed = parseReference(payload, subject);
  if (!parsed.ok) reasons.push('PARSE_REFERENCE_REJECTED');
  else if (sourcePreservingRender(parsed.value) === null)
    reasons.push('SOURCE_RENDER_REJECTED');
  if (reasons.length > 0 || !parsed.ok) {
    return { kind: 'blocked', value: { sourceKey, questionNumber, reasons } };
  }
  return {
    kind: 'certified',
    value: {
      logicalSourceId: parsed.value.source.sourceId,
      subject,
      unitNumber,
      parseVersion: 'reference-pdf-v2',
      payload,
    },
  };
}

function tableData(
  value: Record<string, unknown>,
): Record<string, unknown> | null {
  const headers = Array.isArray(value.headers) ? value.headers : [];
  const rows = Array.isArray(value.rows) ? value.rows : [];
  if (headers.length === 0 || rows.length === 0) return null;
  const headerData = headers.map((header) => {
    const item = recordValue(header);
    return { id: stringValue(item?.id), label: stringValue(item?.label) };
  });
  const rowData = rows.map((row) => {
    const item = recordValue(row);
    return { id: stringValue(item?.id), cells: arrayOfStrings(item?.cells) };
  });
  if (headerData.some((header) => header.id === '' || header.label === ''))
    return null;
  if (
    rowData.some(
      (row) => row.id === '' || row.cells.length !== headerData.length,
    )
  )
    return null;
  return { headers: headerData, rows: rowData, selection_chips: [] };
}

function stimulusText(
  question: Record<string, unknown>,
  table: Record<string, unknown> | null,
): string {
  const stimulus = stringValue(question.stimulus);
  if (stimulus !== '') return stimulus;
  if (table === null) return '';
  const headers = (table.headers as Array<{ label: string }>).map(
    (header) => header.label,
  );
  const rows = table.rows as Array<{ cells: string[] }>;
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.cells.join(' | ')} |`),
  ].join('\n');
}

function sourceSubject(value: unknown): 'success' | 'kongil' | null {
  if (value === 'sungjik' || value === 'success') return 'success';
  if (value === 'kongil') return 'kongil';
  return null;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : [];
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function numberValue(value: unknown): number {
  return typeof value === 'number' ? value : Number(value);
}

void main();
