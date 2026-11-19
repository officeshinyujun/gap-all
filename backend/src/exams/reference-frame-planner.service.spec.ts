import { classifyReferenceArchetype } from './reference-archetype';
import {
  validFrameJson,
  validPayloadJson,
} from './reference-frame-planner.fixtures';
import { ReferenceFramePlannerService } from './reference-frame-planner.service';

type PlannerResponse = Readonly<{ content: string | null }>;

function validRequest() {
  const reference = {
    source: { sourceId: 'success:1:unit-1.pdf:1', sourceHash: 'fnv1a:1234' },
    unitNumber: 1,
    questionNumber: 1,
    stem: 'Which career-planning statement is correct?',
    stimulus:
      'A student compares career paths before selecting a training plan.',
    choices: [
      '① Career planning is iterative.',
      '② Career planning is fixed.',
      '③ Career planning excludes training.',
      '④ Career planning has no values.',
      '⑤ Career planning is random.',
    ],
    targetConcepts: ['Career values'],
    viewItems: [],
  } as const;
  const archetype = classifyReferenceArchetype({
    stem: reference.stem,
    stimulus: reference.stimulus,
    viewItems: reference.viewItems,
    choices: reference.choices,
  });
  if (archetype.kind !== 'classified') {
    throw new Error('Unexpected archetype.');
  }

  return {
    subject: 'success',
    unitRange: { start: 1, end: 2 },
    selection: {
      kind: 'selected',
      concepts: [{ concept: 'Career values', unitNumbers: [1] }],
      distractorAxisCatalog: ['condition_omission', 'scope_reversal'],
      distractorAxes: ['condition_omission'],
      references: [reference],
    },
    reference: { ...reference, archetype: archetype.value },
    archetype: archetype.value,
    referenceDistractorAxes: ['condition_omission'],
    catalogConcepts: [
      {
        id: 'concept_career_planning',
        subject: 'success',
        unit: 2,
        canonicalLabel: 'Career planning',
        ruleTags: ['comparison'],
      },
    ],
  } as const;
}

function plannerClient(contents: readonly string[]) {
  const queue = [...contents];
  const create = jest.fn().mockImplementation(() => {
    const content = queue.shift();
    return Promise.resolve({
      choices: [{ message: { content: content ?? null } }],
    });
  });
  return {
    client: { chat: { completions: { create } } },
    create,
  };
}

describe('ReferenceFramePlannerService model boundary', () => {
  it('Given strict valid frame and payload JSON, When planning a selected reference, Then returns typed objects', async () => {
    const frameJson = validFrameJson();
    expect(JSON.parse(frameJson)).not.toHaveProperty('archetype');
    const given = plannerClient([frameJson, validPayloadJson()]);
    const service = new ReferenceFramePlannerService({
      client: given.client,
      maxAttempts: 2,
      model: 'test-model',
      retryDelayMs: 0,
      timeoutMs: 1000,
    });

    const when = await service.plan(validRequest());

    const framePrompt = JSON.parse(
      String(given.create.mock.calls[0]?.[0].messages[1]?.content),
    );
    expect(framePrompt).toEqual(
      expect.objectContaining({ requiredArchetype: validRequest().archetype }),
    );
    expect(when).toEqual(
      expect.objectContaining({
        kind: 'planned',
        frame: expect.objectContaining({
          informationShape: 'case_profile',
          archetype: validRequest().archetype,
        }),
        payload: expect.objectContaining({
          targetConceptIds: ['concept_career_planning'],
          distractorAxes: ['scope_reversal'],
        }),
      }),
    );
  });

  it('Given a selected reference with prose stem and stimulus, When planning payload, Then excludes raw source prose from the payload prompt', async () => {
    const given = plannerClient([validFrameJson(), validPayloadJson()]);
    const service = new ReferenceFramePlannerService({
      client: given.client,
      model: 'test-model',
      maxAttempts: 2,
      retryDelayMs: 0,
      timeoutMs: 1000,
    });

    await service.plan(validRequest());

    const payloadPrompt = JSON.parse(
      String(given.create.mock.calls[1]?.[0].messages[1]?.content),
    );
    expect(payloadPrompt).toEqual(
      expect.objectContaining({
        task:
          'Plan concepts and evidence while preserving the source target concepts, decision rule, reasoning procedure, and response topology.',
        requiredArchetype: validRequest().archetype,
        referenceConceptsToPreserve: ['Career values'],
        referenceDistractorAxesToPreserve: ['condition_omission'],
      }),
    );
    expect(payloadPrompt).not.toHaveProperty('reference');
    expect(payloadPrompt).not.toHaveProperty('forbiddenReferenceConcepts');
    expect(payloadPrompt).not.toHaveProperty('forbiddenReferenceDistractorAxes');
  });

  it('Given model JSON that includes an archetype replacement, When planning a frame, Then rejects the model-owned archetype field', async () => {
    const modelFrame: Record<string, unknown> = JSON.parse(validFrameJson());
    modelFrame.archetype = {
      ...validRequest().archetype,
      fingerprint: 'model-replacement',
    };
    const given = plannerClient([JSON.stringify(modelFrame)]);
    const service = new ReferenceFramePlannerService({
      client: given.client,
      model: 'test-model',
      maxAttempts: 1,
      retryDelayMs: 0,
      timeoutMs: 1000,
    });

    const when = await service.planFrame(validRequest());

    expect(when).toEqual(
      expect.objectContaining({ kind: 'rejected', reason: 'UNKNOWN_FIELD' }),
    );
  });
});
