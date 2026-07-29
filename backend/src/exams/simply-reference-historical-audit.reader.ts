import type {
  PersistedSimplyReferenceAuditRow,
  SimplyReferenceHistoricalAuditReader,
} from './simply-reference-historical-audit.service';

export const HISTORICAL_SIMPLY_REFERENCE_AUDIT_SQL = `WITH scoped_questions AS (
  SELECT
    q.id AS "questionId",
    q.recommended_template AS "recommendedTemplate",
    q.stimulus_data AS "stimulusData",
    q.question_stem AS "questionStem",
    q.options_list AS "optionsList",
    q.correct_answer AS "correctAnswer",
    q.combo_block AS "comboBlock",
    q.generation_lineage #>> '{source,sourceId}' AS "lineageSourceId",
    q.generation_lineage #>> '{source,sourceHash}' AS "lineageSourceHash",
    q.generation_lineage #>> '{selectedTemplate}' AS "lineageTemplate",
    q.generation_lineage #>> '{validation}' AS "lineageValidation"
  FROM questions q
  WHERE q.item_type = 'simply_reference'
    AND q.generation_lineage ->> 'generationPath' = 'simply_reference'
)
SELECT
  q."questionId",
  q."recommendedTemplate",
  q."stimulusData",
  q."questionStem",
  q."optionsList",
  q."correctAnswer",
  q."comboBlock",
  q."lineageSourceId",
  q."lineageSourceHash",
  q."lineageTemplate",
  q."lineageValidation",
  rq.logical_source_id AS "catalogSourceId",
  rq.content_hash AS "catalogContentHash",
  rq.source_payload -> 'correctAnswer' AS "catalogCorrectAnswer",
  CASE
    WHEN rq.id IS NULL THEN NULL
    ELSE COALESCE(rq.source_payload -> 'viewItems', '[]'::jsonb)
  END AS "catalogViewItems"
FROM scoped_questions q
LEFT JOIN reference_questions rq
  ON rq.logical_source_id = q."lineageSourceId"
ORDER BY q."questionId"
`;

export type HistoricalAuditQueryRunner = Readonly<{
  isTransactionActive: boolean;
  connect: () => Promise<void>;
  startTransaction: (isolationLevel?: 'REPEATABLE READ') => Promise<void>;
  commitTransaction: () => Promise<void>;
  rollbackTransaction: () => Promise<void>;
  release: () => Promise<void>;
  query: (statement: string) => Promise<unknown>;
}>;

export class SimplyReferenceHistoricalAuditDatabaseReader implements SimplyReferenceHistoricalAuditReader {
  constructor(private readonly queryRunner: HistoricalAuditQueryRunner) {}

  async find(): Promise<readonly PersistedSimplyReferenceAuditRow[]> {
    await this.queryRunner.connect();
    await this.queryRunner.startTransaction('REPEATABLE READ');
    try {
      await this.queryRunner.query('SET TRANSACTION READ ONLY');
      const rows = parseRows(
        await this.queryRunner.query(HISTORICAL_SIMPLY_REFERENCE_AUDIT_SQL),
      );
      await this.queryRunner.commitTransaction();
      return rows;
    } catch (error) {
      if (this.queryRunner.isTransactionActive) {
        await this.queryRunner.rollbackTransaction();
      }
      throw error;
    } finally {
      await this.queryRunner.release();
    }
  }
}

class HistoricalAuditRowError extends Error {
  readonly name = 'HistoricalAuditRowError';

  constructor(readonly reason: string) {
    super(`Historical simply_reference audit row is invalid: ${reason}`);
  }
}

function parseRows(
  value: unknown,
): readonly PersistedSimplyReferenceAuditRow[] {
  if (!Array.isArray(value)) {
    throw new HistoricalAuditRowError('query did not return an array');
  }
  return value.map(parseRow);
}

function parseRow(value: unknown): PersistedSimplyReferenceAuditRow {
  if (!isRecord(value)) {
    throw new HistoricalAuditRowError('row is not an object');
  }
  return {
    questionId: requiredText(value.questionId, 'questionId'),
    recommendedTemplate: requiredText(
      value.recommendedTemplate,
      'recommendedTemplate',
    ),
    stimulusData: nullableRecord(value.stimulusData),
    questionStem: requiredText(value.questionStem, 'questionStem'),
    optionsList: stringArray(value.optionsList, 'optionsList'),
    correctAnswer: nullableAnswer(value.correctAnswer, 'correctAnswer'),
    comboBlock: comboBlock(value.comboBlock),
    lineageSourceId: nullableText(value.lineageSourceId),
    lineageSourceHash: nullableText(value.lineageSourceHash),
    lineageTemplate: nullableText(value.lineageTemplate),
    lineageValidation: nullableText(value.lineageValidation),
    catalogSourceId: nullableText(value.catalogSourceId),
    catalogContentHash: nullableText(value.catalogContentHash),
    catalogViewKeys: catalogViewKeys(value.catalogViewItems),
    catalogCorrectAnswer: nullableAnswer(
      value.catalogCorrectAnswer,
      'catalogCorrectAnswer',
    ),
  };
}

function comboBlock(
  value: unknown,
): PersistedSimplyReferenceAuditRow['comboBlock'] {
  if (!isRecord(value) || !Array.isArray(value.items)) return null;
  const title = nullableText(value.title);
  if (title === null) return null;
  const items = value.items.map((item) => {
    if (!isRecord(item)) return null;
    const key = nullableText(item.key);
    const text = nullableText(item.text);
    return key === null || text === null ? null : { key, text };
  });
  return items.some((item) => item === null)
    ? null
    : { title, items: items.filter(isPresent) };
}

function catalogViewKeys(value: unknown): readonly string[] | null {
  if (value === null || value === undefined) return null;
  return stringArray(value, 'catalogViewItems').map((item, index) => {
    const key = item.trim().match(/^([ㄱ-ㅎ])(?:[.\s]|$)/u)?.[1];
    return key ?? String(index + 1);
  });
}

function stringArray(value: unknown, field: string): readonly string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new HistoricalAuditRowError(`${field} is not a string array`);
  }
  return value;
}

function requiredText(value: unknown, field: string): string {
  const text = nullableText(value);
  if (text === null) throw new HistoricalAuditRowError(`${field} is missing`);
  return text;
}

function nullableText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

function nullableRecord(
  value: unknown,
): Readonly<Record<string, unknown>> | null {
  return isRecord(value) ? value : null;
}

function nullableAnswer(value: unknown, field: string): number | null {
  if (value === null || value === undefined) return null;
  if (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= 1 &&
    value <= 5
  ) {
    return value;
  }
  throw new HistoricalAuditRowError(`${field} is not an answer number`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}
