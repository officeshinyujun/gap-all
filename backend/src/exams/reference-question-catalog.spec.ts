import { ReferenceQuestionCatalog } from './reference-question-catalog';

const input = {
  logicalSourceId: 'success:1:1',
  contentHash: 'sha256:abc',
  subject: 'success',
  unitNumber: 1,
  provenancePath: 'textbook/parsed/sungjik/all/1단원.json',
  parseVersion: 'parsed-v1',
  sourcePayload: { stem: 'fixture' },
} as const;

describe('ReferenceQuestionCatalog', () => {
  it('keeps an immutable source fingerprint and makes duplicate import a no-op', () => {
    const catalog = new ReferenceQuestionCatalog();
    expect(catalog.insert(input).kind).toBe('inserted');
    expect(
      catalog.insert({ ...input, sourcePayload: { stem: 'different object' } }),
    ).toEqual({
      kind: 'existing',
      value: input,
    });
  });

  it('rejects changed content for an existing logical source', () => {
    const catalog = new ReferenceQuestionCatalog();
    catalog.insert(input);
    expect(catalog.insert({ ...input, contentHash: 'sha256:def' }).kind).toBe(
      'version_conflict',
    );
  });
});
