type LegacyReferenceGenerationOutcome = Readonly<{
  sourceArchetype: 'resolved_truth_combination' | 'single_selection';
  generatedResponseMode: 'truth_combination' | 'single_selection';
  targetConcepts: readonly string[];
  sourceViewCount: number;
  generatedClaimCount: number;
}>;

const legacyReferenceGenerationOutcomes: readonly LegacyReferenceGenerationOutcome[] =
  [
    {
      sourceArchetype: 'resolved_truth_combination',
      generatedResponseMode: 'single_selection',
      targetConcepts: ['target-concept-1'],
      sourceViewCount: 3,
      generatedClaimCount: 2,
    },
    {
      sourceArchetype: 'resolved_truth_combination',
      generatedResponseMode: 'single_selection',
      targetConcepts: ['target-concept-1'],
      sourceViewCount: 3,
      generatedClaimCount: 3,
    },
    {
      sourceArchetype: 'resolved_truth_combination',
      generatedResponseMode: 'single_selection',
      targetConcepts: ['target-concept-1'],
      sourceViewCount: 2,
      generatedClaimCount: 2,
    },
    {
      sourceArchetype: 'single_selection',
      generatedResponseMode: 'single_selection',
      targetConcepts: ['target-concept-1'],
      sourceViewCount: 0,
      generatedClaimCount: 0,
    },
    {
      sourceArchetype: 'single_selection',
      generatedResponseMode: 'single_selection',
      targetConcepts: ['target-concept-1'],
      sourceViewCount: 0,
      generatedClaimCount: 0,
    },
    {
      sourceArchetype: 'single_selection',
      generatedResponseMode: 'single_selection',
      targetConcepts: ['target-concept-1'],
      sourceViewCount: 0,
      generatedClaimCount: 0,
    },
    {
      sourceArchetype: 'single_selection',
      generatedResponseMode: 'single_selection',
      targetConcepts: ['target-concept-1'],
      sourceViewCount: 0,
      generatedClaimCount: 0,
    },
    {
      sourceArchetype: 'single_selection',
      generatedResponseMode: 'single_selection',
      targetConcepts: ['target-concept-1'],
      sourceViewCount: 0,
      generatedClaimCount: 0,
    },
    {
      sourceArchetype: 'single_selection',
      generatedResponseMode: 'single_selection',
      targetConcepts: ['target-concept-1'],
      sourceViewCount: 0,
      generatedClaimCount: 0,
    },
    {
      sourceArchetype: 'single_selection',
      generatedResponseMode: 'single_selection',
      targetConcepts: ['target-concept-1'],
      sourceViewCount: 0,
      generatedClaimCount: 0,
    },
  ];

function isLegacyReferenceFidelityFailure(
  outcomes: readonly LegacyReferenceGenerationOutcome[],
): boolean {
  const incorrectlySingleSelection = outcomes.filter(
    (outcome) =>
      outcome.sourceArchetype === 'resolved_truth_combination' &&
      outcome.generatedResponseMode === 'single_selection',
  );
  const collapsedTargetConcepts = new Set(
    outcomes.flatMap((outcome) => outcome.targetConcepts),
  );
  const hasTruncatedThreeViewClaims = outcomes.some(
    (outcome) =>
      outcome.sourceViewCount === 3 && outcome.generatedClaimCount < 3,
  );

  return (
    outcomes.length === 10 &&
    incorrectlySingleSelection.length === 3 &&
    collapsedTargetConcepts.size === 1 &&
    outcomes.every((outcome) => outcome.targetConcepts.length === 1) &&
    hasTruncatedThreeViewClaims
  );
}

describe('legacy reference generation fidelity', () => {
  it('recognizes the observed collapsed legacy exam as a fidelity failure', () => {
    const incorrectlySingleSelection = legacyReferenceGenerationOutcomes.filter(
      (outcome) =>
        outcome.sourceArchetype === 'resolved_truth_combination' &&
        outcome.generatedResponseMode === 'single_selection',
    );
    const targetConcepts = new Set(
      legacyReferenceGenerationOutcomes.flatMap(
        (outcome) => outcome.targetConcepts,
      ),
    );
    const hasTruncatedThreeViewClaims = legacyReferenceGenerationOutcomes.some(
      (outcome) =>
        outcome.sourceViewCount === 3 && outcome.generatedClaimCount < 3,
    );

    expect(legacyReferenceGenerationOutcomes).toHaveLength(10);
    expect(incorrectlySingleSelection).toHaveLength(3);
    expect(targetConcepts.size).toBe(1);
    expect(
      legacyReferenceGenerationOutcomes.every(
        (outcome) => outcome.targetConcepts.length === 1,
      ),
    ).toBe(true);
    expect(hasTruncatedThreeViewClaims).toBe(true);
    expect(
      isLegacyReferenceFidelityFailure(legacyReferenceGenerationOutcomes),
    ).toBe(true);
  });
});
