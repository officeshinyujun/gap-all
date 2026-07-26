import { classifyReferenceArchetype } from './reference-archetype';
import {
  validFrameJson,
  validPayloadJson,
} from './reference-frame-planner.fixtures';
import { ReferenceJobDeadline } from './reference-job-deadline';
import { ReferenceFramePlannerService } from './reference-frame-planner.service';

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
    target: {
      primaryConcept: 'Career values',
      concepts: ['Career values'],
    },
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

  it('Given a condition relation with reversed endpoints, When planning, Then canonicalizes it without another provider call', async () => {
    const frame = JSON.parse(validFrameJson()) as Record<string, unknown>;
    const structureBlueprint = frame.structureBlueprint as Record<
      string,
      unknown
    >;
    structureBlueprint.relations = [
      {
        kind: 'condition_of',
        fromUnitId: 'unit_3',
        toUnitId: 'unit_2',
      },
    ];
    const given = plannerClient([JSON.stringify(frame), validPayloadJson()]);
    const service = new ReferenceFramePlannerService({
      client: given.client,
      maxAttempts: 2,
      model: 'test-model',
      retryDelayMs: 0,
      timeoutMs: 1000,
    });

    const when = await service.plan(validRequest());

    expect(when).toMatchObject({
      kind: 'planned',
      frame: {
        structureBlueprint: {
          relations: [
            {
              kind: 'condition_of',
              fromUnitId: 'unit_2',
              toUnitId: 'unit_3',
            },
          ],
        },
      },
    });
    expect(given.create).toHaveBeenCalledTimes(2);
  });

  it('Given a frame retry would consume the later payload reserve, When the first frame response is malformed, Then suppresses the retry before another planner provider call', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
    try {
      const given = plannerClient(['{', validFrameJson(), validPayloadJson()]);
      given.create.mockImplementationOnce(() => {
        jest.setSystemTime(5);
        return Promise.resolve({
          choices: [{ message: { content: '{' } }],
        });
      });
      const service = new ReferenceFramePlannerService({
        client: given.client,
        maxAttempts: 2,
        model: 'test-model',
        retryDelayMs: 0,
        timeoutMs: 1000,
        deadline: new ReferenceJobDeadline({
          deadlineAtMs: 70,
          minimumUsefulBudgets: {
            planner: 10,
            final_generator: 20,
            semantic_verifier: 30,
          },
        }),
      });

      await expect(service.plan(validRequest())).rejects.toMatchObject({
        name: 'ReferenceJobDeadlineAdmissionError',
        stage: 'planner',
        requiredReserveMs: 70,
        remainingMs: 65,
      });
      expect(given.create).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
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
        task: 'Plan concepts and evidence while preserving the source target concepts, decision rule, reasoning procedure, and response topology.',
        requiredArchetype: validRequest().archetype,
        referenceConceptsToPreserve: ['Career values'],
        referenceDistractorAxesToPreserve: ['condition_omission'],
      }),
    );
    expect(payloadPrompt).not.toHaveProperty('reference');
    expect(payloadPrompt).not.toHaveProperty('forbiddenReferenceConcepts');
    expect(payloadPrompt).not.toHaveProperty(
      'forbiddenReferenceDistractorAxes',
    );
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

  it('Given a source-object echo, When planner recovery creates a frame, Then every choice receives a complete role mapping', async () => {
    const request = validRequest();
    const echoedReference = JSON.stringify({
      source: request.reference.source,
      choices: request.reference.choices,
      questionNumber: request.reference.questionNumber,
      stem: request.reference.stem,
      stimulus: request.reference.stimulus,
      targetConcepts: request.reference.targetConcepts,
      unitNumber: request.reference.unitNumber,
    });
    const given = plannerClient([echoedReference]);
    const service = new ReferenceFramePlannerService({
      client: given.client,
      model: 'test-model',
      maxAttempts: 1,
      retryDelayMs: 0,
      timeoutMs: 1000,
    });

    const when = await service.planFrame(request);

    expect(when).toEqual(
      expect.objectContaining({
        kind: 'planned',
        frame: expect.objectContaining({
          structureBlueprint: expect.objectContaining({
            itemRoles: expect.arrayContaining([
              expect.objectContaining({
                itemKind: 'choice',
                itemIndex: 5,
                unitIds: ['unit_1'],
                reasoningStepIds: ['step_1'],
              }),
            ]),
          }),
        }),
      }),
    );
  });
});
