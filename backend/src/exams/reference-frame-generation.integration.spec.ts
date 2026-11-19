import { Difficulty } from '../entities/exam-record.entity';
import { classifyReferenceArchetype } from './reference-archetype';
import {
  ExamRegeneratorService,
  type ReferenceGenerationClient,
  type ReferenceGenerationCompletion,
  type ReferenceGenerationRequestOptions,
  type ReferenceVariantGenerationResult,
} from './exam-regenerator.service';
import {
  planner,
  plannerClient,
  validFrameJson,
  validPayloadJson,
  validRequest,
} from './reference-frame-planner.fixtures';
import {
  CANONICAL_TPL_BY_INFORMATION_SHAPE,
  selectReferenceTpl,
} from './reference-tpl-selector';
import type { ConceptPayload, ReferenceFrame } from './reference-frame.types';

const source = {
  sourceId: 'success:1:unit-1.pdf:1',
  sourceHash: 'fnv1a:1234',
} as const;

type ReferenceGenerationChatRequest = Parameters<
  ReferenceGenerationClient['chat']['completions']['create']
>[0];

function comparisonFrameJson(): string {
  return validFrameJson({
    response: {
      mode: 'truth_combination',
      choiceEncoding: 'truth_combination',
      choiceCount: 5,
      viewItemCount: 2,
      choiceTopology: 'combo_sets',
      combinationPlan: {
        expectedAnswerCount: 2,
        optionCount: 5,
        topology: 'combo_sets',
      },
    },
    materialDensity: {
      targetLength: 180,
      paragraphCount: 2,
      namedEntities: 2,
      numericFacts: 2,
      conditionCount: 2,
    },
    shell: {
      kind: 'plain',
      requiresViewBlock: true,
      requiresChoiceCombination: true,
      requiresStructuredSource: false,
    },
  });
}

function comparisonPayloadJson(): string {
  return validPayloadJson({
    eligibleUnits: [2],
    targetConceptIds: ['concept_career_planning'],
    supportingConceptIds: [],
    distractorAxes: ['scope_reversal'],
    answerPlan: {
      responseMode: 'truth_combination',
      choiceEncoding: 'truth_combination',
      expectedAnswerCount: 2,
      options: [
        { id: 'option_1', verdict: true, atomIds: ['atom_1'] },
        { id: 'option_2', verdict: false, atomIds: ['atom_2'] },
      ],
    },
    requiredInformationShape: 'comparison',
  });
}

function matrixStimulusData(): Record<string, unknown> {
  return {
    headers: [
      { id: 'condition', label: '조건' },
      { id: 'result', label: '결과' },
    ],
    rows: [
      { id: 'plan-a', cells: ['목표 설정', '직무 탐색'] },
      { id: 'plan-b', cells: ['조건 확인', '지원 준비'] },
    ],
    selection_chips: [],
  };
}

function fidelityTrace(frame: ReferenceFrame, payload: ConceptPayload) {
  const { archetype, structureBlueprint } = frame;
  return {
    shell: { materialKind: archetype.materialKind, ...archetype.shell },
    evidenceBlocks: structureBlueprint.evidenceBlocks.map((block, index) => ({
      order: index + 1,
      ...block,
    })),
    conceptRoles: {
      targetConceptIds: payload.targetConceptIds,
      supportingConceptIds: payload.supportingConceptIds,
    },
    distractorTransformations: payload.distractorAxes.map((axis) => ({ axis })),
    informationOrder: structureBlueprint.informationUnits.map((unit) => ({
      unitId: unit.id,
      order: unit.order,
      kind: unit.kind,
      atomIds: unit.atomIds,
    })),
    reasoningPattern: archetype.reasoningPattern,
    reasoningSteps: structureBlueprint.reasoningSteps.map((step) => ({
      stepId: step.id,
      order: step.order,
      operation: step.operation,
      unitIds: step.unitIds,
      dependsOnStepIds: step.dependsOnStepIds,
    })),
    combinationPlan: archetype.combinationPlan,
    setLinkage: archetype.setStructure,
    viewItems: archetype.viewKeys.map((key, index) => ({
      order: index + 1,
      key,
    })),
    optionSubsets: payload.answerPlan.options.map((option) => ({
      optionId: option.id,
      verdict: option.verdict,
      atomIds: option.atomIds,
    })),
  };
}

