import { Difficulty } from '../entities/exam-record.entity';
import type {
  ConceptPayload,
  ReferenceFrame,
  SourceIdentity,
} from './reference-frame.types';
import {
  ExamRegeneratorService,
  type ReferenceGenerationClient,
  type ReferenceGenerationCompletion,
  type ReferenceGenerationRequestOptions,
  type ReferenceVariantGenerationResult,
  type ReferenceVariantGenerationRequest,
} from './exam-regenerator.service';
import { classifyReferenceArchetype } from './reference-archetype';
import { buildReferenceFidelitySpec } from './reference-fidelity-spec';
import { AR_ARCHETYPE_FIXTURES } from './reference-frame-planner.fixtures';
import {
  ReferenceJobDeadline,
  ReferenceJobDeadlineExceededError,
} from './reference-job-deadline';
import { REFERENCE_GENERATION_CONTRACT_BASELINE } from './reference-generation-contract.fixtures';

function source(): SourceIdentity {
  return { sourceId: 'success:1:source-1', sourceHash: 'hash-1' };
}

function frame(): ReferenceFrame {
  const archetype = classifyReferenceArchetype({
    stem: '다음 문서에 대한 설명으로 옳은 것만을 <보기>에서 고른 것은?',
    stimulus: '| 기준 | 결과 |\n| --- | --- |\n| 조건 | 결과 |',
    viewItems: ['ㄱ. 첫째 조건', 'ㄴ. 둘째 조건'],
    choices: ['① ㄱ', '② ㄴ', '③ ㄱ, ㄴ', '④ 없음', '⑤ 모두 옳다'],
  });
  if (archetype.kind !== 'classified') {
    throw new Error('Reference archetype fixture classification failed.');
  }
  return {
    source: source(),
    subject: 'success',
    unitRange: { start: 1, end: 1 },
    archetype: archetype.value,
    stem: {
      style: 'statement evaluation',
      polarity: 'positive',
      languageSignals: ['formal'],
    },
    response: {
      mode: 'truth_combination',
      choiceEncoding: 'truth_combination',
      choiceCount: 5,
      viewItemCount: 2,
      choiceTopology: 'combo_sets',
      combinationPlan: {
        expectedAnswerCount: 2,
        optionCount: 2,
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
    informationShape: 'comparison',
    difficultySignals: ['compare conditions'],
    structureBlueprint: {
      informationUnits: [
        { id: 'unit_1', order: 1, kind: 'condition', atomIds: ['atom_1'] },
        { id: 'unit_2', order: 2, kind: 'conclusion', atomIds: ['atom_2'] },
      ],
      relations: [
        { kind: 'condition_of', fromUnitId: 'unit_1', toUnitId: 'unit_2' },
      ],
      reasoningSteps: [
        {
          id: 'step_1',
          order: 1,
          operation: 'derive_conclusion',
          unitIds: ['unit_1', 'unit_2'],
          dependsOnStepIds: [],
        },
      ],
      itemRoles: [
        {
          itemKind: 'choice',
          itemIndex: 1,
          role: 'correct',
          unitIds: ['unit_2'],
          reasoningStepIds: ['step_1'],
        },
        {
          itemKind: 'choice',
          itemIndex: 2,
          role: 'condition_omission',
          unitIds: ['unit_1'],
          reasoningStepIds: ['step_1'],
        },
      ],
      evidenceBlocks: [
        {
          itemKind: 'choice',
          itemIndex: 1,
          role: 'correct',
          unitIds: ['unit_2'],
          reasoningStepIds: ['step_1'],
        },
        {
          itemKind: 'choice',
          itemIndex: 2,
          role: 'condition_omission',
          unitIds: ['unit_1'],
          reasoningStepIds: ['step_1'],
        },
      ],
    },
    semanticAtoms: [
      {
        id: 'atom_1',
        subjectSlot: 'actor_a',
        predicateKind: 'satisfies_condition',
        operator: 'conditional',
        objectSlot: 'process_a',
        quantityRole: null,
        polarity: true,
      },
      {
        id: 'atom_2',
        subjectSlot: 'actor_a',
        predicateKind: 'produces_outcome',
        operator: 'conditional',
        objectSlot: 'artifact_a',
        quantityRole: null,
        polarity: true,
      },
    ],
    groundingLexicon: {
      entities: [
        { slot: 'actor_a', class: 'person' },
        { slot: 'process_a', class: 'process' },
        { slot: 'artifact_a', class: 'artifact' },
      ],
      quantities: [],
      rules: [
        { id: 'rule_1', conceptId: 'concept_career_planning', polarity: true },
      ],
      bindings: [
        {
          atomId: 'atom_1',
          entitySlots: ['actor_a', 'process_a'],
          quantityIds: [],
          ruleIds: ['rule_1'],
        },
        {
          atomId: 'atom_2',
          entitySlots: ['actor_a', 'artifact_a'],
          quantityIds: [],
          ruleIds: ['rule_1'],
        },
      ],
    },
    shell: archetype.value.shell,
  };
}

function payload(overrides: Partial<ConceptPayload> = {}): ConceptPayload {
  return {
    source: source(),
    subject: 'success',
    unitRange: { start: 1, end: 1 },
    eligibleUnits: [1],
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
    noveltyRules: ['Use new names, dates, values, and case facts.'],
    ...overrides,
  };
}

function request(
  overrides: Partial<ReferenceVariantGenerationRequest> = {},
): ReferenceVariantGenerationRequest {
  return {
    reference: {
      source: source(),
      stem: 'Original reference statement',
      stimulus: 'SOURCE_UNIQUE_TOKEN must never appear in the variant.',
      viewItems: ['ㄱ. Original condition', 'ㄴ. Original consequence'],
      choices: ['① ㄱ', '② ㄴ', '③ ㄱ, ㄴ', '④ ㄱ, ㄴ 모두 아님', '⑤ 추가'],
      targetConcepts: ['Career planning'],
    },
    frame: frame(),
    payload: payload(),
    selectedTemplate: 'TPL_COMPARATIVE_MATRIX',
    ...overrides,
    catalogConcepts: overrides.catalogConcepts ?? [
      {
        id: 'concept_career_planning',
        subject: 'success',
        unit: 1,
        canonicalLabel: 'Career planning',
        ruleTags: ['comparison'],
      },
    ],
  };
}

type SourcePromptFixture = Readonly<{
  sourceId: string;
  targetConcept: string;
}>;

const SOURCE_PROMPT_FIXTURES = [
  { sourceId: 'sungjik:15:1', targetConcept: '근로관계법' },
  { sourceId: 'sungjik:15:9', targetConcept: '해고 제한 및 예고' },
  {
    sourceId: 'kongil:15:8',
    targetConcept: '하인리히의 사고 예방 5단계',
  },
] as const satisfies readonly SourcePromptFixture[];

function sourcePromptRequest(
  fixture: SourcePromptFixture,
): ReferenceVariantGenerationRequest {
  const fixtureSource = AR_ARCHETYPE_FIXTURES.find(
    ({ projection }) => projection.provenance.sourceId === fixture.sourceId,
  );
  if (fixtureSource === undefined) {
    throw new Error(`Missing source fixture: ${fixture.sourceId}`);
  }
  const sourceReference = {
    source: source(),
    ...fixtureSource.source,
    targetConcepts: [fixture.targetConcept],
  };
  const classified = classifyReferenceArchetype(sourceReference);
  if (classified.kind !== 'classified') {
    throw new Error(`Fixture did not classify: ${fixture.sourceId}`);
  }
  const archetype = classified.value;
  const optionCount =
    archetype.responseMode === 'truth_combination'
      ? archetype.viewItemCount
      : archetype.choiceCount;
  const itemRoles = Array.from({ length: optionCount }, (_, index) => ({
    itemKind: 'choice' as const,
    itemIndex: index + 1,
    role: index === 0 ? ('correct' as const) : ('irrelevant' as const),
    unitIds: [index === 0 ? 'unit_2' : 'unit_1'],
    reasoningStepIds: ['step_1'],
  }));
  const fixtureFrame: ReferenceFrame = {
    ...frame(),
    archetype,
    response: {
      mode: archetype.responseMode,
      choiceEncoding: archetype.choiceEncoding,
      choiceCount: archetype.choiceCount,
      viewItemCount: archetype.viewItemCount,
      choiceTopology: archetype.choiceTopology,
      combinationPlan: archetype.combinationPlan,
    },
    shell: archetype.shell,
    informationShape: archetype.informationShape,
    structureBlueprint: {
      ...frame().structureBlueprint,
      itemRoles,
      evidenceBlocks: itemRoles,
    },
  };
  const fixturePayload = payload({
    answerPlan: {
      responseMode: archetype.responseMode,
      choiceEncoding: archetype.choiceEncoding,
      expectedAnswerCount: optionCount,
      options: Array.from({ length: optionCount }, (_, index) => ({
        id: `option_${index + 1}`,
        verdict: index === 0,
        atomIds: [index === 0 ? 'atom_2' : 'atom_1'],
      })),
    },
    requiredInformationShape: archetype.informationShape,
  });
  const fidelitySpec = buildReferenceFidelitySpec(sourceReference, archetype, {
    structureBlueprint: fixtureFrame.structureBlueprint,
    answerPlan: fixturePayload.answerPlan,
    targetConceptIds: fixturePayload.targetConceptIds,
    allowedTerminology: [fixture.targetConcept],
  });
  return {
    reference: sourceReference,
    frame: fixtureFrame,
    payload: fixturePayload,
    catalogConcepts: request().catalogConcepts,
    selectedTemplate: archetype.sourceTemplate,
    fidelitySpec,
  };
}

function pairedRequests(): readonly [
  ReferenceVariantGenerationRequest,
  ReferenceVariantGenerationRequest,
] {
  const secondSource: SourceIdentity = {
    sourceId: 'success:1:source-2',
    sourceHash: 'hash-2',
  };
  return [
    request(),
    request({
      reference: { ...request().reference, source: secondSource },
      frame: { ...frame(), source: secondSource },
      payload: payload({ source: secondSource }),
    }),
  ];
}

function fidelityTrace() {
  return {
    shell: {
      materialKind: 'table',
      kind: 'table',
      requiresViewBlock: true,
      requiresChoiceCombination: true,
      requiresStructuredSource: true,
    },
    evidenceBlocks: [
      {
        order: 1,
        itemKind: 'choice',
        itemIndex: 1,
        role: 'correct',
        unitIds: ['unit_2'],
        reasoningStepIds: ['step_1'],
        outputSurface: 'choices',
      },
      {
        order: 2,
        itemKind: 'choice',
        itemIndex: 2,
        role: 'condition_omission',
        unitIds: ['unit_1'],
        reasoningStepIds: ['step_1'],
        outputSurface: 'choices',
      },
    ],
    conceptRoles: {
      targetConceptIds: ['concept_career_planning'],
      supportingConceptIds: [],
    },
    distractorTransformations: [
      { axis: 'scope_reversal', outputSurface: 'choices' },
    ],
    informationOrder: [
      {
        unitId: 'unit_1',
        order: 1,
        kind: 'condition',
        atomIds: ['atom_1'],
        outputSurface: 'stimulusData',
      },
      {
        unitId: 'unit_2',
        order: 2,
        kind: 'conclusion',
        atomIds: ['atom_2'],
        outputSurface: 'stimulusData',
      },
    ],
    reasoningPattern: 'comparison',
    reasoningSteps: [
      {
        stepId: 'step_1',
        order: 1,
        operation: 'derive_conclusion',
        unitIds: ['unit_1', 'unit_2'],
        dependsOnStepIds: [],
        outputSurface: 'choices',
      },
    ],
    combinationPlan: {
      expectedAnswerCount: 2,
      optionCount: 5,
      topology: 'combo_sets',
      outputSurface: 'choices',
    },
    setLinkage: {
      required: false,
      position: 'standalone',
      viewItemCount: 2,
      outputSurface: 'comboBlock',
    },
    viewItems: [
      { order: 1, key: 'ㄱ', outputSurface: 'comboBlock' },
      { order: 2, key: 'ㄴ', outputSurface: 'comboBlock' },
    ],
    optionSubsets: [
      {
        optionId: 'option_1',
        verdict: true,
        atomIds: ['atom_1'],
        outputSurface: 'choices',
      },
      {
        optionId: 'option_2',
        verdict: false,
        atomIds: ['atom_2'],
        outputSurface: 'choices',
      },
    ],
  };
}

function output(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    templateType: 'TPL_COMPARATIVE_MATRIX',
    questionStem: '다음 자료에 대한 설명으로 옳은 것은?',
    stimulusData: {
      headers: [
        { id: 'condition', label: '조건' },
        { id: 'result', label: '결과' },
      ],
      rows: [
        { id: 'plan-a', cells: ['목표 설정', '직무 탐색'] },
        { id: 'plan-b', cells: ['조건 확인', '지원 준비'] },
      ],
      selection_chips: [],
    },
    comboBlock: {
      title: '<보기>',
      items: [
        { key: 'ㄱ', text: '목표와 조건을 함께 검토하였다.' },
        { key: 'ㄴ', text: '조건을 무시하고 지원하였다.' },
      ],
    },
    choices: ['① ㄱ', '② ㄴ', '③ ㄱ, ㄴ', '④ ㄱ, ㄴ 모두 아님', '⑤ 해당 없음'],
    correctAnswer: 1,
    explanation: 'Payload claim verdicts determine the combination.',
    fidelityTrace: fidelityTrace(),
    sourceEvidence: {
      sourceHash: 'hash-1',
      targetConceptIds: ['concept_career_planning'],
      matrixGroundingTerms: [],
    },
    ...overrides,
  };
}

function legacyOutput(): Record<string, unknown> {
  const question = output();
  return {
    metadata: { recommended_template: question.templateType },
    render_ready: {
      question_stem: question.questionStem,
      stimulus_data: question.stimulusData,
      combo_block: question.comboBlock,
      options_list: question.choices,
    },
    fidelity_trace: question.fidelityTrace,
    source_evidence: question.sourceEvidence,
    correct_answer: question.correctAnswer,
    explanation: { judgment: question.explanation },
  };
}

function clientFor(content: string): Readonly<{
  client: ReferenceGenerationClient;
  create: jest.Mock<
    Promise<ReferenceGenerationCompletion>,
    [unknown, ReferenceGenerationRequestOptions?]
  >;
}> {
  const create = jest
    .fn<
      Promise<ReferenceGenerationCompletion>,
      [unknown, ReferenceGenerationRequestOptions?]
    >()
    .mockImplementation((request) => {
      const system = (request as { messages?: readonly { content: string }[] })
        .messages?.[0]?.content;
      return Promise.resolve({
        choices: [
          {
            message: {
              content:
                system?.startsWith(
                  'Verify source-faithful variant semantics',
                ) === true
                  ? JSON.stringify({
                      accepted: true,
                      reasonCode: 'SOURCE_RELATIONS_PRESERVED',
                    })
                  : content,
            },
          },
        ],
      });
    });
  return { client: { chat: { completions: { create } } }, create };
}

type FidelityTraceFixture = ReturnType<typeof fidelityTrace>;

type FidelityDrift = Readonly<{
  label: string;
  path: string;
  mutate: (trace: FidelityTraceFixture) => void;
}>;

const FIDELITY_DRIFTS = [
  {
    label: 'material kind drift',
    path: 'fidelityTrace.shell.materialKind',
    mutate: (trace) => {
      trace.shell.materialKind = 'SOURCE_UNIQUE_TOKEN';
    },
  },
  {
    label: 'document shell drift',
    path: 'fidelityTrace.shell.requiresStructuredSource',
    mutate: (trace) => {
      trace.shell.requiresStructuredSource = false;
    },
  },
  {
    label: 'evidence block order drift',
    path: 'fidelityTrace.evidenceBlocks[0].order',
    mutate: (trace) => {
      trace.evidenceBlocks = trace.evidenceBlocks.map((block, index) =>
        index === 0 ? { ...block, order: 2 } : block,
      );
    },
  },
  {
    label: 'concept role coverage drift',
    path: 'fidelityTrace.conceptRoles.targetConceptIds.length',
    mutate: (trace) => {
      trace.conceptRoles.targetConceptIds = [];
    },
  },
  {
    label: 'distractor transformation drift',
    path: 'fidelityTrace.distractorTransformations[0].axis',
    mutate: (trace) => {
      trace.distractorTransformations = trace.distractorTransformations.map(
        (transformation) => ({ ...transformation, axis: 'irrelevant' }),
      );
    },
  },
  {
    label: 'view-item topology drift',
    path: 'fidelityTrace.viewItems.length',
    mutate: (trace) => {
      trace.viewItems = trace.viewItems.filter((_, index) => index === 0);
    },
  },
  {
    label: 'combination plan drift',
    path: 'fidelityTrace.combinationPlan.topology',
    mutate: (trace) => {
      trace.combinationPlan.topology = 'single_choice';
    },
  },
  {
    label: 'combination option subset drift',
    path: 'fidelityTrace.optionSubsets[0].atomIds.length',
    mutate: (trace) => {
      trace.optionSubsets = trace.optionSubsets.map((option) => ({
        ...option,
        atomIds: [],
      }));
    },
  },
  {
    label: 'inverted option verdict',
    path: 'fidelityTrace.optionSubsets[0].verdict',
    mutate: (trace) => {
      trace.optionSubsets = trace.optionSubsets.map((option, index) =>
        index === 0 ? { ...option, verdict: false } : option,
      );
    },
  },
  {
    label: 'absent distractor role',
    path: 'fidelityTrace.evidenceBlocks.length',
    mutate: (trace) => {
      trace.evidenceBlocks = trace.evidenceBlocks.filter(
        ({ role }) => role !== 'condition_omission',
      );
    },
  },
  {
    label: 'information order drift',
    path: 'fidelityTrace.informationOrder[0].order',
    mutate: (trace) => {
      trace.informationOrder = trace.informationOrder.map((unit, index) =>
        index === 0 ? { ...unit, order: 2 } : unit,
      );
    },
  },
  {
    label: 'reasoning order drift',
    path: 'fidelityTrace.reasoningSteps[0].order',
    mutate: (trace) => {
      trace.reasoningSteps = trace.reasoningSteps.map((step) => ({
        ...step,
        order: 2,
      }));
    },
  },
  {
    label: 'shared-document linkage drift',
    path: 'fidelityTrace.setLinkage.position',
    mutate: (trace) => {
      trace.setLinkage.position = 'shared_pair';
    },
  },
] satisfies readonly FidelityDrift[];

describe('ExamRegeneratorService reference variant generation', () => {
  it('rejects a renderable A/B cost matrix that is not grounded in a contract source table', async () => {
    const service = new ExamRegeneratorService();
    const base = request();
    const input = request({
      reference: {
        ...base.reference,
        stimulus:
          '| 구분 | 내용 |\n| --- | --- |\n| 기업체명 | ㈜△△식품 |\n| 1일 근로 시간 | 08:30~17:30 |\n| 임금 | 시간당 12,000원 |',
      },
    });
    const incompatible = output({
      stimulusData: {
        headers: [
          { id: 'criteria', label: '비교 항목' },
          { id: 'a', label: 'A안' },
          { id: 'b', label: 'B안' },
        ],
        rows: [
          { id: 'initial', cells: ['초기 비용', '500만 원', '300만 원'] },
          {
            id: 'maintenance',
            cells: ['유지 비용', '연 100만 원', '연 200만 원'],
          },
        ],
        selection_chips: [],
      },
    });
    const model = clientFor(JSON.stringify({ questions: [incompatible] }));
    const result: ReferenceVariantGenerationResult[] = [];

    await service.regenerateReferenceBatch(
      model.client,
      [input],
      result,
      Difficulty.MIDDLE,
    );

    expect(result).toEqual([]);
  });

  it('characterizes final and verifier provider requests without changing the accepted quality contract', async () => {
    const service = new ExamRegeneratorService();
    const input = request();
    const model = clientFor(JSON.stringify({ questions: [output()] }));
    const result: ReferenceVariantGenerationResult[] = [];

    await service.regenerateReferenceBatch(
      model.client,
      [input],
      result,
      Difficulty.MIDDLE,
    );

    const finalRequest = model.create.mock.calls[0]?.[0];
    const verifierRequest = model.create.mock.calls[1]?.[0];
    expect(finalRequest).toMatchObject({
      model: REFERENCE_GENERATION_CONTRACT_BASELINE.final.model,
      temperature: REFERENCE_GENERATION_CONTRACT_BASELINE.final.temperature,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: REFERENCE_GENERATION_CONTRACT_BASELINE.final.schemaName,
          strict: true,
        },
      },
      messages: [
        {
          role: 'system',
          content: expect.stringContaining(
            'structured Korean CSAT reference variants',
          ),
        },
        {
          role: 'user',
          content: expect.stringContaining('"exactCount":1'),
        },
      ],
    });
    expect(verifierRequest).toMatchObject({
      model: REFERENCE_GENERATION_CONTRACT_BASELINE.semanticVerifier.model,
      temperature:
        REFERENCE_GENERATION_CONTRACT_BASELINE.semanticVerifier.temperature,
      response_format: {
        type: REFERENCE_GENERATION_CONTRACT_BASELINE.semanticVerifier
          .responseFormatType,
      },
      messages: [
        {
          role: 'system',
          content:
            REFERENCE_GENERATION_CONTRACT_BASELINE.semanticVerifier
              .systemMessage,
        },
        expect.objectContaining({
          role: 'user',
          content: expect.stringContaining('"fidelityContract"'),
        }),
      ],
    });
    expect(result).toHaveLength(1);
  });

  it('Given a reference execution context, When final generation and semantic verification settle, Then emits their safe milestones in order', async () => {
    const service = new ExamRegeneratorService();
    const model = clientFor(JSON.stringify({ questions: [output()] }));
    const result: ReferenceVariantGenerationResult[] = [];
    const updates: Array<{ stage: string; progress: number }> = [];

    await service.regenerateReferenceBatch(
      model.client,
      [
        request({
          execution: {
            deadline: new ReferenceJobDeadline({
              deadlineAtMs: Date.now() + 10_000,
              minimumUsefulBudgets: {
                planner: 1,
                final_generator: 1,
                semantic_verifier: 1,
              },
            }),
            completed: 0,
            total: 1,
            reportProgress: (update) => {
              updates.push(update);
            },
          },
        }),
      ],
      result,
      Difficulty.MIDDLE,
    );

    expect(updates).toEqual([
      expect.objectContaining({ stage: 'fidelity', progress: 60 }),
      expect.objectContaining({ stage: 'final', progress: 85 }),
    ]);
    expect(result).toHaveLength(1);
  });

  it('Given an expired reference execution deadline, When final generation begins, Then propagates typed expiry without invoking the provider', async () => {
    const service = new ExamRegeneratorService();
    const model = clientFor(JSON.stringify({ questions: [output()] }));
    const result: ReferenceVariantGenerationResult[] = [];

    await expect(
      service.regenerateReferenceBatch(
        model.client,
        [
          request({
            execution: {
              deadline: new ReferenceJobDeadline({ deadlineAtMs: 0 }),
              completed: 0,
              total: 1,
            },
          }),
        ],
        result,
        Difficulty.MIDDLE,
      ),
    ).rejects.toBeInstanceOf(ReferenceJobDeadlineExceededError);

    expect(model.create).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it('Given a settled final milestone, When the semantic-verifier deadline expires, Then emits no later milestone', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
    try {
      const service = new ExamRegeneratorService();
      const model = clientFor('');
      model.create.mockReset();
      model.create
        .mockResolvedValueOnce({
          choices: [
            { message: { content: JSON.stringify({ questions: [output()] }) } },
          ],
        })
        .mockImplementationOnce(
          () => new Promise<ReferenceGenerationCompletion>(() => undefined),
        );
      const result: ReferenceVariantGenerationResult[] = [];
      const updates: Array<{ stage: string }> = [];
      const when = service.regenerateReferenceBatch(
        model.client,
        [
          request({
            execution: {
              deadline: new ReferenceJobDeadline({
                deadlineAtMs: 100,
                minimumUsefulBudgets: {
                  planner: 1,
                  final_generator: 1,
                  semantic_verifier: 1,
                },
              }),
              completed: 0,
              total: 1,
              reportProgress: (update) => {
                updates.push(update);
              },
            },
          }),
        ],
        result,
        Difficulty.MIDDLE,
      );

      for (let microtask = 0; microtask < 8; microtask += 1) {
        await Promise.resolve();
      }
      expect(updates.map(({ stage }) => stage)).toEqual(['fidelity']);

      const deadlineResult = expect(when).rejects.toMatchObject({
        name: 'ReferenceJobDeadlineExceededError',
        stage: 'semantic_verifier',
      });
      await jest.advanceTimersByTimeAsync(100);
      await deadlineResult;
      expect(updates.map(({ stage }) => stage)).toEqual(['fidelity']);
      expect(result).toEqual([]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('uses the archetype-compatible payload-selected TPL', async () => {
    const service = new ExamRegeneratorService();
    const input = request();
    const prompt = service.buildBatchRegenPrompt(
      [input],
      Difficulty.MIDDLE,
      '',
    );
    const model = clientFor(JSON.stringify({ questions: [output()] }));
    const result: ReferenceVariantGenerationResult[] = [];

    await service.regenerateReferenceBatch(
      model.client,
      [input],
      result,
      Difficulty.MIDDLE,
    );

    expect(prompt).toContain('"selectedTemplate":"TPL_COMPARATIVE_MATRIX"');
    expect(prompt).toContain('"informationShape":"comparison"');
    expect(prompt).toContain('"requiredInformationShape":"comparison"');
    expect(prompt).toContain('"choiceEncoding":"truth_combination"');
    expect(prompt).toContain('"targetLength":180');
    expect(prompt).toContain('"unitRange":{"start":1,"end":1}');
    expect(prompt).toContain('"targetConceptIds":["concept_career_planning"]');
    expect(prompt).toContain('"distractorAxes":["scope_reversal"]');
    expect(prompt).toContain(
      '"answerPlan":{"responseMode":"truth_combination"',
    );
    expect(prompt).toContain('"sourceEvidence"');
    expect(model.create.mock.calls[0]?.[0]).toMatchObject({
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'reference_final_variant',
          strict: true,
          schema: {
            type: 'object',
            required: ['questions'],
            additionalProperties: false,
            properties: {
              questions: {
                type: 'array',
                minItems: 1,
                maxItems: 1,
                items: {
                  type: 'object',
                  required: [
                    'templateType',
                    'questionStem',
                    'stimulusData',
                    'comboBlock',
                    'choices',
                    'correctAnswer',
                    'explanation',
                    'fidelityTrace',
                    'sourceEvidence',
                  ],
                  additionalProperties: false,
                  properties: {
                    templateType: {
                      type: 'string',
                      enum: ['TPL_COMPARATIVE_MATRIX'],
                    },
                    choices: {
                      type: 'array',
                      minItems: 5,
                      maxItems: 5,
                    },
                    correctAnswer: {
                      type: 'integer',
                      minimum: 1,
                      maximum: 5,
                    },
                    sourceEvidence: {
                      type: 'object',
                      required: [
                        'sourceHash',
                        'targetConceptIds',
                        'matrixGroundingTerms',
                      ],
                      additionalProperties: false,
                      properties: {
                        sourceHash: { type: 'string', enum: ['hash-1'] },
                      },
                    },
                    comboBlock: {
                      type: 'object',
                      required: ['title', 'items'],
                      additionalProperties: false,
                      properties: {
                        items: {
                          type: 'array',
                          minItems: 2,
                          maxItems: 2,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      messages: expect.arrayContaining([
        expect.objectContaining({
          role: 'system',
          content: expect.stringContaining('JSON object'),
        }),
      ]),
    });
    expect(model.create.mock.calls[0]?.[0]).toMatchObject({
      messages: [
        expect.anything(),
        expect.objectContaining({
          content: expect.stringContaining(
            '"responseMode":"truth_combination"',
          ),
        }),
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.metadata.recommended_template).toBe(
      'TPL_COMPARATIVE_MATRIX',
    );
  });

  for (const drift of FIDELITY_DRIFTS) {
    it(`rejects ${drift.label} with a bounded path-specific correction`, async () => {
      const service = new ExamRegeneratorService();
      const trace = fidelityTrace();
      drift.mutate(trace);
      const model = clientFor(
        JSON.stringify({ questions: [output({ fidelityTrace: trace })] }),
      );
      const result: ReferenceVariantGenerationResult[] = [];

      await service.regenerateReferenceBatch(
        model.client,
        [request()],
        result,
        Difficulty.MIDDLE,
      );

      expect(model.create).toHaveBeenCalledTimes(3);
      expect(result).toEqual([]);
      const retryRequest = model.create.mock.calls[1]?.[0];
      expect(retryRequest).toMatchObject({
        messages: [
          expect.anything(),
          expect.objectContaining({
            content: expect.stringContaining(`path=${drift.path}`),
          }),
        ],
      });
      expect(retryRequest).toMatchObject({
        messages: [
          expect.anything(),
          expect.objectContaining({
            content: expect.stringContaining('expected='),
          }),
        ],
      });
      expect(retryRequest).toMatchObject({
        messages: [
          expect.anything(),
          expect.objectContaining({
            content: expect.stringContaining('actual='),
          }),
        ],
      });
      expect(JSON.stringify(retryRequest)).toContain('SOURCE_UNIQUE_TOKEN');
    });
  }

  it('persists faithful new wording after one archetype fidelity correction', async () => {
    const service = new ExamRegeneratorService();
    const driftedTrace = fidelityTrace();
    driftedTrace.shell.materialKind = 'plain';
    const model = clientFor('');
    model.create.mockReset();
    model.create
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                questions: [output({ fidelityTrace: driftedTrace })],
              }),
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                questions: [
                  output({
                    questionStem:
                      '다음 표의 조건을 함께 고려한 설명으로 옳은 것은?',
                  }),
                ],
              }),
            },
          },
        ],
      })
      .mockResolvedValueOnce({
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
    const result: ReferenceVariantGenerationResult[] = [];

    await service.regenerateReferenceBatch(
      model.client,
      [request()],
      result,
      Difficulty.MIDDLE,
    );

    expect(model.create).toHaveBeenCalledTimes(3);
    expect(model.create.mock.calls[1]?.[0]).toMatchObject({
      messages: [
        expect.anything(),
        expect.objectContaining({
          content: expect.stringContaining(
            'path=fidelityTrace.shell.materialKind',
          ),
        }),
      ],
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.render_ready.question_stem).toBe(
      '다음 표의 조건을 함께 고려한 설명으로 옳은 것은?',
    );
  });

  it('passes the selected source alongside the immutable structural projection', () => {
    const service = new ExamRegeneratorService();
    const input = request({
      reference: {
        source: source(),
        stem: 'source-stem-marker',
        stimulus: 'source-stimulus-marker',
        viewItems: ['source-view-item-marker-1', 'source-view-item-marker-2'],
        choices: [
          'source-choice-marker-1',
          'source-choice-marker-2',
          'source-choice-marker-3',
          'source-choice-marker-4',
          'source-choice-marker-5',
        ],
        targetConcepts: ['Career planning'],
      },
    });

    const prompt = service.buildBatchRegenPrompt(
      [input],
      Difficulty.MIDDLE,
      '',
    );
    const parsed = JSON.parse(prompt);
    const projection = parsed.variants[0]?.archetypeProjection;

    expect(projection).toEqual({
      materialKind: 'table',
      shell: {
        kind: 'table',
        requiresViewBlock: true,
        requiresChoiceCombination: true,
        requiresStructuredSource: true,
      },
      register: {
        materialKind: 'table',
        reasoningPattern: 'comparison',
        choiceTopology: 'combo_sets',
        shell: {
          kind: 'table',
          requiresViewBlock: true,
          requiresChoiceCombination: true,
          requiresStructuredSource: true,
        },
      },
      response: frame().response,
      evidenceBlocks: [
        {
          order: 1,
          itemKind: 'choice',
          itemIndex: 1,
          role: 'correct',
          unitIds: ['unit_2'],
          reasoningStepIds: ['step_1'],
        },
        {
          order: 2,
          itemKind: 'choice',
          itemIndex: 2,
          role: 'condition_omission',
          unitIds: ['unit_1'],
          reasoningStepIds: ['step_1'],
        },
      ],
      conceptRoles: {
        cardinality: { target: 1, supporting: 0 },
        targetConceptIds: ['concept_career_planning'],
        supportingConceptIds: [],
      },
      distractorTransformations: ['scope_reversal'],
      informationOrder: [
        {
          id: 'unit_1',
          order: 1,
          kind: 'condition',
          atomIds: ['atom_1'],
        },
        {
          id: 'unit_2',
          order: 2,
          kind: 'conclusion',
          atomIds: ['atom_2'],
        },
      ],
      reasoningPattern: 'comparison',
      reasoningSteps: [
        {
          id: 'step_1',
          order: 1,
          operation: 'derive_conclusion',
          unitIds: ['unit_1', 'unit_2'],
          dependsOnStepIds: [],
        },
      ],
      combinationPlan: {
        expectedAnswerCount: 2,
        optionCount: 5,
        topology: 'combo_sets',
      },
      setStructure: {
        required: false,
        position: 'standalone',
        viewItemCount: 2,
      },
      viewItems: [
        { order: 1, key: 'ㄱ' },
        { order: 2, key: 'ㄴ' },
      ],
      optionSubsets: [
        { id: 'option_1', verdict: true, atomIds: ['atom_1'] },
        { id: 'option_2', verdict: false, atomIds: ['atom_2'] },
      ],
    });

    expect(parsed.variants[0]?.referenceSource).toEqual(input.reference);
    expect(parsed.variants[0]?.fidelityContract).toEqual(
      expect.objectContaining({
        targetConcepts: ['Career planning'],
        response: expect.objectContaining({ choiceTopology: 'combo_sets' }),
      }),
    );
    expect(parsed.variants[0]?.transformationPolicy).toEqual(
      expect.objectContaining({
        preserve: expect.arrayContaining(['source target concept']),
        prohibit: ['complete source sentences copied verbatim'],
      }),
    );
  });

  it('keeps a unique source token isolated to the designated referenceSource field', () => {
    const service = new ExamRegeneratorService();
    const sourceToken = 'SOURCE_TOKEN_ISOLATION_MARKER';
    const input = request({
      reference: {
        ...request().reference,
        choices: [
          `① ${sourceToken}`,
          '② source-choice-marker-2',
          '③ source-choice-marker-3',
          '④ source-choice-marker-4',
          '⑤ source-choice-marker-5',
        ],
      },
    });

    const prompt = JSON.parse(
      service.buildBatchRegenPrompt([input], Difficulty.MIDDLE, ''),
    ) as Readonly<{
      variants: readonly Readonly<Record<string, unknown>>[];
    }>;
    const variant = prompt.variants[0];

    expect(variant?.referenceSource).toEqual(
      expect.objectContaining({
        choices: expect.arrayContaining([`① ${sourceToken}`]),
      }),
    );
    const unrelatedPromptFields = Object.entries(variant ?? {})
      .filter(([key]) => key !== 'referenceSource')
      .map(([, value]) => JSON.stringify(value))
      .join('\n');
    expect(unrelatedPromptFields).not.toContain(sourceToken);
  });

  it.each(SOURCE_PROMPT_FIXTURES)(
    'includes $sourceId exactly once under referenceSource with its structural contract and selected TPL',
    (fixture) => {
      const service = new ExamRegeneratorService();
      const input = sourcePromptRequest(fixture);
      const prompt = JSON.parse(
        service.buildBatchRegenPrompt([input], Difficulty.MIDDLE, ''),
      ) as Readonly<{ variants: readonly Readonly<Record<string, unknown>>[] }>;
      const variant = prompt.variants[0];
      if (variant === undefined || input.fidelitySpec === undefined) {
        throw new Error('Missing fixture prompt variant.');
      }
      const nonSourceFields = Object.entries(variant)
        .filter(([key]) => key !== 'referenceSource')
        .map(([, value]) => JSON.stringify(value))
        .join('\n');

      expect(variant.referenceSource).toEqual(input.reference);
      expect(nonSourceFields).not.toContain(input.reference.stem);
      if (input.reference.stimulus.length > 0) {
        expect(nonSourceFields).not.toContain(input.reference.stimulus);
      }
      expect(variant.fidelityContract).toEqual(
        expect.objectContaining({
          source: input.reference.source,
          density: input.fidelitySpec.density,
          response: input.fidelitySpec.response,
          structure: expect.objectContaining({
            relations: input.fidelitySpec.structure.relations,
          }),
        }),
      );
      expect(variant.transformationPolicy).toEqual(
        expect.objectContaining({
          preserve: expect.any(Array),
          rewrite: expect.any(Array),
          prohibit: expect.any(Array),
        }),
      );
      expect(variant.selectedTemplate).toBe(input.selectedTemplate);
    },
  );

  it.each([
    {
      label: 'missing source evidence',
      invalidQuestion: output({ sourceEvidence: undefined }),
    },
    {
      label: 'a wrong template',
      invalidQuestion: output({ templateType: 'TPL_FORMAL_DOCUMENT' }),
    },
    {
      label: 'changed response topology',
      invalidQuestion: output({
        choices: ['① 설명 A', '② 설명 B', '③ 설명 C', '④ 설명 D', '⑤ 설명 E'],
      }),
    },
  ] as const)(
    'rejects a batch with $label without retaining an earlier valid item',
    async ({ invalidQuestion }) => {
      const service = new ExamRegeneratorService();
      const requests = pairedRequests();
      const model = clientFor(
        JSON.stringify({
          questions: [
            output(),
            {
              ...invalidQuestion,
              questionStem: '서로 다른 두 번째 문항의 판단은 무엇인가?',
              stimulusData: {
                headers: [{ id: 'distinct', label: '별도 자료' }],
                rows: [{ id: 'distinct-row', cells: ['서로 다른 사실'] }],
                selection_chips: [],
              },
              sourceEvidence:
                invalidQuestion.sourceEvidence === undefined
                  ? undefined
                  : {
                      sourceHash: 'hash-2',
                      targetConceptIds: ['concept_career_planning'],
                    },
            },
          ],
        }),
      );
      const result: ReferenceVariantGenerationResult[] = [];

      await service.regenerateReferenceBatch(
        model.client,
        requests,
        result,
        Difficulty.MIDDLE,
      );

      expect(result).toEqual([]);
    },
  );

  it('rejects a batch count mismatch without retrying or retaining results', async () => {
    const service = new ExamRegeneratorService();
    const model = clientFor(JSON.stringify({ questions: [output()] }));
    const result: ReferenceVariantGenerationResult[] = [];

    await service.regenerateReferenceBatch(
      model.client,
      pairedRequests(),
      result,
      Difficulty.MIDDLE,
    );

    expect(model.create).toHaveBeenCalledTimes(1);
    expect(result).toEqual([]);
  });

  it('normalizes the legacy persisted question shape before strict validation', async () => {
    const service = new ExamRegeneratorService();
    const model = clientFor(JSON.stringify({ questions: [legacyOutput()] }));
    const result: ReferenceVariantGenerationResult[] = [];

    await service.regenerateReferenceBatch(
      model.client,
      [request()],
      result,
      Difficulty.MIDDLE,
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.metadata.recommended_template).toBe(
      'TPL_COMPARATIVE_MATRIX',
    );
  });

  it('rejects a model item with a template other than the payload-selected TPL', async () => {
    const service = new ExamRegeneratorService();
    const model = clientFor(
      JSON.stringify({
        questions: [output({ templateType: 'TPL_PLAIN_TEXT' })],
      }),
    );
    const result: ReferenceVariantGenerationResult[] = [];

    await service.regenerateReferenceBatch(
      model.client,
      [request()],
      result,
      Difficulty.MIDDLE,
    );

    expect(model.create).toHaveBeenCalledTimes(3);
    expect(result).toEqual([]);
  });

  it('rejects a truth-combination item without the required combo block', async () => {
    const service = new ExamRegeneratorService();
    const model = clientFor(
      JSON.stringify({ questions: [output({ comboBlock: null })] }),
    );
    const result: ReferenceVariantGenerationResult[] = [];

    await service.regenerateReferenceBatch(
      model.client,
      [request()],
      result,
      Difficulty.MIDDLE,
    );

    expect(result).toEqual([]);
  });

  it('normalizes an empty combo block to null when the source has no view items', async () => {
    const service = new ExamRegeneratorService();
    const noViewFrame = {
      ...frame(),
      response: { ...frame().response, viewItemCount: 0 },
    };
    const model = clientFor(
      JSON.stringify({
        questions: [
          output({
            comboBlock: { title: '<보기>', items: [] },
          }),
        ],
      }),
    );
    const result: ReferenceVariantGenerationResult[] = [];

    await service.regenerateReferenceBatch(
      model.client,
      [request({ frame: noViewFrame })],
      result,
      Difficulty.MIDDLE,
    );

    expect(result[0]?.render_ready.combo_block).toBeNull();
    expect(model.create.mock.calls[0]?.[0]).toMatchObject({
      response_format: {
        type: 'json_schema',
        json_schema: {
          strict: true,
          schema: {
            properties: {
              questions: {
                items: {
                  properties: {
                    comboBlock: { type: 'null' },
                  },
                },
              },
            },
          },
        },
      },
    });
  });

  it.each([3, 4])(
    'builds exact combo cardinality for %i source view items',
    async (viewItemCount) => {
      const service = new ExamRegeneratorService();
      const exactViewFrame = {
        ...frame(),
        response: { ...frame().response, viewItemCount },
      };
      const model = clientFor(JSON.stringify({ questions: [output()] }));
      const result: ReferenceVariantGenerationResult[] = [];

      await service.regenerateReferenceBatch(
        model.client,
        [request({ frame: exactViewFrame })],
        result,
        Difficulty.MIDDLE,
      );

      expect(model.create.mock.calls[0]?.[0]).toMatchObject({
        response_format: {
          type: 'json_schema',
          json_schema: {
            schema: {
              properties: {
                questions: {
                  items: {
                    properties: {
                      comboBlock: {
                        type: 'object',
                        properties: {
                          items: {
                            minItems: viewItemCount,
                            maxItems: viewItemCount,
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      });
    },
  );

  it('accepts a structured explanation judgment from the final variant model', async () => {
    const service = new ExamRegeneratorService();
    const model = clientFor(
      JSON.stringify({
        questions: [
          output({
            explanation: { judgment: 'The evidence supports choice one.' },
          }),
        ],
      }),
    );
    const result: ReferenceVariantGenerationResult[] = [];

    await service.regenerateReferenceBatch(
      model.client,
      [request()],
      result,
      Difficulty.MIDDLE,
    );

    expect(result[0]?.explanation).toEqual({
      judgment: 'The evidence supports choice one.',
    });
  });

  it('accepts a generated item that retains distinctive reference content', async () => {
    const service = new ExamRegeneratorService();
    const model = clientFor(
      JSON.stringify({
        questions: [
          output({
            questionStem: 'SOURCE_UNIQUE_TOKEN을 포함한 자료의 설명은?',
          }),
        ],
      }),
    );
    const result: ReferenceVariantGenerationResult[] = [];

    await service.regenerateReferenceBatch(
      model.client,
      [request()],
      result,
      Difficulty.MIDDLE,
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.render_ready.question_stem).toContain(
      'SOURCE_UNIQUE_TOKEN',
    );
  });

  it('rejects a generated item that copies a complete source sentence', async () => {
    const service = new ExamRegeneratorService();
    const sourceSentence =
      'A complete source sentence must not be copied verbatim.';
    const model = clientFor(
      JSON.stringify({ questions: [output({ questionStem: sourceSentence })] }),
    );
    const result: ReferenceVariantGenerationResult[] = [];

    await service.regenerateReferenceBatch(
      model.client,
      [
        request({
          reference: {
            ...request().reference,
            stimulus: sourceSentence,
          },
        }),
      ],
      result,
      Difficulty.MIDDLE,
    );

    expect(result).toEqual([]);
  });

  it('repairs a copied visible field using the prior candidate and structured overlap diagnostics', async () => {
    const service = new ExamRegeneratorService();
    const sourceSentence =
      'A complete source sentence must not be copied verbatim.';
    const model = clientFor('');
    model.create.mockReset();
    model.create
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                questions: [output({ questionStem: sourceSentence })],
              }),
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                questions: [
                  output({
                    questionStem:
                      'Which conclusion follows from the revised conditions?',
                  }),
                ],
              }),
            },
          },
        ],
      })
      .mockResolvedValueOnce({
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
    const result: ReferenceVariantGenerationResult[] = [];

    await service.regenerateReferenceBatch(
      model.client,
      [
        request({
          reference: {
            ...request().reference,
            stimulus: sourceSentence,
          },
        }),
      ],
      result,
      Difficulty.MIDDLE,
    );

    expect(result).toHaveLength(1);
    expect(model.create).toHaveBeenCalledTimes(3);
    const repairRequest = JSON.stringify(model.create.mock.calls[1]?.[0]);
    expect(repairRequest).toContain('copy_policy_repair');
    expect(repairRequest).toContain('previousCandidate');
    expect(repairRequest).toContain('questionStem');
    expect(repairRequest).toContain('protectedSegmentIndex');
    expect(repairRequest).not.toContain(
      'Generate faithful reference variants from the selected source',
    );
    expect(repairRequest).toContain(
      `\\"overlap\\":\\"${sourceSentence
        .toLocaleLowerCase('ko-KR')
        .slice(0, 24)}`,
    );
  });

  it('allows one additional targeted copy repair after the standard final retry limit', async () => {
    const service = new ExamRegeneratorService();
    const sourceSentence =
      'A complete source sentence must not be copied verbatim.';
    const copied = {
      questions: [output({ questionStem: sourceSentence })],
    };
    const repaired = {
      questions: [
        output({
          questionStem: 'Which conclusion follows from the revised conditions?',
        }),
      ],
    };
    const model = clientFor('');
    model.create.mockReset();
    model.create
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify(copied) } }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify(copied) } }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify(copied) } }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify(repaired) } }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: '{not-json' } }],
      })
      .mockResolvedValueOnce({
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
    const result: ReferenceVariantGenerationResult[] = [];

    await service.regenerateReferenceBatch(
      model.client,
      [
        request({
          reference: {
            ...request().reference,
            stimulus: sourceSentence,
          },
        }),
      ],
      result,
      Difficulty.MIDDLE,
    );

    expect(result).toHaveLength(1);
    expect(model.create).toHaveBeenCalledTimes(6);
  });

  it('retains one semantic correction after a targeted copy repair', async () => {
    const service = new ExamRegeneratorService();
    const sourceSentence =
      'A complete source sentence must not be copied verbatim.';
    const copied = {
      questions: [output({ questionStem: sourceSentence })],
    };
    const repaired = {
      questions: [
        output({
          questionStem: 'Which conclusion follows from the revised conditions?',
        }),
      ],
    };
    const model = clientFor('');
    model.create.mockReset();
    model.create
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify(copied) } }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify(repaired) } }],
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                accepted: false,
                reasonCode: 'EXCEPTION_OMITTED',
              }),
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: JSON.stringify(repaired) } }],
      })
      .mockResolvedValueOnce({
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
    const result: ReferenceVariantGenerationResult[] = [];

    await service.regenerateReferenceBatch(
      model.client,
      [
        request({
          reference: {
            ...request().reference,
            stimulus: sourceSentence,
          },
        }),
      ],
      result,
      Difficulty.MIDDLE,
    );

    expect(result).toHaveLength(1);
    expect(model.create).toHaveBeenCalledTimes(5);
  });

  it('rejects a generated item whose source evidence does not match the selected source', async () => {
    const service = new ExamRegeneratorService();
    const model = clientFor(
      JSON.stringify({
        questions: [
          output({
            sourceEvidence: {
              sourceHash: 'another-source-hash',
              targetConceptIds: ['concept_career_planning'],
            },
          }),
        ],
      }),
    );
    const result: ReferenceVariantGenerationResult[] = [];

    await service.regenerateReferenceBatch(
      model.client,
      [request()],
      result,
      Difficulty.MIDDLE,
    );

    expect(result).toEqual([]);
  });

  it('does not retain a candidate rejected by the semantic verifier', async () => {
    const service = new ExamRegeneratorService();
    const model = clientFor('');
    model.create.mockReset();
    model.create
      .mockResolvedValueOnce({
        choices: [
          { message: { content: JSON.stringify({ questions: [output()] }) } },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                accepted: false,
                reasonCode: 'EXCEPTION_OMITTED',
              }),
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          { message: { content: JSON.stringify({ questions: [output()] }) } },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                accepted: false,
                reasonCode: 'EXCEPTION_OMITTED',
              }),
            },
          },
        ],
      });
    const result: ReferenceVariantGenerationResult[] = [];

    await service.regenerateReferenceBatch(
      model.client,
      [request()],
      result,
      Difficulty.MIDDLE,
    );

    expect(result).toEqual([]);
    expect(model.create).toHaveBeenCalledTimes(4);
  });

  it('retries a malformed semantic verifier response directly without regenerating the candidate', async () => {
    const service = new ExamRegeneratorService();
    const model = clientFor('');
    model.create.mockReset();
    model.create
      .mockResolvedValueOnce({
        choices: [
          { message: { content: JSON.stringify({ questions: [output()] }) } },
        ],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: '{not-json' } }],
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: '{not-json' } }],
      });
    const result: ReferenceVariantGenerationResult[] = [];

    await service.regenerateReferenceBatch(
      model.client,
      [request()],
      result,
      Difficulty.MIDDLE,
    );

    expect(result).toEqual([]);
    expect(model.create).toHaveBeenCalledTimes(3);
    expect(model.create.mock.calls.slice(1)).toEqual(
      expect.arrayContaining([
        [
          expect.objectContaining({
            messages: expect.arrayContaining([
              expect.objectContaining({
                content: expect.stringContaining(
                  'Verify source-faithful variant semantics',
                ),
              }),
            ]),
          }),
          expect.anything(),
        ],
      ]),
    );
  });

  it.each(['EXCEPTION_OMITTED', 'VERDICT_INVERTED', 'DISTRACTOR_ROLE_MISSING'])(
    'rejects %s after exactly one semantic correction retry',
    async (reasonCode) => {
      const service = new ExamRegeneratorService();
      const model = clientFor('');
      model.create.mockReset();
      model.create
        .mockResolvedValueOnce({
          choices: [
            { message: { content: JSON.stringify({ questions: [output()] }) } },
          ],
        })
        .mockResolvedValueOnce({
          choices: [
            {
              message: {
                content: JSON.stringify({ accepted: false, reasonCode }),
              },
            },
          ],
        })
        .mockResolvedValueOnce({
          choices: [
            { message: { content: JSON.stringify({ questions: [output()] }) } },
          ],
        })
        .mockResolvedValueOnce({
          choices: [
            {
              message: {
                content: JSON.stringify({ accepted: false, reasonCode }),
              },
            },
          ],
        });
      const result: ReferenceVariantGenerationResult[] = [];

      await service.regenerateReferenceBatch(
        model.client,
        [request()],
        result,
        Difficulty.MIDDLE,
      );

      expect(result).toEqual([]);
      expect(model.create).toHaveBeenCalledTimes(4);
      expect(model.create.mock.calls[2]?.[0]).toMatchObject({
        messages: [
          expect.anything(),
          expect.objectContaining({
            content: expect.stringContaining(reasonCode),
          }),
        ],
      });
    },
  );

  it('retries a verifier timeout directly without regenerating the candidate', async () => {
    const service = new ExamRegeneratorService();
    const timeout = new Error('semantic verifier timed out');
    const model = clientFor('');
    model.create.mockReset();
    model.create
      .mockResolvedValueOnce({
        choices: [
          { message: { content: JSON.stringify({ questions: [output()] }) } },
        ],
      })
      .mockRejectedValueOnce(timeout)
      .mockRejectedValueOnce(timeout);
    const result: ReferenceVariantGenerationResult[] = [];

    await service.regenerateReferenceBatch(
      model.client,
      [request()],
      result,
      Difficulty.MIDDLE,
    );

    expect(result).toEqual([]);
    expect(model.create).toHaveBeenCalledTimes(3);
    expect(model.create.mock.calls[2]?.[0]).toMatchObject({
      messages: [
        expect.objectContaining({
          content: expect.stringContaining(
            'Verify source-faithful variant semantics',
          ),
        }),
        expect.anything(),
      ],
    });
  });

  it('does not echo invalid semantic reason prose into the correction request', async () => {
    const service = new ExamRegeneratorService();
    const rawReason = 'raw source display prose';
    const model = clientFor('');
    model.create.mockReset();
    model.create
      .mockResolvedValueOnce({
        choices: [
          { message: { content: JSON.stringify({ questions: [output()] }) } },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                accepted: false,
                reasonCode: rawReason,
              }),
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          { message: { content: JSON.stringify({ questions: [output()] }) } },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                accepted: false,
                reasonCode: rawReason,
              }),
            },
          },
        ],
      });
    const result: ReferenceVariantGenerationResult[] = [];

    await service.regenerateReferenceBatch(
      model.client,
      [request()],
      result,
      Difficulty.MIDDLE,
    );

    expect(result).toEqual([]);
    expect(JSON.stringify(model.create.mock.calls[2]?.[0])).not.toContain(
      rawReason,
    );
  });

  it('passes source structure and fresh-wording requirements to the model', async () => {
    const service = new ExamRegeneratorService();
    const prompt = service.buildBatchRegenPrompt(
      [request()],
      Difficulty.MIDDLE,
      '',
    );

    expect(prompt).toContain('SOURCE_UNIQUE_TOKEN must never appear');
    expect(prompt).toContain('condition and exception relationships');
    expect(prompt).toContain('the source concept and decision rule');
    expect(prompt).toContain('Paraphrase closely where it preserves meaning.');
  });

  it('rejects non-renderable structured data instead of applying a plain-text fallback', async () => {
    const service = new ExamRegeneratorService();
    const model = clientFor(
      JSON.stringify({
        questions: [
          output({
            stimulusData: { headers: [], rows: [], selection_chips: [] },
          }),
        ],
      }),
    );
    const result: ReferenceVariantGenerationResult[] = [];

    await service.regenerateReferenceBatch(
      model.client,
      [request()],
      result,
      Difficulty.MIDDLE,
    );

    expect(result).toEqual([]);
  });

  it('retries malformed output within the bounded budget and skips stale payload context before requesting the model', async () => {
    const service = new ExamRegeneratorService();
    const malformed = clientFor('{');
    const malformedResult: ReferenceVariantGenerationResult[] = [];

    await service.regenerateReferenceBatch(
      malformed.client,
      [request()],
      malformedResult,
      Difficulty.MIDDLE,
    );

    const stale = clientFor(JSON.stringify({ questions: [output()] }));
    const staleResult: ReferenceVariantGenerationResult[] = [];
    await service.regenerateReferenceBatch(
      stale.client,
      [
        request({
          payload: payload({
            source: { sourceId: 'stale', sourceHash: 'hash-1' },
          }),
        }),
      ],
      staleResult,
      Difficulty.MIDDLE,
    );

    expect(malformed.create).toHaveBeenCalledTimes(3);
    expect(malformedResult).toEqual([]);
    expect(stale.create).not.toHaveBeenCalled();
    expect(staleResult).toEqual([]);
  });

  it('Given a retry would leave too little time for final and semantic work, When final output is malformed, Then suppresses the retry before another provider call', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
    try {
      const service = new ExamRegeneratorService();
      const model = clientFor('{');
      model.create.mockImplementationOnce(async () => {
        jest.setSystemTime(11);
        return { choices: [{ message: { content: '{' } }] };
      });
      const result: ReferenceVariantGenerationResult[] = [];

      await service.regenerateReferenceBatch(
        model.client,
        [
          request({
            execution: {
              deadline: new ReferenceJobDeadline({
                deadlineAtMs: 60,
                minimumUsefulBudgets: {
                  planner: 10,
                  final_generator: 20,
                  semantic_verifier: 30,
                },
              }),
              completed: 0,
              total: 1,
            },
          }),
        ],
        result,
        Difficulty.MIDDLE,
      );

      expect(model.create).toHaveBeenCalledTimes(1);
      expect(result).toEqual([]);
    } finally {
      jest.useRealTimers();
    }
  });

  it('rejects the batch when two generated items overlap in stimulus content', async () => {
    const service = new ExamRegeneratorService();
    const secondSource: SourceIdentity = {
      sourceId: 'success:1:source-2',
      sourceHash: 'hash-2',
    };
    const identical = output();
    const model = clientFor(
      JSON.stringify({ questions: [identical, identical] }),
    );
    const inputs = [
      request(),
      request({
        reference: {
          source: secondSource,
          stem: 'Alternate reference stem',
          stimulus: 'DISTINCT_ALT_TOKEN never appears in either variant.',
          viewItems: ['ㄱ. Alt condition', 'ㄴ. Alt consequence'],
          choices: ['① ㄱ', '② ㄴ', '③ ㄱ, ㄴ', '④ ㄱ, ㄴ 모두 아님', '⑤ 추가'],
        },
        frame: { ...frame(), source: secondSource },
        payload: payload({ source: secondSource }),
      }),
    ];
    const result: ReferenceVariantGenerationResult[] = [];

    await service.regenerateReferenceBatch(
      model.client,
      inputs,
      result,
      Difficulty.MIDDLE,
    );

    expect(model.create).toHaveBeenCalledTimes(1);
    expect(model.create.mock.calls[0]?.[0]).toMatchObject({
      response_format: { type: 'json_object' },
    });
    expect(result).toEqual([]);
  });

  it('rejects an item whose correctAnswer combination does not match payload verdicts', async () => {
    const service = new ExamRegeneratorService();
    const model = clientFor(
      JSON.stringify({ questions: [output({ correctAnswer: 3 })] }),
    );
    const result: ReferenceVariantGenerationResult[] = [];

    await service.regenerateReferenceBatch(
      model.client,
      [request()],
      result,
      Difficulty.MIDDLE,
    );

    expect(result).toEqual([]);
  });

  it('rejects bare letter choices for a source-owned single-selection item', async () => {
    const service = new ExamRegeneratorService();
    const model = clientFor(
      JSON.stringify({
        questions: [
          output({
            comboBlock: null,
            choices: ['① ㄱ', '② ㄴ', '③ ㄷ', '④ ㄹ', '⑤ 모두 옳다'],
          }),
        ],
      }),
    );
    const singleSelection = request({
      reference: { ...request().reference, viewItems: [] },
      frame: {
        ...frame(),
        response: {
          mode: 'single_selection',
          choiceEncoding: 'single_choice',
          choiceCount: 5,
          viewItemCount: 0,
          choiceTopology: 'single_choice',
          combinationPlan: {
            expectedAnswerCount: 5,
            optionCount: 5,
            topology: 'single_choice',
          },
        },
      },
      payload: payload({
        answerPlan: {
          responseMode: 'single_selection',
          choiceEncoding: 'single_choice',
          expectedAnswerCount: 1,
          options: [
            { id: 'option_1', verdict: true, atomIds: ['atom_3'] },
            { id: 'option_2', verdict: false, atomIds: ['atom_2'] },
            { id: 'option_3', verdict: false, atomIds: ['atom_1'] },
            { id: 'option_4', verdict: false, atomIds: ['atom_2'] },
            { id: 'option_5', verdict: false, atomIds: ['atom_3'] },
          ],
        },
      }),
    });
    const result: ReferenceVariantGenerationResult[] = [];

    await service.regenerateReferenceBatch(
      model.client,
      [singleSelection],
      result,
      Difficulty.MIDDLE,
    );

    expect(result).toEqual([]);
  });

  it('rejects duplicate choices that encode the same expected truth combination', async () => {
    const service = new ExamRegeneratorService();
    const model = clientFor(
      JSON.stringify({
        questions: [
          output({
            choices: ['① ㄱ', '② ㄱ', '③ ㄴ', '④ ㄱ, ㄴ', '⑤ 해당 없음'],
            correctAnswer: 1,
          }),
        ],
      }),
    );
    const result: ReferenceVariantGenerationResult[] = [];

    await service.regenerateReferenceBatch(
      model.client,
      [request()],
      result,
      Difficulty.MIDDLE,
    );

    expect(model.create).toHaveBeenCalledTimes(3);
    expect(result).toEqual([]);
  });

  it('retries an answer mismatch with the expected verdict letters', async () => {
    const service = new ExamRegeneratorService();
    const model = clientFor(JSON.stringify({ questions: [output()] }));
    model.create.mockReset();
    model.create
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                questions: [output({ correctAnswer: 3 })],
              }),
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        choices: [
          { message: { content: JSON.stringify({ questions: [output()] }) } },
        ],
      })
      .mockResolvedValueOnce({
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
    const result: ReferenceVariantGenerationResult[] = [];

    await service.regenerateReferenceBatch(
      model.client,
      [request()],
      result,
      Difficulty.MIDDLE,
    );

    expect(result).toHaveLength(1);
    expect(model.create).toHaveBeenCalledTimes(3);
    expect(model.create.mock.calls[1]?.[0]).toMatchObject({
      messages: [
        expect.anything(),
        expect.objectContaining({
          content: expect.stringContaining(
            'expected true-statement letters are ㄱ',
          ),
        }),
      ],
    });
  });

  it('marks a validated reporter conversation from an interview source as interview scene data', async () => {
    const service = new ExamRegeneratorService();
    const interviewReference = {
      ...request().reference,
      stem: '다음 인터뷰 내용에 나타난 기술로 적절한 것은?',
      stimulus:
        '기자: 신소재의 특징은 무엇인가요?\n개발자: 특정 온도에서 저항이 사라집니다.',
      choices: ['① ㄱ', '② ㄴ', '③ ㄱ, ㄴ', '④ 없음', '⑤ 모두 옳다'],
    };
    const interviewArchetype = classifyReferenceArchetype(interviewReference);
    if (interviewArchetype.kind !== 'classified') {
      throw new Error('Interview archetype fixture classification failed.');
    }
    const input = request({
      selectedTemplate: 'TPL_CONVERSATIONAL_FLOW',
      reference: interviewReference,
      frame: {
        ...frame(),
        archetype: interviewArchetype.value,
        shell: interviewArchetype.value.shell,
        informationShape: 'role_dialogue',
      },
      payload: payload({ requiredInformationShape: 'role_dialogue' }),
    });
    const interviewTrace = fidelityTrace();
    interviewTrace.shell = {
      materialKind: 'dialogue',
      kind: 'dialogue',
      requiresViewBlock: true,
      requiresChoiceCombination: true,
      requiresStructuredSource: true,
    };
    interviewTrace.reasoningPattern = 'role_dialogue';
    const model = clientFor(
      JSON.stringify({
        questions: [
          output({
            templateType: 'TPL_CONVERSATIONAL_FLOW',
            stimulusData: {
              participants: [
                { id: 'reporter', name: '기자', role: 'interviewer' },
                { id: 'developer', name: '개발자', role: 'interviewee' },
              ],
              messages: [
                {
                  p_id: 'reporter',
                  text: '신소재의 특징은 무엇인가요?',
                  timestamp: '',
                },
                {
                  p_id: 'developer',
                  text: '특정 온도에서 저항이 사라집니다.',
                  timestamp: '',
                },
              ],
            },
            fidelityTrace: interviewTrace,
          }),
        ],
      }),
    );
    const result: ReferenceVariantGenerationResult[] = [];

    await service.regenerateReferenceBatch(
      model.client,
      [input],
      result,
      Difficulty.MIDDLE,
    );

    expect(result[0]?.render_ready.stimulus_data).toMatchObject({
      scene_kind: 'interview',
    });
  });
});
