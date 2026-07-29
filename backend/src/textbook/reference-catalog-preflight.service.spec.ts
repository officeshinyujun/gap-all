import { conceptId } from '../exams/reference-concept-catalog-resolver';
import type { UnitConcepts } from './textbook.service';
import {
  ReferenceCatalogPreflightService,
  type PersistedReferenceQuestion,
  type ReferenceCatalogPreflightReader,
  referenceCatalogPreflightExitCode,
  renderReferenceCatalogPreflightJson,
  renderReferenceCatalogPreflightMarkdown,
} from './reference-catalog-preflight.service';

class InMemoryReferenceCatalogReader implements ReferenceCatalogPreflightReader {
  readCount = 0;
  writeCount = 0;

  constructor(private readonly rows: readonly PersistedReferenceQuestion[]) {}

  async find(): Promise<readonly PersistedReferenceQuestion[]> {
    this.readCount += 1;
    return this.rows;
  }

  async write(): Promise<void> {
    this.writeCount += 1;
  }
}

class InMemoryConceptCatalogReader {
  constructor(private readonly units: readonly UnitConcepts[]) {}

  getConcepts(): UnitConcepts[] {
    return [...this.units];
  }
}

function row(
  logicalSourceId: string,
  unitNumber: number,
  targetConcepts: readonly string[],
): PersistedReferenceQuestion {
  const questionNumber = Number(logicalSourceId.split(':').at(-1) ?? '1');
  return {
    logicalSourceId,
    subject: 'success',
    unitNumber,
    sourcePayload: {
      source: { filename: `unit-${unitNumber}.pdf`, unitNumber },
      questionNumber,
      stem: `Question ${questionNumber} for unit ${unitNumber}`,
      stimulus: `Reference stimulus for unit ${unitNumber} question ${questionNumber}`,
      choices: ['one', 'two', 'three', 'four', 'five'],
      correctAnswer: 1,
      targetConcepts,
    },
  };
}

