import {
  assertAiBlueprintGenerationEnabled,
  assertAiQuestionFamilyEnabled,
  isAiBlueprintGenerationEnabled,
  isAiQuestionFamilyEnabled,
  isAiSubjectEnabled,
} from './ai-generation-feature';

describe('AI blueprint generation feature flag', () => {
  it.each(['1', 'true', 'TRUE', 'yes', 'on'])(
    'accepts enabled value %s',
    (value) => {
      expect(
        isAiBlueprintGenerationEnabled({
          ENABLE_AI_BLUEPRINT_GENERATION: value,
        }),
      ).toBe(true);
    },
  );

  it('fails closed for missing and unknown values', () => {
    expect(isAiBlueprintGenerationEnabled({})).toBe(false);
    expect(
      isAiBlueprintGenerationEnabled({
        ENABLE_AI_BLUEPRINT_GENERATION: 'enabled-ish',
      }),
    ).toBe(false);
  });

  it('throws a stable public error while disabled', () => {
    let thrown: unknown;
    try {
      assertAiBlueprintGenerationEnabled({});
    } catch (error: unknown) {
      thrown = error;
    }

    expect(thrown).toMatchObject({
      response: {
        code: 'AI_FEATURE_DISABLED',
      },
    });
  });

  it('does not throw when explicitly enabled', () => {
    expect(() =>
      assertAiBlueprintGenerationEnabled({
        ENABLE_AI_BLUEPRINT_GENERATION: 'true',
      }),
    ).not.toThrow();
  });

  it('defaults rollout to case only and supports per-family kill switches', () => {
    const env = { ENABLE_AI_BLUEPRINT_GENERATION: 'true' };
    expect(isAiQuestionFamilyEnabled('case', env)).toBe(true);
    expect(isAiQuestionFamilyEnabled('concept', env)).toBe(false);
    expect(() => assertAiQuestionFamilyEnabled('concept', env)).toThrow();
    expect(
      isAiQuestionFamilyEnabled('concept', {
        ...env,
        ENABLE_AI_BLUEPRINT_CONCEPT: 'true',
      }),
    ).toBe(true);
  });

  it('supports an explicit subject rollout allow-list', () => {
    expect(
      isAiSubjectEnabled('success', {
        ENABLE_AI_BLUEPRINT_SUBJECTS: 'success,industry',
      }),
    ).toBe(true);
    expect(
      isAiSubjectEnabled('other', {
        ENABLE_AI_BLUEPRINT_SUBJECTS: 'success,industry',
      }),
    ).toBe(false);
  });
});
