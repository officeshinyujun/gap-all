import { parseReferenceVariantSemanticVerdict } from './reference-variant-semantic-verifier';

describe('parseReferenceVariantSemanticVerdict', () => {
  it('accepts only an explicit positive verdict with a reason code', () => {
    expect(
      parseReferenceVariantSemanticVerdict(
        JSON.stringify({
          accepted: true,
          reasonCode: 'SOURCE_RELATIONS_PRESERVED',
        }),
      ),
    ).toEqual({ kind: 'accepted', reasonCode: 'SOURCE_RELATIONS_PRESERVED' });
  });

  it.each([
    undefined,
    null,
    '',
    '{}',
    '{"accepted":true}',
    '{"accepted":"true","reasonCode":"INVALID"}',
    '{"accepted":false,"reasonCode":"raw source prose"}',
  ])('rejects malformed verifier output %#', (content) => {
    expect(parseReferenceVariantSemanticVerdict(content)).toEqual({
      kind: 'rejected',
      reason: 'SEMANTIC_VERIFIER_MALFORMED',
    });
  });

  it('preserves a negative verdict reason without accepting the candidate', () => {
    expect(
      parseReferenceVariantSemanticVerdict(
        JSON.stringify({ accepted: false, reasonCode: 'EXCEPTION_OMITTED' }),
      ),
    ).toEqual({
      kind: 'rejected',
      reason: 'SEMANTIC_VERIFIER_REJECTED',
      reasonCode: 'EXCEPTION_OMITTED',
    });
  });
});
