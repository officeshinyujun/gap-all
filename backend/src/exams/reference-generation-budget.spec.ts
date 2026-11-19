import { measureReferenceGenerationBudget } from './reference-generation-budget';

describe('measureReferenceGenerationBudget', () => {
  it('reports blueprint plus homogeneous batch request count without claiming fixed real-corpus calls', () => {
    expect(
      measureReferenceGenerationBudget(10, 'blueprint', ['batch-1', 'batch-2']),
    ).toEqual({ questionCount: 10, requestCount: 3, requestBytes: 23 });
    expect(
      measureReferenceGenerationBudget(20, 'blueprint', ['1', '2', '3', '4']),
    ).toMatchObject({ requestCount: 5 });
  });
});
