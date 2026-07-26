import { plannerClient } from './reference-frame-planner.fixtures';
import { ReferenceBlueprintPlannerService } from './reference-blueprint-planner.service';
import type { ReferenceGenerationBatch } from './reference-blueprint.types';

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

describe('ReferenceBlueprintPlannerService', () => {
  it('makes one strict blueprint request for a batch', async () => {
    const fixture = plannerClient([
      {
        kind: 'content',
        content: JSON.stringify({
          slots: [
            {
              slotId: 'slot-1',
              scenarioBrief: 'new',
              claims: [{ verdict: true }],
              answerIndex: 1,
            },
          ],
        }),
      },
    ]);
    const service = new ReferenceBlueprintPlannerService({
      client: fixture.client,
      model: 'mock',
      maxAttempts: 1,
      timeoutMs: 20,
      retryDelayMs: 0,
    });
    expect(await service.plan(batch)).toMatchObject({
      kind: 'planned',
      attempts: 1,
    });
    expect(fixture.create).toHaveBeenCalledTimes(1);
  });
});