function generationClients(content: string): Readonly<{
  client: ReferenceGenerationClient;
  finalGenerator: jest.Mock<
    Promise<ReferenceGenerationCompletion>,
    [ReferenceGenerationChatRequest, ReferenceGenerationRequestOptions?]
  >;
  semanticVerifier: jest.Mock<
    Promise<ReferenceGenerationCompletion>,
    [ReferenceGenerationChatRequest, ReferenceGenerationRequestOptions?]
  >;
}> {
  const finalGenerator = jest
    .fn<
      Promise<ReferenceGenerationCompletion>,
      [ReferenceGenerationChatRequest, ReferenceGenerationRequestOptions?]
    >()
    .mockResolvedValue({ choices: [{ message: { content } }] });
  const semanticVerifier = jest
    .fn<
      Promise<ReferenceGenerationCompletion>,
      [ReferenceGenerationChatRequest, ReferenceGenerationRequestOptions?]
    >()
    .mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({
              accepted: true,
              reasonCode: 'SOURCE_RELATIONS_PRESERVED',
            }),
          },
        },
      ],
    });
  const create = jest
    .fn<
      Promise<ReferenceGenerationCompletion>,
      [ReferenceGenerationChatRequest, ReferenceGenerationRequestOptions?]
    >()
    .mockImplementation((request) => {
      const system = request.messages[0]?.content;
      return system?.startsWith('Verify source-faithful variant semantics') ===
        true
        ? semanticVerifier(request)
        : finalGenerator(request);
    });
  return {
    client: { chat: { completions: { create } } },
    finalGenerator,
    semanticVerifier,
  };
}