describe('ReferenceCatalogPreflightService', () => {
  it('Given persisted rows in arbitrary order, When preflighting, Then emits byte-stable sorted redacted JSON and Markdown without writes', async () => {
    const reader = new InMemoryReferenceCatalogReader([
      row('success:2:unit-2.pdf:2', 2, ['Career Planning']),
      row('success:1:unit-1.pdf:1', 1, ['Career Values']),
    ]);
    const service = new ReferenceCatalogPreflightService(
      reader,
      new InMemoryConceptCatalogReader([
        { unitName: '1단원', concepts: ['Career Values'] },
        { unitName: '2단원', concepts: ['Career Planning'] },
      ]),
    );

    const report = await service.preflight();
    const careerValuesId = conceptId('success', 1, 'Career Values');
    const careerPlanningId = conceptId('success', 2, 'Career Planning');

    expect(report).toEqual({
      status: 'passed',
      totalRowCount: 2,
      failedRowCount: 0,
      rows: [
        {
          sourceId: 'success:1:unit-1.pdf:1',
          canonicalId: careerValuesId,
          result: 'RESOLVED',
        },
        {
          sourceId: 'success:2:unit-2.pdf:2',
          canonicalId: careerPlanningId,
          result: 'RESOLVED',
        },
      ],
    });
    expect(renderReferenceCatalogPreflightJson(report)).toBe(`{
  "status": "passed",
  "totalRowCount": 2,
  "failedRowCount": 0,
  "rows": [
    {
      "sourceId": "success:1:unit-1.pdf:1",
      "canonicalId": "${careerValuesId}",
      "result": "RESOLVED"
    },
    {
      "sourceId": "success:2:unit-2.pdf:2",
      "canonicalId": "${careerPlanningId}",
      "result": "RESOLVED"
    }
  ]
}
`);
    expect(renderReferenceCatalogPreflightMarkdown(report))
      .toBe(`# Reference Catalog Preflight

Status: passed
Rows: 2
Failures: 0

| Source ID | Canonical ID | Result |
| --- | --- | --- |
| success:1:unit-1.pdf:1 | ${careerValuesId} | RESOLVED |
| success:2:unit-2.pdf:2 | ${careerPlanningId} | RESOLVED |
`);
    expect(renderReferenceCatalogPreflightJson(report)).not.toContain(
      'Reference stimulus',
    );
    expect(referenceCatalogPreflightExitCode(report)).toBe(0);
    expect(reader.readCount).toBe(1);
    expect(reader.writeCount).toBe(0);
  });

  it('Given malformed, unresolved, and colliding persisted rows, When preflighting, Then returns sorted machine failures without writes', async () => {
    const reader = new InMemoryReferenceCatalogReader([
      row('success:3:unit-3.pdf:3', 3, ['Risk Control']),
      row('success:2:unit-2.pdf:2', 2, []),
      row('malformed-logical-source-id', 1, ['Career Values']),
    ]);
    const service = new ReferenceCatalogPreflightService(
      reader,
      new InMemoryConceptCatalogReader([
        { unitName: '3단원', concepts: ['Risk Control', ' risk\tcontrol '] },
      ]),
    );

    const report = await service.preflight();
    expect(report).toEqual({
      status: 'failed',
      totalRowCount: 3,
      failedRowCount: 3,
      rows: [
        {
          sourceId: 'malformed-logical-source-id',
          canonicalId: null,
          result: 'INVALID_LOGICAL_SOURCE_ID',
        },
        {
          sourceId: 'success:2:unit-2.pdf:2',
          canonicalId: null,
          result: 'MISSING_PRIMARY_TARGET',
        },
        {
          sourceId: 'success:3:unit-3.pdf:3',
          canonicalId: null,
          result: 'AMBIGUOUS_PRIMARY_TARGET',
        },
      ],
    });
    expect(referenceCatalogPreflightExitCode(report)).toBe(1);
    expect(reader.writeCount).toBe(0);
  });

  it('Given a catalog source without an official answer, When preflighting, Then requires re-extraction before it can be used', async () => {
    const base = row('success:1:unit-1.pdf:1', 1, ['Career Values']);
    const missingAnswer: PersistedReferenceQuestion = {
      ...base,
      sourcePayload: { ...base.sourcePayload, correctAnswer: null },
    };
    const report = await new ReferenceCatalogPreflightService(
      new InMemoryReferenceCatalogReader([missingAnswer]),
      new InMemoryConceptCatalogReader([
        { unitName: '1단원', concepts: ['Career Values'] },
      ]),
    ).preflight();

    expect(report.rows).toEqual([
      {
        sourceId: 'success:1:unit-1.pdf:1',
        canonicalId: null,
        result: 'MISSING_OFFICIAL_ANSWER',
      },
    ]);
    expect(referenceCatalogPreflightExitCode(report)).toBe(1);
  });

  it('Given a valid legacy logical source ID, When preflighting, Then reports identity migration separately from invalid payloads', async () => {
    const legacy = row('sungjik:suteck:1:unit-1.pdf:1', 1, [
      'Career Values',
    ]);
    const report = await new ReferenceCatalogPreflightService(
      new InMemoryReferenceCatalogReader([legacy]),
      new InMemoryConceptCatalogReader([
        { unitName: '1단원', concepts: ['Career Values'] },
      ]),
    ).preflight();

    expect(report.rows).toEqual([
      {
        sourceId: 'sungjik:suteck:1:unit-1.pdf:1',
        canonicalId: null,
        result: 'LEGACY_LOGICAL_SOURCE_ID',
      },
    ]);
  });

  it('Given a legacy MOI source ID without year or exam fields, When preflighting, Then reports identity migration', async () => {
    const legacy = row('sungjik:moi:2024-09-question.pdf:1', 1, [
      'Career Values',
    ]);
    const report = await new ReferenceCatalogPreflightService(
      new InMemoryReferenceCatalogReader([legacy]),
      new InMemoryConceptCatalogReader([
        { unitName: '1단원', concepts: ['Career Values'] },
      ]),
    ).preflight();

    expect(report.rows[0]).toMatchObject({
      sourceId: 'sungjik:moi:2024-09-question.pdf:1',
      result: 'LEGACY_LOGICAL_SOURCE_ID',
    });
  });
});
