import { isStructuredTplName } from './tpl-schemas';
import { StimulusNormalizer } from './stimulus-normalizer';

export const SIMPLY_REFERENCE_HISTORICAL_AUDIT_ISSUE_CODES = [
  'invalid_tpl',
  'missing_combo',
  'duplicate_combo',
  'hash_drift',
  'missing_source',
] as const;

export type SimplyReferenceHistoricalAuditIssueCode =
  (typeof SIMPLY_REFERENCE_HISTORICAL_AUDIT_ISSUE_CODES)[number];

export type PersistedSimplyReferenceAuditRow = Readonly<{
  questionId: string;
  recommendedTemplate: string;
  stimulusData: Readonly<Record<string, unknown>> | null;
  comboBlock: Readonly<{
    title: string;
    items: readonly Readonly<{ key: string; text: string }>[];
  }> | null;
  lineageSourceId: string | null;
  lineageSourceHash: string | null;
  lineageTemplate: string | null;
  lineageValidation: string | null;
  catalogSourceId: string | null;
  catalogContentHash: string | null;
  catalogViewKeys: readonly string[] | null;
}>;

export type SimplyReferenceHistoricalAuditReader = Readonly<{
  find: () => Promise<readonly PersistedSimplyReferenceAuditRow[]>;
}>;

export type SimplyReferenceHistoricalAuditQuestion = Readonly<{
  questionId: string;
  template: string;
  issueCodes: readonly SimplyReferenceHistoricalAuditIssueCode[];
}>;

export type SimplyReferenceHistoricalAuditTemplateSummary = Readonly<{
  template: string;
  questionCount: number;
  failedQuestionCount: number;
}>;

export type SimplyReferenceHistoricalAuditReport = Readonly<{
  status: 'passed' | 'failed';
  totalQuestionCount: number;
  failedQuestionCount: number;
  byTemplate: readonly SimplyReferenceHistoricalAuditTemplateSummary[];
  questions: readonly SimplyReferenceHistoricalAuditQuestion[];
}>;

export class SimplyReferenceHistoricalAuditService {
  constructor(private readonly reader: SimplyReferenceHistoricalAuditReader) {}

  async audit(): Promise<SimplyReferenceHistoricalAuditReport> {
    const persistedRows = await this.reader.find();
    const questionsWithDuplicateCombo =
      duplicateComboQuestionIds(persistedRows);
    const questions = persistedRows
      .map((row) =>
        classify(row, questionsWithDuplicateCombo.has(row.questionId)),
      )
      .sort((left, right) => compare(left.questionId, right.questionId));
    const failedQuestionCount = questions.filter(
      (question) => question.issueCodes.length > 0,
    ).length;

    return {
      status: failedQuestionCount === 0 ? 'passed' : 'failed',
      totalQuestionCount: questions.length,
      failedQuestionCount,
      byTemplate: summarizeByTemplate(questions),
      questions,
    };
  }
}

export function renderSimplyReferenceHistoricalAuditJson(
  report: SimplyReferenceHistoricalAuditReport,
): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

function classify(
  row: PersistedSimplyReferenceAuditRow,
  hasDuplicateCombo: boolean,
): SimplyReferenceHistoricalAuditQuestion {
  const issueCodes: SimplyReferenceHistoricalAuditIssueCode[] = [];

  if (
    !isStructuredTplName(row.recommendedTemplate) ||
    row.lineageTemplate !== row.recommendedTemplate ||
    row.stimulusData === null ||
    !STIMULUS_NORMALIZER.isRenderableTplData(
      row.stimulusData,
      row.recommendedTemplate,
    )
  ) {
    issueCodes.push('invalid_tpl');
  }
  if (row.catalogSourceId === null) {
    issueCodes.push('missing_source');
  } else if (row.catalogContentHash !== row.lineageSourceHash) {
    issueCodes.push('hash_drift');
  }
  if (
    row.catalogViewKeys !== null &&
    row.catalogViewKeys.length > 0 &&
    row.comboBlock === null
  ) {
    issueCodes.push('missing_combo');
  }
  if (hasDuplicateCombo || hasDuplicateComboKey(row.comboBlock)) {
    issueCodes.push('duplicate_combo');
  }

  return {
    questionId: row.questionId,
    template: row.recommendedTemplate,
    issueCodes: issueCodes.sort(compareIssueCodes),
  };
}

function summarizeByTemplate(
  questions: readonly SimplyReferenceHistoricalAuditQuestion[],
): readonly SimplyReferenceHistoricalAuditTemplateSummary[] {
  const summaries = new Map<
    string,
    { questionCount: number; failedQuestionCount: number }
  >();
  for (const question of questions) {
    const current = summaries.get(question.template) ?? {
      questionCount: 0,
      failedQuestionCount: 0,
    };
    current.questionCount += 1;
    if (question.issueCodes.length > 0) current.failedQuestionCount += 1;
    summaries.set(question.template, current);
  }
  return [...summaries.entries()]
    .map(([template, summary]) => ({ template, ...summary }))
    .sort((left, right) => compare(left.template, right.template));
}

function hasDuplicateComboKey(
  comboBlock: PersistedSimplyReferenceAuditRow['comboBlock'],
): boolean {
  if (comboBlock === null) return false;
  const keys = comboBlock.items.map((item) => item.key);
  return new Set(keys).size !== keys.length;
}

function duplicateComboQuestionIds(
  rows: readonly PersistedSimplyReferenceAuditRow[],
): ReadonlySet<string> {
  const questionIdsByCombo = new Map<string, string[]>();
  for (const row of rows) {
    if (row.comboBlock === null) continue;
    const key = JSON.stringify(row.comboBlock);
    const questionIds = questionIdsByCombo.get(key) ?? [];
    questionIds.push(row.questionId);
    questionIdsByCombo.set(key, questionIds);
  }
  return new Set(
    [...questionIdsByCombo.values()]
      .filter((questionIds) => questionIds.length > 1)
      .flat(),
  );
}

function compareIssueCodes(
  left: SimplyReferenceHistoricalAuditIssueCode,
  right: SimplyReferenceHistoricalAuditIssueCode,
): number {
  return (
    SIMPLY_REFERENCE_HISTORICAL_AUDIT_ISSUE_CODES.indexOf(left) -
    SIMPLY_REFERENCE_HISTORICAL_AUDIT_ISSUE_CODES.indexOf(right)
  );
}

function compare(left: string, right: string): number {
  return left === right ? 0 : left < right ? -1 : 1;
}

const STIMULUS_NORMALIZER = new StimulusNormalizer();
