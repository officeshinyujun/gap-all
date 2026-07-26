import {
  DEFAULT_REFERENCE_REPLACEMENT_ALLOWANCE,
  measureReferenceGenerationBudget,
  reconcileReferenceCandidateOutcomes,
  referenceGenerationFailureDisposition,
  resolveReferenceGenerationWorkBudget,
} from './reference-generation-budget';

describe('measureReferenceGenerationBudget', () => {
  it('reports blueprint plus homogeneous batch request count without claiming fixed real-corpus calls', () => {
    expect(
      measureReferenceGenerationBudget(10, 'blueprint', ['batch-1', 'batch-2']),
    ).toEqual({ questionCount: 10, requestCount: 3, requestBytes: 23 });
    expect(
      measureReferenceGenerationBudget(20, 'blueprint', ['1', '2', '3', '4']),
    ).toMatchObject({ requestCount: 5 });
  });

  it('Given no replacement allowance override, When resolving a ten-question work budget, Then uses the deterministic five-candidate replacement allowance for both caps', () => {
    expect(resolveReferenceGenerationWorkBudget(10)).toEqual({
      questionCount: 10,
      replacementAllowance: DEFAULT_REFERENCE_REPLACEMENT_ALLOWANCE,
      candidateScanCap: 15,
      plannerAttemptCap: 15,
    });
  });

  it.each([
    ['negative', -1],
    ['non-integer', 1.5],
    ['non-numeric', 'five'],
  ])(
    'Given a %s replacement allowance override, When resolving a work budget, Then falls back to the default allowance',
    (_description, replacementAllowance) => {
      expect(
        resolveReferenceGenerationWorkBudget(10, { replacementAllowance }),
      ).toEqual({
        questionCount: 10,
        replacementAllowance: DEFAULT_REFERENCE_REPLACEMENT_ALLOWANCE,
        candidateScanCap: 15,
        plannerAttemptCap: 15,
      });
    },
  );

  it('Given a zero replacement allowance override, When resolving a work budget, Then preserves a cap no lower than the requested question count', () => {
    expect(
      resolveReferenceGenerationWorkBudget(10, { replacementAllowance: 0 }),
    ).toEqual({
      questionCount: 10,
      replacementAllowance: 0,
      candidateScanCap: 10,
      plannerAttemptCap: 10,
    });
  });

  it('Given one terminal outcome for every scanned candidate, When reconciling the outcomes, Then produces only mutually exclusive redacted candidate counts', () => {
    const counts = reconcileReferenceCandidateOutcomes([
      { kind: 'accepted' },
      { kind: 'source' },
      { kind: 'planner' },
      { kind: 'fidelity' },
      { kind: 'admission' },
    ]);

    expect(counts).toEqual({
      attempted: 5,
      accepted: 1,
      source: 1,
      planner: 1,
      fidelity: 1,
      admission: 1,
    });
    expect(counts).not.toHaveProperty('deadlineAdmissionExhausted');
  });

  it('Given local and provider failures, When classifying their contract disposition, Then only authentication, transport, and request configuration failures are fatal', () => {
    expect(
      referenceGenerationFailureDisposition('malformed_model_output'),
    ).toBe('candidate_local');
    expect(referenceGenerationFailureDisposition('local_validation')).toBe(
      'candidate_local',
    );
    expect(referenceGenerationFailureDisposition('authentication')).toBe(
      'fatal',
    );
    expect(referenceGenerationFailureDisposition('transport_or_service')).toBe(
      'fatal',
    );
    expect(referenceGenerationFailureDisposition('request_configuration')).toBe(
      'fatal',
    );
  });
});
