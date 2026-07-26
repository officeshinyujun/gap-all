import {
  HISTORICAL_SIMPLY_REFERENCE_AUDIT_SQL,
  SimplyReferenceHistoricalAuditDatabaseReader,
  type HistoricalAuditQueryRunner,
} from './simply-reference-historical-audit.reader';

class InMemoryQueryRunner implements HistoricalAuditQueryRunner {
  readonly statements: string[] = [];
  readonly lifecycle: string[] = [];
  isTransactionActive = false;

  async connect(): Promise<void> {
    this.lifecycle.push('connect');
  }

  async startTransaction(): Promise<void> {
    this.lifecycle.push('startTransaction');
    this.isTransactionActive = true;
  }

  async commitTransaction(): Promise<void> {
    this.lifecycle.push('commitTransaction');
    this.isTransactionActive = false;
  }

  async rollbackTransaction(): Promise<void> {
    this.lifecycle.push('rollbackTransaction');
    this.isTransactionActive = false;
  }

  async release(): Promise<void> {
    this.lifecycle.push('release');
  }

  async query(statement: string): Promise<unknown> {
    this.statements.push(statement);
    if (statement === HISTORICAL_SIMPLY_REFERENCE_AUDIT_SQL) {
      return [
        {
          questionId: 'question-1',
          recommendedTemplate: 'TPL_COMPARATIVE_MATRIX',
          stimulusData: {
            headers: [{ id: 'header-1', label: 'Header' }],
            rows: [{ id: 'row-1', cells: ['Cell'] }],
            selection_chips: [],
          },
          comboBlock: null,
          lineageSourceId: 'success:15:source.pdf:1',
          lineageSourceHash: 'fnv1a:12345678',
          lineageTemplate: 'TPL_COMPARATIVE_MATRIX',
          lineageValidation: 'passed',
          catalogSourceId: 'success:15:source.pdf:1',
          catalogContentHash: 'fnv1a:12345678',
          catalogViewItems: [],
        },
      ];
    }
    return [];
  }
}

describe('SimplyReferenceHistoricalAuditDatabaseReader', () => {
  it('Given a TypeORM-compatible runner, When reading historical rows, Then uses an explicit read-only transaction and no write SQL', async () => {
    const queryRunner = new InMemoryQueryRunner();

    const rows = await new SimplyReferenceHistoricalAuditDatabaseReader(
      queryRunner,
    ).find();

    expect(rows).toEqual([
      expect.objectContaining({
        questionId: 'question-1',
        catalogViewKeys: [],
      }),
    ]);
    expect(queryRunner.lifecycle).toEqual([
      'connect',
      'startTransaction',
      'commitTransaction',
      'release',
    ]);
    expect(queryRunner.statements).toEqual([
      'SET TRANSACTION READ ONLY',
      HISTORICAL_SIMPLY_REFERENCE_AUDIT_SQL,
    ]);
    expect(HISTORICAL_SIMPLY_REFERENCE_AUDIT_SQL).toMatch(/^WITH\b/u);
    expect(HISTORICAL_SIMPLY_REFERENCE_AUDIT_SQL).not.toMatch(/,\s*FROM\b/u);
    expect(HISTORICAL_SIMPLY_REFERENCE_AUDIT_SQL).not.toMatch(
      /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|MERGE)\b/iu,
    );
    expect(queryRunner.statements.join('\n')).not.toMatch(
      /\b(?:INSERT|UPDATE|DELETE|ALTER|CREATE|DROP|TRUNCATE|MERGE)\b/iu,
    );
  });
});
