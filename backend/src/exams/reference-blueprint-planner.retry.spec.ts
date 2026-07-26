import { plannerClient } from './reference-frame-planner.fixtures';
import { ReferenceBlueprintPlannerService } from './reference-blueprint-planner.service';
import type { ReferenceGenerationBatch } from './reference-blueprint.types';

class ProviderStatusError extends Error {
  readonly name = 'ProviderStatusError';

  constructor(readonly status: number) {
    super(`Provider returned ${status}.`);
  }
}

const batch: ReferenceGenerationBatch = {
  ordinal: 1,
  template: 'TPL_CASE_DIAGNOSTIC_FRAME',
  slotIds: ['slot-1'],
  slots: [
    {
      slotId: 'slot-1',
      reference: {
        source: { sourceId: 's', sourceHash: 'h' },
        unitNumber: 1,
        questionNumber: 1,
        stem: 's',
        stimulus: 'x',
        choices: ['1', '2', '3', '4', '5'],
        targetConcepts: ['c'],
      },
      targetConcept: { concept: 'c', unitNumbers: [1] },
      supportingConcepts: [],
      distractorAxis: 'scope_reversal',
      responseMode: 'single_selection',
      template: 'TPL_CASE_DIAGNOSTIC_FRAME',
    },
  ],
};

const validBlueprint = JSON.stringify({
  slots: [
    {
      slotId: 'slot-1',
      scenarioBrief: 'new',
      claims: [{ verdict: true }],
      answerIndex: 1,
    },
  ],
});

function serviceForStatus(status: number): Readonly<{
  service: ReferenceBlueprintPlannerService;
  create: jest.Mock;
}> {
  const fixture = plannerClient([
    { kind: 'failure', error: new ProviderStatusError(status) },
    { kind: 'content', content: validBlueprint },
  ]);
  return {
    service: new ReferenceBlueprintPlannerService({
      client: fixture.client,
      model: 'mock',
      maxAttempts: 2,
      timeoutMs: 20,
      retryDelayMs: 0,
    }),
    create: fixture.create,
  };
}

describe('ReferenceBlueprintPlannerService provider retry characterization', () => {
  it.each([408, 429, 503])(
    'Given provider status %i followed by valid output, When planning, Then retries exactly once',
    async (status) => {
      const given = serviceForStatus(status);

      const when = await given.service.plan(batch);

      expect(when).toMatchObject({ kind: 'planned', attempts: 2 });
      expect(given.create).toHaveBeenCalledTimes(2);
    },
  );

  it('Given provider status 400 followed by valid output, When planning, Then does not retry', async () => {
    const given = serviceForStatus(400);

    const when = await given.service.plan(batch);

    expect(when).toEqual({
      kind: 'rejected',
      reason: 'MODEL_STRUCTURED_OUTPUT_UNSUPPORTED',
      attempts: 1,
    });
    expect(given.create).toHaveBeenCalledTimes(1);
  });
});
