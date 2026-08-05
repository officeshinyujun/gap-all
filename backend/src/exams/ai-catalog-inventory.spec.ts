import { buildAiCatalogInventory } from './ai-catalog-inventory';

function source(id: string, template = 'case'): Record<string, unknown> {
  return {
    source: { filename: `${id}.pdf`, unitNumber: 1 }, questionNumber: 1,
    stem: 'Question', stimulus: template === 'dialogue' ? 'A: one\nB: two' : 'A certified case',
    choices: ['one', 'two', 'three', 'four', 'five'], correctAnswer: 1,
    targetConcepts: ['Concept'],
  };
}

describe('buildAiCatalogInventory', () => {
  it('groups by subject, unit, TPL and counts distinct eligible sources', () => {
    const report = buildAiCatalogInventory([
      { logicalSourceId: 'success:1:a:1', subject: 'success', unitNumber: 1, sourcePayload: source('a') },
      { logicalSourceId: 'success:1:b:1', subject: 'success', unitNumber: 1, sourcePayload: source('b', 'dialogue') },
      { logicalSourceId: 'success:1:c:1', subject: 'success', unitNumber: 1, sourcePayload: { broken: true } },
    ]);
    expect(report.totalRows).toBe(3);
    expect(report.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ template: 'TPL_CASE_DIAGNOSTIC_FRAME', distinctBaseSource: 1, aiEligible: 1, projectedVariants: 1 }),
      expect.objectContaining({ template: 'UNPARSEABLE', raw: 1, aiEligible: 0, excludedByReason: { INVALID_SOURCE_PAYLOAD: 1 } }),
    ]));
  });
});
