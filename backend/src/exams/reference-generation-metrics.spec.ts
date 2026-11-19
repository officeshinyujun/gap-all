import {
  legacyRequestCount,
  measureLegacyReferenceGenerationBaseline,
  measureLegacyReferenceGenerationRequestBytes,
} from './reference-generation-metrics';

describe('measureLegacyReferenceGenerationBaseline', () => {
  it('measures deterministic legacy request bytes and call counts without exposing payloads', () => {
    const first = measureLegacyReferenceGenerationBaseline();
    const second = measureLegacyReferenceGenerationBaseline();

    expect(first).toEqual(second);
    expect(first.calls).toEqual({ tenQuestions: 21, twentyQuestions: 41 });
    expect(first.requests).toEqual({ tenQuestions: 21, twentyQuestions: 41 });
    expect(first.fixtureHash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(first.bytes.tenQuestions).toBeGreaterThan(0);
    expect(first.bytes.twentyQuestions).toBeGreaterThan(
      first.bytes.tenQuestions,
    );
    expect(Object.keys(first)).toEqual([
      'fixtureHash',
      'serialization',
      'calls',
      'requests',
      'bytes',
    ]);
  });

  it('rejects a non-positive question count before serializing a fixture', () => {
    expect(() => measureLegacyReferenceGenerationRequestBytes(0)).toThrow(
      'Question count must be a positive integer.',
    );
    expect(() => legacyRequestCount(1.5)).toThrow(
      'Question count must be a positive integer.',
    );
  });
});
