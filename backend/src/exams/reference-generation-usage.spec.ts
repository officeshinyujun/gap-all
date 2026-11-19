import { ReferenceGenerationUsageCollector } from './reference-generation-usage';

describe('ReferenceGenerationUsageCollector', () => {
  it('records redacted attempts once and preserves unavailable usage', () => {
    const collector = new ReferenceGenerationUsageCollector();
    const attempt = {
      runId: 'run-1',
      stage: 'blueprint' as const,
      batchOrdinal: 0,
      model: 'mock',
      promptTokens: null,
      completionTokens: null,
      retry: false,
      requestBytes: 10,
    };
    collector.record(attempt);
    collector.record(attempt);
    expect(collector.all()).toEqual([attempt]);
    expect(JSON.stringify(collector.all())).not.toContain('prompt-content');
  });
});
