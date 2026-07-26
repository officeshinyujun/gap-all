import {
  SimplyReferenceHistoricalAuditService,
  type PersistedSimplyReferenceAuditRow,
  type SimplyReferenceHistoricalAuditReader,
  renderSimplyReferenceHistoricalAuditJson,
} from './simply-reference-historical-audit.service';

class InMemoryHistoricalAuditReader implements SimplyReferenceHistoricalAuditReader {
  readCount = 0;
  writeCount = 0;

  constructor(
    private readonly rows: readonly PersistedSimplyReferenceAuditRow[],
  ) {}

  async find(): Promise<readonly PersistedSimplyReferenceAuditRow[]> {
    this.readCount += 1;
    return this.rows;
  }

  async write(): Promise<void> {
    this.writeCount += 1;
  }
}

function row(
  questionId: string,
  overrides: Partial<PersistedSimplyReferenceAuditRow> = {},
): PersistedSimplyReferenceAuditRow {
  return {
    questionId,
    recommendedTemplate: 'TPL_COMPARATIVE_MATRIX',
    stimulusData: {
      headers: [{ id: 'header-1', label: 'Header' }],
      rows: [{ id: 'row-1', cells: ['Cell'] }],
      selection_chips: [],
    },
    comboBlock: null,
    lineageSourceId: `success:15:source.pdf:${questionId}`,
    lineageSourceHash: `fnv1a:${questionId}`,
    lineageTemplate: 'TPL_COMPARATIVE_MATRIX',
    lineageValidation: 'passed',
    catalogSourceId: `success:15:source.pdf:${questionId}`,
    catalogContentHash: `fnv1a:${questionId}`,
    catalogViewKeys: [],
    ...overrides,
  };
}

describe('SimplyReferenceHistoricalAuditService', () => {
  it('Given historical rows with every known integrity defect, When auditing, Then classifies every row deterministically without writes', async () => {
    const reader = new InMemoryHistoricalAuditReader([
      row('valid'),
      row('invalid-tpl', { stimulusData: {} }),
      row('missing-combo', { catalogViewKeys: ['ㄱ', 'ㄴ'] }),
      row('duplicate-combo', {
        catalogViewKeys: ['ㄱ', 'ㄴ'],
        comboBlock: {
          title: 'View',
          items: [
            { key: 'ㄱ', text: 'one' },
            { key: 'ㄱ', text: 'duplicate' },
          ],
        },
      }),
      row('hash-drift', { catalogContentHash: 'fnv1a:changed' }),
      row('missing-catalog', {
        catalogSourceId: null,
        catalogContentHash: null,
        catalogViewKeys: null,
      }),
    ]);

    const report = await new SimplyReferenceHistoricalAuditService(
      reader,
    ).audit();

    expect(report).toEqual({
      status: 'failed',
      totalQuestionCount: 6,
      failedQuestionCount: 5,
      byTemplate: [
        {
          template: 'TPL_COMPARATIVE_MATRIX',
          questionCount: 6,
          failedQuestionCount: 5,
        },
      ],
      questions: [
        {
          questionId: 'duplicate-combo',
          template: 'TPL_COMPARATIVE_MATRIX',
          issueCodes: ['duplicate_combo'],
        },
        {
          questionId: 'hash-drift',
          template: 'TPL_COMPARATIVE_MATRIX',
          issueCodes: ['hash_drift'],
        },
        {
          questionId: 'invalid-tpl',
          template: 'TPL_COMPARATIVE_MATRIX',
          issueCodes: ['invalid_tpl'],
        },
        {
          questionId: 'missing-catalog',
          template: 'TPL_COMPARATIVE_MATRIX',
          issueCodes: ['missing_source'],
        },
        {
          questionId: 'missing-combo',
          template: 'TPL_COMPARATIVE_MATRIX',
          issueCodes: ['missing_combo'],
        },
        {
          questionId: 'valid',
          template: 'TPL_COMPARATIVE_MATRIX',
          issueCodes: [],
        },
      ],
    });
    expect(renderSimplyReferenceHistoricalAuditJson(report)).toBe(
      `${JSON.stringify(report, null, 2)}\n`,
    );
    expect(reader.readCount).toBe(1);
    expect(reader.writeCount).toBe(0);
  });

  it('Given duplicate persisted combo blocks, When auditing, Then marks every duplicate question without writes', async () => {
    const comboBlock = {
      title: 'View',
      items: [{ key: 'ㄱ', text: 'one' }],
    };
    const reader = new InMemoryHistoricalAuditReader([
      row('first-combo', { comboBlock }),
      row('second-combo', { comboBlock }),
    ]);

    const report = await new SimplyReferenceHistoricalAuditService(
      reader,
    ).audit();

    expect(report.questions).toEqual([
      {
        questionId: 'first-combo',
        template: 'TPL_COMPARATIVE_MATRIX',
        issueCodes: ['duplicate_combo'],
      },
      {
        questionId: 'second-combo',
        template: 'TPL_COMPARATIVE_MATRIX',
        issueCodes: ['duplicate_combo'],
      },
    ]);
    expect(reader.readCount).toBe(1);
    expect(reader.writeCount).toBe(0);
  });
});
