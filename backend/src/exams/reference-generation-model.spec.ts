import {
  DEFAULT_REFERENCE_FINAL_GENERATION_MODEL,
  DEFAULT_REFERENCE_GENERATION_MODEL,
  referenceFinalGenerationModel,
  referenceGenerationModel,
} from './reference-generation-model';

describe('referenceGenerationModel', () => {
  it('uses gpt-4o-mini by default for reference generation', () => {
    expect(referenceGenerationModel({})).toBe(
      DEFAULT_REFERENCE_GENERATION_MODEL,
    );
  });

  it('allows an explicit reference-generation model override', () => {
    expect(referenceGenerationModel({ OPENAI_REFERENCE_MODEL: 'gpt-4o' })).toBe(
      'gpt-4o',
    );
  });

  it('ignores an empty reference-generation model override', () => {
    expect(referenceGenerationModel({ OPENAI_REFERENCE_MODEL: '   ' })).toBe(
      DEFAULT_REFERENCE_GENERATION_MODEL,
    );
  });

  it('uses gpt-4o by default for final structured variants', () => {
    expect(referenceFinalGenerationModel({})).toBe(
      DEFAULT_REFERENCE_FINAL_GENERATION_MODEL,
    );
  });

  it('allows an explicit final variant model override', () => {
    expect(
      referenceFinalGenerationModel({
        OPENAI_REFERENCE_FINAL_MODEL: 'gpt-4o-mini',
      }),
    ).toBe('gpt-4o-mini');
  });
});
