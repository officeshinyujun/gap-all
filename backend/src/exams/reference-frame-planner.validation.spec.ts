import { classifyReferenceArchetype } from './reference-archetype';
import {
  planner,
  plannerClient,
  validFrameJson,
  validPayloadJson,
  validRequest,
} from './reference-frame-planner.fixtures';
import { validateReferenceFrameJson } from './reference-frame.types';

const choiceFiveRole =
  '{"itemKind":"choice","itemIndex":5,"role":"irrelevant","unitIds":["unit_1"],"reasoningStepIds":["step_1"]}';

function incompleteRoleFrameJson(): string {
  return validFrameJson().replaceAll(`,${choiceFiveRole}`, '');
}

describe('ReferenceFramePlannerService payload guards', () => {
  it('Given a three-key combination archetype, When validating its frame, Then accepts the trusted structural combination count', () => {
    const classification = classifyReferenceArchetype({
      stem: '다음 자료에 대한 설명으로 옳은 것만을 <보기>에서 있는 대로 고른 것은?',
      stimulus: '| A | B |',
      viewItems: ['ㄱ. A', 'ㄴ. B', 'ㄷ. C'],
      choices: ['① ㄱ', '② ㄴ', '③ ㄱ, ㄴ', '④ ㄴ, ㄷ', '⑤ ㄱ, ㄴ, ㄷ'],
    });
    expect(classification.kind).toBe('classified');
    if (classification.kind !== 'classified') return;

    const when = validateReferenceFrameJson(
      validFrameJson({
        response: {
          mode: 'truth_combination',
          choiceEncoding: 'truth_combination',
          choiceCount: 5,
          viewItemCount: 3,
          choiceTopology: 'combo_sets',
          combinationPlan: {
            expectedAnswerCount: 3,
            optionCount: 5,
            topology: 'combo_sets',
          },
        },
        shell: {
          kind: 'plain',
          requiresViewBlock: true,
          requiresChoiceCombination: true,
          requiresStructuredSource: false,
        },
      }),
      classification.value,
    );

    expect(when.ok).toBe(true);
    if (when.ok) {
      expect(when.value.response.combinationPlan.expectedAnswerCount).toBe(3);
    }
  });

  it('Given a combination count different from the selected archetype, When validating its frame, Then rejects the response contract path', () => {
    const classification = classifyReferenceArchetype({
      stem: '다음 자료에 대한 설명으로 옳은 것만을 <보기>에서 있는 대로 고른 것은?',
      stimulus: '| A | B |',
      viewItems: ['ㄱ. A', 'ㄴ. B', 'ㄷ. C'],
      choices: ['① ㄱ', '② ㄴ', '③ ㄱ, ㄴ', '④ ㄴ, ㄷ', '⑤ ㄱ, ㄴ, ㄷ'],
    });
    expect(classification.kind).toBe('classified');
    if (classification.kind !== 'classified') return;

    const when = validateReferenceFrameJson(
      validFrameJson({
        response: {
          mode: 'truth_combination',
          choiceEncoding: 'truth_combination',
          choiceCount: 5,
          viewItemCount: 3,
          choiceTopology: 'combo_sets',
          combinationPlan: {
            expectedAnswerCount: 2,
            optionCount: 5,
            topology: 'combo_sets',
          },
        },
        shell: {
          kind: 'plain',
          requiresViewBlock: true,
          requiresChoiceCombination: true,
          requiresStructuredSource: false,
        },
      }),
      classification.value,
    );

    expect(when).toEqual({
      ok: false,
      error: {
        code: 'INVALID_FIELD_VALUE',
        path: 'response',
      },
    });
  });

  it('Given a payload with an eligible unit outside the request, When planning, Then rejects the scope drift', async () => {
    const given = plannerClient([
      { kind: 'content', content: validFrameJson() },
      { kind: 'content', content: validPayloadJson({ eligibleUnits: [3] }) },
    ]);

    const when = await planner(given.client).plan(validRequest());

    expect(when).toEqual({
      kind: 'rejected',
      stage: 'payload',
      reason: 'INVALID_UNIT_RANGE',
      attempts: 1,
      terminal: 'retry_exhausted',
      validationPath: 'conceptPayload.eligibleUnits',
    });
  });

  it('Given an incomplete frame role map, When retrying the frame, Then preserves the exact correction wording and required indexes', async () => {
    const given = plannerClient([
      { kind: 'content', content: incompleteRoleFrameJson() },
      { kind: 'content', content: validFrameJson() },
      { kind: 'content', content: validPayloadJson() },
    ]);

    const when = await planner(given.client, 2).plan(validRequest());

    expect(when).toEqual(expect.objectContaining({ kind: 'planned' }));
    expect(given.create).toHaveBeenCalledTimes(3);
    const retryPrompt = given.create.mock.calls[1]?.[0].messages[1]?.content;
    expect(retryPrompt).toContain(
      'previousValidationFailure":"UNREFERENCED_BLUEPRINT_ROLE',
    );
    expect(retryPrompt).toContain(
      'Discard the previous candidate. Rebuild structureBlueprint with one choice itemRoles entry and one matching evidenceBlocks entry for every itemIndex from 1 through 5. Each entry must reference at least one declared information unit and reasoning step.',
    );
  });

  it('Given an incomplete frame role map on every attempt, When planning, Then returns the typed exhausted planner rejection without echo recovery', async () => {
    const given = plannerClient([
      { kind: 'content', content: incompleteRoleFrameJson() },
      { kind: 'content', content: incompleteRoleFrameJson() },
    ]);

    const when = await planner(given.client, 2).plan(validRequest());

    expect(when).toEqual({
      kind: 'rejected',
      stage: 'frame',
      reason: 'UNREFERENCED_BLUEPRINT_ROLE',
      attempts: 2,
      terminal: 'retry_exhausted',
      validationPath: 'referenceFrame.structureBlueprint.itemRoles',
    });
    expect(given.create).toHaveBeenCalledTimes(2);
  });

  it('Given a payload with an incompatible valid answer encoding, When planning, Then rejects the response-structure drift', async () => {
    const given = plannerClient([
      { kind: 'content', content: validFrameJson() },
      {
        kind: 'content',
        content: validPayloadJson({
          requiredInformationShape: 'comparison',
          answerPlan: {
            responseMode: 'label_matching',
            choiceEncoding: 'label_key',
            expectedAnswerCount: 1,
            options: [{ id: 'option_1', verdict: true, atomIds: ['atom_3'] }],
          },
        }),
      },
    ]);

    const when = await planner(given.client).plan(validRequest());

    expect(when).toEqual({
      kind: 'rejected',
      stage: 'payload',
      reason: 'PAYLOAD_ANSWER_ENCODING_MISMATCH',
      attempts: 1,
      terminal: 'retry_exhausted',
    });
  });

  it('Given a payload with a different information shape, When planning, Then rejects the Step 1 archetype drift', async () => {
    const given = plannerClient([
      { kind: 'content', content: validFrameJson() },
      {
        kind: 'content',
        content: validPayloadJson({
          requiredInformationShape: 'role_dialogue',
        }),
      },
    ]);

    const when = await planner(given.client).plan(validRequest());

    expect(when).toEqual(
      expect.objectContaining({
        kind: 'rejected',
        stage: 'payload',
        reason: 'PAYLOAD_ARCHETYPE_MISMATCH',
      }),
    );
  });

  it('Given a combination payload with a changed claim subset, When planning, Then rejects the Step 1 combination plan', async () => {
    const classification = classifyReferenceArchetype({
      stem: '다음 자료에 대한 설명으로 옳은 것만을 <보기>에서 있는 대로 고른 것은?',
      stimulus: '| A | B |',
      viewItems: ['ㄱ. A', 'ㄴ. B', 'ㄷ. C'],
      choices: ['① ㄱ', '② ㄴ', '③ ㄱ, ㄴ', '④ ㄴ, ㄷ', '⑤ ㄱ, ㄴ, ㄷ'],
    });
    expect(classification.kind).toBe('classified');
    if (classification.kind !== 'classified') return;
    const request = validRequest({
      archetype: classification.value,
      reference: {
        ...validRequest().reference,
        archetype: classification.value,
      },
    });
    const given = plannerClient([
      {
        kind: 'content',
        content: validFrameJson({
          response: {
            mode: 'truth_combination',
            choiceEncoding: 'truth_combination',
            choiceCount: 5,
            viewItemCount: 3,
            choiceTopology: 'combo_sets',
            combinationPlan: {
              expectedAnswerCount: 3,
              optionCount: 5,
              topology: 'combo_sets',
            },
          },
          informationShape: 'comparison',
          shell: {
            kind: 'plain',
            requiresViewBlock: true,
            requiresChoiceCombination: true,
            requiresStructuredSource: false,
          },
        }),
      },
      {
        kind: 'content',
        content: validPayloadJson({
          requiredInformationShape: 'comparison',
          answerPlan: {
            responseMode: 'truth_combination',
            choiceEncoding: 'truth_combination',
            expectedAnswerCount: 2,
            options: [
              { id: 'option_1', verdict: true, atomIds: ['atom_1'] },
              { id: 'option_2', verdict: false, atomIds: ['atom_2'] },
            ],
          },
        }),
      },
    ]);

    const when = await planner(given.client).plan(request);

    expect(when).toEqual(
      expect.objectContaining({
        kind: 'rejected',
        stage: 'payload',
        reason: 'PAYLOAD_COMBINATION_PLAN_MISMATCH',
      }),
    );
  });

  it('Given a payload concept outside the selected catalog, When planning, Then rejects the out-of-scope concept', async () => {
    const given = plannerClient([
      { kind: 'content', content: validFrameJson() },
      {
        kind: 'content',
        content: validPayloadJson({
          targetConceptIds: ['concept_out_of_range'],
        }),
      },
    ]);

    const when = await planner(given.client).plan(validRequest());

    expect(when).toEqual(
      expect.objectContaining({
        kind: 'rejected',
        stage: 'payload',
        reason: 'CONCEPT_OUT_OF_SCOPE',
      }),
    );
  });

  it('Given a payload with a catalog-valid concept other than the source target, When planning, Then rejects the source-concept drift', async () => {
    const request = validRequest({
      requiredSourceConceptIds: ['concept_career_planning'],
      catalogConcepts: [
        ...validRequest().catalogConcepts,
        {
          id: 'concept_career_values',
          subject: 'success',
          unit: 1,
          canonicalLabel: 'Career values',
          ruleTags: ['comparison'],
        },
      ],
    });
    const given = plannerClient([
      { kind: 'content', content: validFrameJson() },
      {
        kind: 'content',
        content: validPayloadJson({
          targetConceptIds: ['concept_career_values'],
        }),
      },
    ]);

    const when = await planner(given.client).plan(request);

    expect(when).toEqual(
      expect.objectContaining({
        kind: 'rejected',
        stage: 'payload',
        reason: 'REFERENCE_CONCEPT_REUSE',
      }),
    );
  });

  it('Given a catalog-valid supporting concept absent from the source, When planning, Then rejects the unsupported supporting role', async () => {
    const classification = classifyReferenceArchetype({
      stem: 'Which statement is correct?',
      stimulus: 'A structured incident requires several related concepts.',
      viewItems: [],
      choices: ['① A', '② B', '③ C', '④ D', '⑤ E'],
      targetConcepts: ['Career planning', 'Career values', 'Work ethics'],
    });
    expect(classification.kind).toBe('classified');
    if (classification.kind !== 'classified') return;
    const request = validRequest({
      archetype: classification.value,
      reference: {
        ...validRequest().reference,
        targetConcepts: ['Career planning', 'Career values'],
        archetype: classification.value,
      },
      catalogConcepts: [
        {
          id: 'concept_career_planning',
          subject: 'success',
          unit: 2,
          canonicalLabel: 'Career planning',
          ruleTags: ['comparison'],
        },
        {
          id: 'concept_career_values',
          subject: 'success',
          unit: 1,
          canonicalLabel: 'Career values',
          ruleTags: ['comparison'],
        },
        {
          id: 'concept_work_ethics',
          subject: 'success',
          unit: 1,
          canonicalLabel: 'Work ethics',
          ruleTags: ['comparison'],
        },
      ],
      requiredSourceConceptIds: [
        'concept_career_planning',
        'concept_career_values',
      ],
      requiredSourceTargetConceptId: 'concept_career_planning',
    });
    const given = plannerClient([
      { kind: 'content', content: validFrameJson() },
      {
        kind: 'content',
        content: validPayloadJson({
          targetConceptIds: ['concept_career_planning'],
          supportingConceptIds: ['concept_work_ethics'],
        }),
      },
    ]);

    const when = await planner(given.client).plan(request);

    expect(when).toEqual(
      expect.objectContaining({
        kind: 'rejected',
        stage: 'payload',
        reason: 'REFERENCE_SUPPORTING_CONCEPT_OUT_OF_SCOPE',
      }),
    );
  });

  it('Given a multi-concept archetype with a smaller selected partition, When planning, Then accepts the bounded supporting role partition', async () => {
    const classification = classifyReferenceArchetype({
      stem: 'Which statement is correct?',
      stimulus: 'A structured incident requires several related concepts.',
      viewItems: [],
      choices: ['① A', '② B', '③ C', '④ D', '⑤ E'],
      targetConcepts: ['Concept A', 'Concept B', 'Concept C'],
    });
    expect(classification.kind).toBe('classified');
    if (classification.kind !== 'classified') return;

    const request = validRequest({
      archetype: classification.value,
      reference: {
        ...validRequest().reference,
        targetConcepts: ['Concept A', 'Concept B', 'Concept C'],
        archetype: classification.value,
      },
      catalogConcepts: [
        {
          id: 'concept_career_planning',
          subject: 'success',
          unit: 2,
          canonicalLabel: 'Career planning',
          ruleTags: ['comparison'],
        },
        {
          id: 'concept_career_values',
          subject: 'success',
          unit: 1,
          canonicalLabel: 'Career values',
          ruleTags: ['comparison'],
        },
      ],
    });
    const given = plannerClient([
      { kind: 'content', content: validFrameJson() },
      {
        kind: 'content',
        content: validPayloadJson({
          targetConceptIds: ['concept_career_planning'],
          supportingConceptIds: ['concept_career_values'],
        }),
      },
    ]);

    const when = await planner(given.client).plan(request);

    expect(when).toEqual(expect.objectContaining({ kind: 'planned' }));
  });

  it('Given a multi-concept archetype with no supporting concept, When planning, Then rejects the required supporting role', async () => {
    const classification = classifyReferenceArchetype({
      stem: 'Which statement is correct?',
      stimulus: 'A structured incident requires several related concepts.',
      viewItems: [],
      choices: ['① A', '② B', '③ C', '④ D', '⑤ E'],
      targetConcepts: ['Concept A', 'Concept B', 'Concept C'],
    });
    expect(classification.kind).toBe('classified');
    if (classification.kind !== 'classified') return;

    const request = validRequest({
      archetype: classification.value,
      reference: {
        ...validRequest().reference,
        targetConcepts: ['Concept A', 'Concept B', 'Concept C'],
        archetype: classification.value,
      },
      catalogConcepts: [
        {
          id: 'concept_career_planning',
          subject: 'success',
          unit: 2,
          canonicalLabel: 'Career planning',
          ruleTags: ['comparison'],
        },
      ],
    });
    const given = plannerClient([
      { kind: 'content', content: validFrameJson() },
      { kind: 'content', content: validPayloadJson() },
    ]);

    const when = await planner(given.client).plan(request);

    expect(when).toEqual(
      expect.objectContaining({
        kind: 'rejected',
        stage: 'payload',
        reason: 'PAYLOAD_CONCEPT_ROLE_MISMATCH',
      }),
    );
  });

  it('Given a payload axis outside the selector catalog, When planning, Then rejects the unknown axis', async () => {
    const given = plannerClient([
      { kind: 'content', content: validFrameJson() },
      {
        kind: 'content',
        content: validPayloadJson({ distractorAxes: ['invented_axis'] }),
      },
    ]);

    const when = await planner(given.client).plan(validRequest());

    expect(when).toEqual(
      expect.objectContaining({
        kind: 'rejected',
        stage: 'payload',
        reason: 'DISTRACTOR_AXIS_OUT_OF_CATALOG',
      }),
    );
  });

  it('Given a payload that reuses the reference concept, When planning, Then preserves the concept family', async () => {
    const given = plannerClient([
      { kind: 'content', content: validFrameJson() },
      {
        kind: 'content',
        content: validPayloadJson({
          targetConceptIds: ['concept_career_planning'],
        }),
      },
    ]);

    const when = await planner(given.client).plan(validRequest());

    expect(when).toEqual(expect.objectContaining({ kind: 'planned' }));
  });

  it('Given a payload that reuses the reference concept, When planning, Then does not spend a retry budget', async () => {
    const given = plannerClient([
      { kind: 'content', content: validFrameJson() },
      {
        kind: 'content',
        content: validPayloadJson({
          targetConceptIds: ['concept_career_planning'],
        }),
      },
    ]);

    const when = await planner(given.client, 2).plan(validRequest());

    expect(when).toEqual(expect.objectContaining({ kind: 'planned' }));
    expect(given.create).toHaveBeenCalledTimes(2);
  });

  it('Given a payload that reuses a reference distractor axis, When planning, Then rejects the novelty violation', async () => {
    const given = plannerClient([
      { kind: 'content', content: validFrameJson() },
      {
        kind: 'content',
        content: validPayloadJson({ distractorAxes: ['condition_omission'] }),
      },
    ]);

    const when = await planner(given.client).plan(validRequest());

    expect(when).toEqual(
      expect.objectContaining({
        kind: 'rejected',
        stage: 'payload',
        reason: 'REFERENCE_AXIS_REUSE',
      }),
    );
  });

  it('Given a reference no longer present in the selected state, When planning, Then rejects before calling the model', async () => {
    const given = plannerClient([]);
    const request = validRequest({
      reference: {
        ...validRequest().reference,
        source: {
          sourceId: 'success:2:stale.pdf:1',
          sourceHash: 'fnv1a:stale',
        },
      },
    });

    const when = await planner(given.client).plan(request);

    expect(when).toEqual({
      kind: 'rejected',
      stage: 'preflight',
      reason: 'STALE_REFERENCE',
      attempts: 0,
      terminal: 'preflight',
    });
    expect(given.create).not.toHaveBeenCalled();
  });

  it('Given an unsupported cached response mode, When planning, Then rejects before payload provider generation', async () => {
    const frame = validateReferenceFrameJson(
      validFrameJson({
        response: {
          mode: 'label_matching',
          choiceEncoding: 'label_key',
          choiceCount: 5,
          viewItemCount: 2,
          choiceTopology: 'label_key',
          combinationPlan: {
            expectedAnswerCount: 1,
            optionCount: 5,
            topology: 'label_key',
          },
        },
        shell: {
          kind: 'plain',
          requiresViewBlock: true,
          requiresChoiceCombination: false,
          requiresStructuredSource: false,
        },
      }),
    );
    expect(frame.ok).toBe(true);
    if (!frame.ok) {
      return;
    }
    const given = plannerClient([]);

    const when = await planner(given.client).plan(validRequest(), frame.value);

    expect(when).toEqual({
      kind: 'rejected',
      stage: 'payload',
      reason: 'UNSUPPORTED_RESPONSE_MODE',
      attempts: 0,
      terminal: 'non_retryable',
    });
    expect(given.create).not.toHaveBeenCalled();
  });
});