describe('reference-frame-generation pipeline (planner → TPL → regenerator)', () => {
  it('Given a valid selected reference, When composing planner → TPL selector → regenerator with mocked model outputs, Then produces exactly one structured variant on the canonical TPL', async () => {
    const classification = classifyReferenceArchetype({
      stem: '다음 자료에 대한 설명으로 옳은 것만을 <보기>에서 있는 대로 고른 것은?',
      stimulus: '| A | B |',
      viewItems: ['ㄱ. A', 'ㄴ. B'],
      choices: ['① ㄱ', '② ㄴ', '③ ㄱ, ㄴ', '④ ㄱ', '⑤ ㄴ'],
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
    const analyzer = plannerClient([
      { kind: 'content', content: comparisonFrameJson() },
      { kind: 'content', content: comparisonPayloadJson() },
    ]);
    const plannerResult = await planner(analyzer.client).plan(request);
    expect(plannerResult.kind).toBe('planned');
    if (plannerResult.kind !== 'planned') return;

    const canonicalTemplate =
      CANONICAL_TPL_BY_INFORMATION_SHAPE[
        plannerResult.payload.requiredInformationShape
      ];
    const tplResult = selectReferenceTpl(
      plannerResult.payload,
      canonicalTemplate,
      matrixStimulusData(),
      plannerResult.frame.archetype,
    );
    expect(tplResult).toEqual({
      kind: 'selected',
      template: 'TPL_COMPARATIVE_MATRIX',
    });

    const regenerator = new ExamRegeneratorService();
    const modelOutput = {
      templateType: 'TPL_COMPARATIVE_MATRIX',
      questionStem: '다음 자료에 대한 설명으로 옳은 것은?',
      stimulusData: matrixStimulusData(),
      comboBlock: {
        title: '<보기>',
        items: [
          { key: 'ㄱ', text: '목표와 조건을 함께 검토하였다.' },
          { key: 'ㄴ', text: '조건을 무시하고 지원하였다.' },
        ],
      },
      choices: [
        '① ㄱ',
        '② ㄴ',
        '③ ㄱ, ㄴ',
        '④ ㄱ, ㄴ 모두 아님',
        '⑤ 해당 없음',
      ],
      correctAnswer: 1,
      explanation: 'Payload claim verdicts determine the combination.',
      fidelityTrace: fidelityTrace(plannerResult.frame, plannerResult.payload),
      sourceEvidence: {
        sourceHash: plannerResult.frame.source.sourceHash,
        targetConceptIds: plannerResult.payload.targetConceptIds,
      },
    };
    const generation = generationClients(
      JSON.stringify({ questions: [modelOutput] }),
    );
    const results: ReferenceVariantGenerationResult[] = [];

    await regenerator.regenerateReferenceBatch(
      generation.client,
      [
        {
          reference: {
            source,
            stem: 'Original reference stem',
            stimulus: 'ORIGINAL_UNIQUE_TOKEN must never leak into the variant.',
            viewItems: ['ㄱ. Original condition', 'ㄴ. Original consequence'],
            choices: [
              '① ㄱ',
              '② ㄴ',
              '③ ㄱ, ㄴ',
              '④ ㄱ, ㄴ 모두 아님',
              '⑤ 추가',
            ],
          },
          frame: plannerResult.frame,
          payload: plannerResult.payload,
          catalogConcepts: validRequest().catalogConcepts,
          selectedTemplate: 'TPL_COMPARATIVE_MATRIX',
        },
      ],
      results,
      Difficulty.MIDDLE,
    );

    expect(results).toHaveLength(1);
    expect(results[0]?.metadata.recommended_template).toBe(
      'TPL_COMPARATIVE_MATRIX',
    );
    expect(results[0]?.metadata.item_type).toBe('reference_variant');
    expect(results[0]?.dna_contract).toBeNull();
    expect(results[0]?.validationReceipt).toEqual({
      deterministic: 'passed',
      copyPolicy: 'passed',
      semanticVerifier: {
        model: expect.any(String),
        verdict: 'accepted',
        reasonCode: 'SOURCE_RELATIONS_PRESERVED',
      },
      retryCount: 0,
    });
    expect(results[0]?.validationReceipt).not.toHaveProperty('referenceSource');
    expect(results[0]?.validationReceipt).not.toHaveProperty('candidate');
    expect(analyzer.create).toHaveBeenCalledTimes(2);
    expect(generation.finalGenerator).toHaveBeenCalledTimes(1);
    expect(generation.semanticVerifier).toHaveBeenCalledTimes(1);

    const finalPrompt: {
      variants?: readonly Readonly<Record<string, unknown>>[];
    } = JSON.parse(
      String(generation.finalGenerator.mock.calls[0]?.[0].messages[1]?.content),
    );
    const finalVariant = finalPrompt.variants?.[0];
    expect(finalVariant).toEqual(
      expect.objectContaining({
        frame: expect.objectContaining({
          archetype: plannerResult.frame.archetype,
        }),
      }),
    );
    expect(finalVariant).toEqual(
      expect.objectContaining({
        referenceSource: expect.objectContaining({
          stimulus: 'ORIGINAL_UNIQUE_TOKEN must never leak into the variant.',
        }),
        fidelityContract: expect.objectContaining({ version: 1 }),
      }),
    );
  });

  it('Given a stale reference source, When composing the pipeline, Then the planner rejects before the regenerator is invoked', async () => {
    const plannerMock = plannerClient([]);
    const stale = validRequest({
      reference: {
        source: { sourceId: 'stale', sourceHash: 'fnv1a:stale' },
        unitNumber: 1,
        questionNumber: 1,
        stem: 'Stale stem',
        stimulus: 'Stale stimulus',
        choices: ['one', 'two', 'three', 'four', 'five'],
        targetConcepts: ['Career values'],
      },
    });

    const plannerResult = await planner(plannerMock.client).plan(stale);

    expect(plannerResult).toEqual(
      expect.objectContaining({ kind: 'rejected' }),
    );
    expect(plannerMock.create).not.toHaveBeenCalled();
  });
});
