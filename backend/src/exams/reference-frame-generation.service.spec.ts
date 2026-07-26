import { Difficulty } from '../entities/exam-record.entity';
import { TextbookService } from '../textbook/textbook.service';
import {
  ExamRegeneratorService,
  type ReferenceGenerationClient,
  type ReferenceVariantGenerationRequest,
} from './exam-regenerator.service';
import {
  AR_ARCHETYPE_FIXTURES,
  planner,
  validFrameJson,
  validPayloadJson,
  validRequest,
} from './reference-frame-planner.fixtures';
import { ReferenceFrameGenerationService } from './reference-frame-generation.service';
import { conceptId } from './reference-concept-catalog-resolver';
import {
  ReferenceJobDeadline,
  ReferenceJobDeadlineExceededError,
} from './reference-job-deadline';
import type { ReferenceArchetype } from './reference-archetype';
import type { StructuredTplName } from './tpl-schemas';
import type {
  ReferenceFrame,
  SourceIdentity,
  SubjectStyle,
  UnitRange,
} from './reference-frame.types';

type PlannerPrompt = Readonly<{
  requiredSource: SourceIdentity;
  requiredSubject: SubjectStyle;
  requiredUnitRange: UnitRange;
  requiredArchetype: ReferenceArchetype;
  requiredSourceTargetConceptId?: string;
  reference?: Readonly<{
    target?: Readonly<{ primaryConcept: string }>;
  }>;
  task: unknown;
}>;

function sourceTargetConceptId(prompt: PlannerPrompt): string {
  if (prompt.requiredSourceTargetConceptId !== undefined) {
    return prompt.requiredSourceTargetConceptId;
  }
  const primaryConcept = prompt.reference?.target?.primaryConcept;
  if (primaryConcept === undefined) {
    throw new Error('Missing normalized source target.');
  }
  return conceptId(
    prompt.requiredSubject,
    prompt.requiredUnitRange.start,
    primaryConcept,
  );
}

function plannerClient(
  payloadTargetConceptId?: (
    prompt: PlannerPrompt,
    payloadAttempt: number,
  ) => string | undefined,
) {
  let normalizedSourceTargetId: string | undefined;
  let payloadAttempt = 0;
  const create = jest.fn().mockImplementation((request) => {
    const prompt: unknown = JSON.parse(request.messages[1]?.content ?? '{}');
    if (typeof prompt !== 'object' || prompt === null) {
      throw new Error('Missing planner prompt.');
    }
    const required = prompt as PlannerPrompt;
    const archetype = required.requiredArchetype;
    if (required.reference?.target !== undefined) {
      normalizedSourceTargetId = sourceTargetConceptId(required);
    }
    const answerCount =
      archetype.choiceTopology === 'combo_sets'
        ? archetype.viewItemCount
        : archetype.choiceCount;
    const answerOptions = Array.from({ length: answerCount }, (_, index) => ({
      id: `option_${index + 1}`,
      verdict: index === 0,
      atomIds: [`atom_${(index % 3) + 1}`],
    }));
    const content =
      required.task ===
      'Extract only the structural ReferenceFrame from the reference item.'
        ? validFrameJson({
            source: required.requiredSource,
            subject: required.requiredSubject,
            unitRange: required.requiredUnitRange,
            groundingLexicon: {
              entities: [
                { slot: 'actor_a', class: 'person' },
                { slot: 'process_a', class: 'process' },
                { slot: 'artifact_a', class: 'artifact' },
              ],
              quantities: [],
              rules: [],
              bindings: [
                {
                  atomId: 'atom_1',
                  entitySlots: ['actor_a'],
                  quantityIds: [],
                  ruleIds: [],
                },
                {
                  atomId: 'atom_2',
                  entitySlots: ['actor_a', 'process_a'],
                  quantityIds: [],
                  ruleIds: [],
                },
                {
                  atomId: 'atom_3',
                  entitySlots: ['actor_a', 'artifact_a'],
                  quantityIds: [],
                  ruleIds: [],
                },
              ],
            },
            response: {
              mode: archetype.responseMode,
              choiceEncoding: archetype.choiceEncoding,
              choiceCount: archetype.choiceCount,
              viewItemCount: archetype.viewItemCount,
              choiceTopology: archetype.choiceTopology,
              combinationPlan: {
                expectedAnswerCount:
                  archetype.combinationPlan.expectedAnswerCount,
                optionCount: archetype.combinationPlan.optionCount,
                topology: archetype.choiceTopology,
              },
            },
            informationShape: archetype.informationShape,
            shell: archetype.shell,
          })
        : validPayloadJson({
            source: required.requiredSource,
            subject: required.requiredSubject,
            unitRange: required.requiredUnitRange,
            eligibleUnits: [required.requiredUnitRange.start],
            targetConceptIds: [
              payloadTargetConceptId?.(required, payloadAttempt++) ??
                required.requiredSourceTargetConceptId ??
                normalizedSourceTargetId ??
                sourceTargetConceptId(required),
            ],
            answerPlan: {
              responseMode: archetype.responseMode,
              choiceEncoding: archetype.choiceEncoding,
              expectedAnswerCount: answerCount,
              options: answerOptions,
            },
            requiredInformationShape: archetype.informationShape,
          });
    return Promise.resolve({
      choices: [{ message: { content } }],
    });
  });
  return {
    chat: {
      completions: {
        create,
      },
    },
    create,
  };
}

function regeneratorClient(): ReferenceGenerationClient {
  return {
    chat: {
      completions: {
        create: jest.fn(),
      },
    },
  };
}

type CachedFrame = Readonly<{
  id?: string;
  sourceId: string;
  sourceHash: string;
  model: string;
  contractVersion: number;
  archetypeFingerprint: string;
  frame: ReferenceFrame;
}>;

function cacheReuseHarness() {
  const textbook = new TextbookService();
  jest
    .spyOn(textbook, 'getConcepts')
    .mockReturnValue([
      { unitName: '1단원', concepts: ['Career values', 'Career planning'] },
    ]);
  const regenerator = new ExamRegeneratorService();
  jest
    .spyOn(regenerator, 'regenerateReferenceBatch')
    .mockImplementation((_client, requests, result) => {
      const request = requests[0];
      if (request === undefined) return Promise.resolve();
      result.push({
        metadata: {
          unit_name: '1단원',
          target_concept: 'Career values',
          item_type: 'reference_variant',
          difficulty: Difficulty.MIDDLE,
          recommended_template: request.selectedTemplate,
        },
        render_ready: {
          question_stem: 'Cached frame regression question',
          stimulus_data: {},
          options_list: ['① ㄱ', '② ㄴ', '③ ㄱ, ㄴ', '④ 없음', '⑤ 기타'],
          combo_block: null,
        },
        explanation: { judgment: 'valid' },
        correct_answer: 1,
        dna_contract: null,
      });
      return Promise.resolve();
    });
  let cache: CachedFrame | null = null;
  const cacheRepo = {
    findOneBy: jest.fn(async () => cache),
    create: jest.fn((value: CachedFrame) => value),
    save: jest.fn(async (value: CachedFrame) => {
      cache = value;
      return value;
    }),
  };
  const client = plannerClient();
  const service = new ReferenceFrameGenerationService(
    textbook,
    regenerator,
    {
      createPlannerClient: () => client,
      createRegeneratorClient: regeneratorClient,
      readReferences: () => [
        {
          source: { filename: 'unit-1.pdf', unitNumber: 1 },
          questionNumber: 1,
          stem: 'Reference stem',
          stimulus: 'Reference stimulus',
          choices: ['① 하나', '② 둘', '③ 셋', '④ 넷', '⑤ 다섯'],
          targetConcepts: ['Career values'],
        },
      ],
    },
    undefined,
    cacheRepo as never,
  );
  return {
    cache: () => cache,
    plannerCreate: jest.mocked(client.chat.completions.create),
    replaceCache: (value: CachedFrame) => {
      cache = value;
    },
    commit: (drafts: readonly { cacheMutation?: CachedFrame }[]) => {
      const mutation = drafts[0]?.cacheMutation;
      if (mutation === undefined) {
        throw new Error('Expected a staged cache frame.');
      }
      cache = mutation;
    },
    service,
  };
}

type SourceTargetFixture = Readonly<{
  sourceId: string;
  subjectSlug: 'success' | 'industry';
  canonicalTarget: string;
  questionNumber: number;
}>;

const SOURCE_TARGET_FIXTURES = [
  {
    sourceId: 'sungjik:15:1',
    subjectSlug: 'success',
    canonicalTarget: '근로관계법',
    questionNumber: 1,
  },
  {
    sourceId: 'sungjik:15:9',
    subjectSlug: 'success',
    canonicalTarget: '해고 제한 및 예고',
    questionNumber: 9,
  },
  {
    sourceId: 'kongil:15:8',
    subjectSlug: 'industry',
    canonicalTarget: '하인리히의 사고 예방 5단계',
    questionNumber: 8,
  },
] as const satisfies readonly SourceTargetFixture[];

function fixtureSource(sourceId: string) {
  const fixture = AR_ARCHETYPE_FIXTURES.find(
    ({ projection }) => projection.provenance.sourceId === sourceId,
  );
  if (fixture === undefined)
    throw new Error(`Missing source fixture: ${sourceId}`);
  return fixture.source;
}

function finalGenerationResult(selectedTemplate: StructuredTplName) {
  return {
    metadata: {
      unit_name: '15단원',
      target_concept: 'source target',
      item_type: 'reference_variant' as const,
      difficulty: Difficulty.MIDDLE,
      recommended_template: selectedTemplate,
    },
    render_ready: {
      question_stem: 'Source-target preservation question',
      stimulus_data: {},
      options_list: ['① 하나', '② 둘', '③ 셋', '④ 넷', '⑤ 다섯'],
      combo_block: null,
    },
    explanation: { judgment: 'valid' },
    correct_answer: 1,
    dna_contract: null,
  };
}

function sourceReference(
  sourceId: string,
  questionNumber: number,
  targetConcepts: readonly string[],
) {
  const source = fixtureSource(sourceId);
  return {
    source: { filename: `${sourceId}.pdf`, unitNumber: 15 },
    questionNumber,
    ...source,
    targetConcepts,
  };
}

function orderedReferenceCandidates(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const candidateNumber = String(index + 1).padStart(2, '0');
    return {
      source: {
        filename: `candidate-${candidateNumber}.pdf`,
        unitNumber: 15,
      },
      questionNumber: index + 1,
      ...fixtureSource('sungjik:15:1'),
      targetConcepts: ['Career values'],
    };
  });
}

describe('ReferenceFrameGenerationService', () => {
  it('composes selector, planner, canonical TPL, and structured regeneration into one exact-count draft', async () => {
    const textbook = new TextbookService();
    jest
      .spyOn(textbook, 'getConcepts')
      .mockReturnValue([
        { unitName: '1단원', concepts: ['Career values', 'Career planning'] },
      ]);
    const regenerator = new ExamRegeneratorService();
    jest
      .spyOn(regenerator, 'regenerateReferenceBatch')
      .mockImplementation((_client, requests, result) => {
        const request = requests[0];
        if (request === undefined) return Promise.resolve();
        receivedViewItems = request.reference.viewItems;
        receivedViewItemCount = request.frame.response.viewItemCount;
        receivedResponseMode = request.frame.response.mode;
        result.push({
          metadata: {
            unit_name: '1단원',
            target_concept: 'Career values',
            item_type: 'reference_variant',
            difficulty: Difficulty.MIDDLE,
            recommended_template: request.selectedTemplate,
          },
          render_ready: {
            question_stem: 'New structured question',
            stimulus_data: {
              headers: [{ id: 'a', label: 'A' }],
              rows: [{ id: 'r', cells: ['1'] }],
              selection_chips: [],
            },
            options_list: ['① ㄱ', '② ㄴ', '③ ㄱ, ㄴ', '④ 없음', '⑤ 기타'],
            combo_block: {
              title: '<보기>',
              items: [
                { key: 'ㄱ', text: 'True' },
                { key: 'ㄴ', text: 'False' },
              ],
            },
          },
          explanation: { judgment: 'valid' },
          correct_answer: 1,
          dna_contract: null,
        });
        return Promise.resolve();
      });
    let receivedViewItems: readonly string[] = [];
    let receivedViewItemCount: number | undefined;
    let receivedResponseMode: string | undefined;
    const service = new ReferenceFrameGenerationService(textbook, regenerator, {
      createPlannerClient: plannerClient,
      createRegeneratorClient: regeneratorClient,
      readReferences: () => [
        {
          source: { filename: 'unit-1.pdf', unitNumber: 1 },
          questionNumber: 1,
          stem: 'Reference stem',
          stimulus: 'Reference stimulus',
          viewItems: [
            'ㄱ. First condition',
            'ㄴ. Second condition',
            'ㄷ. Third condition',
          ],
          choices: ['① ㄱ', '② ㄴ', '③ ㄱ, ㄴ', '④ ㄴ, ㄷ', '⑤ ㄱ, ㄴ, ㄷ'],
          targetConcepts: ['Career values'],
        },
      ],
    });

    const drafts = await service.generate(
      'success',
      1,
      1,
      Difficulty.MIDDLE,
      1,
      ['Career values'],
    );

    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.lineage.generationPath).toBe('reference_frame');
    expect(drafts[0]?.lineage.validation).toBe('passed');
    expect(drafts[0]?.lineage.selectedTemplate).toBe('TPL_COMPARATIVE_MATRIX');
    expect(drafts[0]?.lineage.fidelity).toEqual(
      expect.objectContaining({
        contractVersion: 1,
        sourceHash: expect.any(String),
      }),
    );
    expect(drafts[0]?.result.metadata.recommended_template).toBe(
      'TPL_COMPARATIVE_MATRIX',
    );
    expect(receivedViewItems).toHaveLength(3);
    expect(receivedViewItemCount).toBe(3);
    expect(receivedResponseMode).toBe('truth_combination');
  });

  it('Given settled selection and planning work, When generating a reference draft, Then reports monotonic safe milestones after each settlement', async () => {
    const textbook = new TextbookService();
    jest
      .spyOn(textbook, 'getConcepts')
      .mockReturnValue([{ unitName: '1단원', concepts: ['Career values'] }]);
    const regenerator = new ExamRegeneratorService();
    jest
      .spyOn(regenerator, 'regenerateReferenceBatch')
      .mockImplementation(async (_client, requests, result) => {
        const request = requests[0];
        if (request !== undefined) {
          result.push(finalGenerationResult(request.selectedTemplate));
        }
      });
    const updates: Array<{
      stage: string;
      progress: number;
      completed?: number;
      total?: number;
    }> = [];
    const service = new ReferenceFrameGenerationService(textbook, regenerator, {
      createPlannerClient: plannerClient,
      createRegeneratorClient: regeneratorClient,
      readReferences: () => [
        {
          source: { filename: 'unit-1.pdf', unitNumber: 1 },
          questionNumber: 1,
          stem: 'Reference stem',
          stimulus: 'Reference stimulus',
          choices: ['① 하나', '② 둘', '③ 셋', '④ 넷', '⑤ 다섯'],
          targetConcepts: ['Career values'],
        },
      ],
    });

    await service.generate(
      'success',
      1,
      1,
      Difficulty.MIDDLE,
      1,
      ['Career values'],
      undefined,
      {
        reportProgress: (update) => {
          updates.push(update);
        },
      },
    );

    expect(updates).toEqual([
      expect.objectContaining({
        stage: 'selection',
        progress: 15,
        completed: 0,
        total: 1,
      }),
      expect.objectContaining({
        stage: 'planner',
        progress: 35,
        completed: 0,
        total: 1,
        maxAttempts: 3,
      }),
    ]);
  });

  it('Given an expired reference-job deadline, When selection reaches candidate work, Then throws typed expiry without planner or final replacement work', async () => {
    const textbook = new TextbookService();
    jest
      .spyOn(textbook, 'getConcepts')
      .mockReturnValue([{ unitName: '1단원', concepts: ['Career values'] }]);
    const plannerCreate = jest.fn();
    const regenerator = new ExamRegeneratorService();
    const regenerate = jest.spyOn(regenerator, 'regenerateReferenceBatch');
    const frameCacheRepo = {
      findOneBy: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };
    const service = new ReferenceFrameGenerationService(
      textbook,
      regenerator,
      {
        createPlannerClient: () => ({
          chat: { completions: { create: plannerCreate } },
        }),
        createRegeneratorClient: regeneratorClient,
        readReferences: () => [
          {
            source: { filename: 'unit-1.pdf', unitNumber: 1 },
            questionNumber: 1,
            stem: 'Reference stem',
            stimulus: 'Reference stimulus',
            choices: ['① 하나', '② 둘', '③ 셋', '④ 넷', '⑤ 다섯'],
            targetConcepts: ['Career values'],
          },
          {
            source: { filename: 'unit-1-replacement.pdf', unitNumber: 1 },
            questionNumber: 2,
            stem: 'Replacement reference stem',
            stimulus: 'Replacement reference stimulus',
            choices: ['① 하나', '② 둘', '③ 셋', '④ 넷', '⑤ 다섯'],
            targetConcepts: ['Career values'],
          },
        ],
      },
      undefined,
      frameCacheRepo as never,
    );

    await expect(
      service.generate(
        'success',
        1,
        1,
        Difficulty.MIDDLE,
        1,
        ['Career values'],
        undefined,
        {
          deadline: new ReferenceJobDeadline({ deadlineAtMs: 0 }),
        },
      ),
    ).rejects.toBeInstanceOf(ReferenceJobDeadlineExceededError);

    expect(plannerCreate).not.toHaveBeenCalled();
    expect(regenerate).not.toHaveBeenCalled();
    expect(frameCacheRepo.save).not.toHaveBeenCalled();
  });

  it('Given a final-stage deadline error, When a candidate settles, Then does not start a replacement candidate or emit a later milestone', async () => {
    const textbook = new TextbookService();
    jest.spyOn(textbook, 'getConcepts').mockReturnValue([
      {
        unitName: '15단원',
        concepts: ['Early canonical target', 'Later canonical target'],
      },
    ]);
    const regenerator = new ExamRegeneratorService();
    const regenerate = jest
      .spyOn(regenerator, 'regenerateReferenceBatch')
      .mockRejectedValue(
        new ReferenceJobDeadlineExceededError('final_generator', 100),
      );
    const client = plannerClient();
    const frameCacheRepo = {
      findOneBy: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn(),
    };
    const updates: Array<{ stage: string }> = [];
    const service = new ReferenceFrameGenerationService(
      textbook,
      regenerator,
      {
        createPlannerClient: () => client,
        createRegeneratorClient: regeneratorClient,
        readReferences: () => [
          sourceReference('sungjik:15:1', 1, ['Early canonical target']),
          sourceReference('sungjik:15:9', 9, ['Later canonical target']),
        ],
      },
      undefined,
      frameCacheRepo as never,
    );

    await expect(
      service.generate(
        'success',
        15,
        15,
        Difficulty.MIDDLE,
        1,
        undefined,
        undefined,
        {
          reportProgress: (update) => {
            updates.push(update);
          },
        },
      ),
    ).rejects.toMatchObject({
      name: 'ReferenceJobDeadlineExceededError',
      stage: 'final_generator',
    });

    expect(regenerate).toHaveBeenCalledTimes(1);
    expect(client.create).toHaveBeenCalledTimes(2);
    expect(updates.map(({ stage }) => stage)).toEqual(['selection', 'planner']);
    expect(frameCacheRepo.save).not.toHaveBeenCalled();
  });

  it('reads parsed references from the catalog when a catalog reader is available', async () => {
    const textbook = new TextbookService();
    jest
      .spyOn(textbook, 'getConcepts')
      .mockReturnValue([
        { unitName: '1단원', concepts: ['Career values', 'Career planning'] },
      ]);
    const regenerator = new ExamRegeneratorService();
    jest
      .spyOn(regenerator, 'regenerateReferenceBatch')
      .mockImplementation((_client, requests, result) => {
        const request = requests[0];
        if (request === undefined) return Promise.resolve();
        result.push({
          metadata: {
            unit_name: '1단원',
            target_concept: 'Career values',
            item_type: 'reference_variant',
            difficulty: Difficulty.MIDDLE,
            recommended_template: request.selectedTemplate,
          },
          render_ready: {
            question_stem: 'Catalog-backed structured question',
            stimulus_data: {},
            options_list: ['① ㄱ', '② ㄴ', '③ ㄱ, ㄴ', '④ 없음', '⑤ 기타'],
            combo_block: null,
          },
          explanation: { judgment: 'valid' },
          correct_answer: 1,
          dna_contract: null,
        });
        return Promise.resolve();
      });
    const catalogReader = {
      find: jest.fn().mockResolvedValue([
        {
          sourcePayload: {
            source: { filename: 'catalog-unit-1.pdf', unitNumber: 1 },
            questionNumber: 1,
            stem: 'Catalog reference stem',
            stimulus: 'Catalog reference stimulus',
            choices: [
              '① 첫 번째 설명',
              '② 두 번째 설명',
              '③ 세 번째 설명',
              '④ 네 번째 설명',
              '⑤ 다섯 번째 설명',
            ],
            targetConcepts: ['Career values'],
          },
        },
      ]),
    };
    const service = new ReferenceFrameGenerationService(
      textbook,
      regenerator,
      {
        createPlannerClient: plannerClient,
        createRegeneratorClient: regeneratorClient,
      },
      catalogReader,
    );

    const drafts = await service.generate(
      'success',
      1,
      1,
      Difficulty.MIDDLE,
      1,
      ['Career values'],
    );

    expect(catalogReader.find).toHaveBeenCalledTimes(1);
    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.result.render_ready.question_stem).toBe(
      'Catalog-backed structured question',
    );
  });

  it('Given a cached frame missing archetype data, When generating, Then rewrites the cache with a validated archetype', async () => {
    const textbook = new TextbookService();
    jest
      .spyOn(textbook, 'getConcepts')
      .mockReturnValue([
        { unitName: '1단원', concepts: ['Career values', 'Career planning'] },
      ]);
    const regenerator = new ExamRegeneratorService();
    jest
      .spyOn(regenerator, 'regenerateReferenceBatch')
      .mockImplementation((_client, requests, result) => {
        const request = requests[0];
        if (request === undefined) return Promise.resolve();
        result.push({
          metadata: {
            unit_name: '1단원',
            target_concept: 'Career values',
            item_type: 'reference_variant',
            difficulty: Difficulty.MIDDLE,
            recommended_template: request.selectedTemplate,
          },
          render_ready: {
            question_stem: 'New structured question',
            stimulus_data: {
              headers: [{ id: 'a', label: 'A' }],
              rows: [{ id: 'r', cells: ['1'] }],
              selection_chips: [],
            },
            options_list: ['① ㄱ', '② ㄴ', '③ ㄱ, ㄴ', '④ 없음', '⑤ 기타'],
            combo_block: null,
          },
          explanation: { judgment: 'valid' },
          correct_answer: 1,
          dna_contract: null,
        });
        return Promise.resolve();
      });
    const cacheSave = jest.fn().mockResolvedValue(undefined);
    const frameCacheRepo = {
      findOneBy: jest.fn().mockResolvedValue({
        id: 'cache-1',
        contractVersion: 1,
        frame: {
          informationShape: 'case_profile',
          stem: { style: 'statement', polarity: 'positive' },
          response: {
            mode: 'truth_combination',
            choiceEncoding: 'truth_combination',
            choiceCount: 5,
            viewItemCount: 3,
            choiceTopology: 'single_selection',
            combinationPlan: {
              expectedAnswerCount: 3,
              optionCount: 5,
              topology: 'single_selection',
            },
          },
          shell: 'structured',
        },
      }),
      create: jest.fn().mockImplementation((value) => value),
      save: cacheSave,
    };
    const service = new ReferenceFrameGenerationService(
      textbook,
      regenerator,
      {
        createPlannerClient: plannerClient,
        createRegeneratorClient: regeneratorClient,
        readReferences: () => [
          {
            source: { filename: 'unit-1.pdf', unitNumber: 1 },
            questionNumber: 1,
            stem: 'Reference stem',
            stimulus: 'Reference stimulus',
            choices: ['① 하나', '② 둘', '③ 셋', '④ 넷', '⑤ 다섯'],
            targetConcepts: ['Career values'],
          },
        ],
      },
      undefined,
      frameCacheRepo as never,
    );

    const drafts = await service.generate(
      'success',
      1,
      1,
      Difficulty.MIDDLE,
      1,
      ['Career values'],
    );

    expect(drafts).toHaveLength(1);
    expect(cacheSave).not.toHaveBeenCalled();
    expect(frameCacheRepo.create).not.toHaveBeenCalled();
    expect(drafts[0]?.cacheMutation?.contractVersion).toBe(301);
    expect(drafts[0]?.cacheMutation?.id).toBe('cache-1');
    expect(drafts[0]?.cacheMutation?.archetypeFingerprint).toEqual(
      expect.stringMatching(/^3:/),
    );
    expect(drafts[0]?.cacheMutation?.frame?.archetype).toEqual(
      expect.objectContaining({ version: 3 }),
    );
  });

  it('normalizes legacy catalog metadata before reference selection', async () => {
    const textbook = new TextbookService();
    jest
      .spyOn(textbook, 'getConcepts')
      .mockReturnValue([
        { unitName: '1단원', concepts: ['Career values', 'Career planning'] },
      ]);
    const regenerator = new ExamRegeneratorService();
    jest
      .spyOn(regenerator, 'regenerateReferenceBatch')
      .mockImplementation((_client, requests, result) => {
        const request = requests[0];
        if (request === undefined) return Promise.resolve();
        result.push({
          metadata: {
            unit_name: '1단원',
            target_concept: 'Career values',
            item_type: 'reference_variant',
            difficulty: Difficulty.MIDDLE,
            recommended_template: request.selectedTemplate,
          },
          render_ready: {
            question_stem: 'Legacy catalog question',
            stimulus_data: {},
            options_list: ['① ㄱ', '② ㄴ', '③ ㄱ, ㄴ', '④ 없음', '⑤ 기타'],
            combo_block: null,
          },
          explanation: { judgment: 'valid' },
          correct_answer: 1,
          dna_contract: null,
        });
        return Promise.resolve();
      });
    const catalogReader = {
      find: jest.fn().mockResolvedValue([
        {
          subject: 'sungjik',
          unitNumber: 1,
          sourcePayload: {
            source: { filename: 'legacy-unit-1.pdf' },
            questionNumber: 1,
            stem: 'Legacy catalog reference stem',
            stimulus: 'Legacy catalog reference stimulus',
            choices: [
              '① 첫 번째 설명',
              '② 두 번째 설명',
              '③ 세 번째 설명',
              '④ 네 번째 설명',
              '⑤ 다섯 번째 설명',
            ],
            targetConcepts: ['Career values'],
          },
        },
      ]),
    };
    const service = new ReferenceFrameGenerationService(
      textbook,
      regenerator,
      {
        createPlannerClient: plannerClient,
        createRegeneratorClient: regeneratorClient,
      },
      catalogReader,
    );

    const drafts = await service.generate(
      'success',
      1,
      1,
      Difficulty.MIDDLE,
      1,
      ['Career values'],
    );

    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.result.render_ready.question_stem).toBe(
      'Legacy catalog question',
    );
  });

  it('returns a typed source shortfall for malformed catalog rows before invoking the generator', async () => {
    const textbook = new TextbookService();
    jest
      .spyOn(textbook, 'getConcepts')
      .mockReturnValue([
        { unitName: '1단원', concepts: ['Career values', 'Career planning'] },
      ]);
    const regenerator = new ExamRegeneratorService();
    const generate = jest.spyOn(regenerator, 'regenerateReferenceBatch');
    const service = new ReferenceFrameGenerationService(
      textbook,
      regenerator,
      {
        createPlannerClient: plannerClient,
        createRegeneratorClient: regeneratorClient,
      },
      {
        find: jest.fn().mockResolvedValue([{ sourcePayload: {} }]),
      },
    );

    await expect(
      service.generate('success', 1, 1, Difficulty.MIDDLE, 1, [
        'Career values',
      ]),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'REFERENCE_GENERATION_SHORTFALL',
        requestedCount: 1,
        generatedCount: 0,
        stageCounts: { source: 1, planner: 0, fidelity: 0 },
      }),
    });

    expect(generate).not.toHaveBeenCalled();
  });

  it('Given all sources are malformed, When generating, Then returns a typed source shortfall before invoking the planner', async () => {
    const textbook = new TextbookService();
    jest
      .spyOn(textbook, 'getConcepts')
      .mockReturnValue([{ unitName: '15단원', concepts: ['Source concept'] }]);
    const plannerCreate = jest.fn();
    const service = new ReferenceFrameGenerationService(
      textbook,
      new ExamRegeneratorService(),
      {
        createPlannerClient: () => ({
          chat: { completions: { create: plannerCreate } },
        }),
        createRegeneratorClient: regeneratorClient,
        readReferences: () => [
          {
            source: { filename: 'malformed-target.pdf', unitNumber: 15 },
            questionNumber: 1,
            stem: 'Malformed source target',
            stimulus: 'Reference stimulus',
            choices: ['① 하나', '② 둘', '③ 셋', '④ 넷', '⑤ 다섯'],
            targetConcepts: ['   '],
          },
          {
            source: { filename: 'missing-target.pdf', unitNumber: 15 },
            questionNumber: 2,
            stem: 'Missing source target',
            stimulus: 'Reference stimulus',
            choices: ['① 하나', '② 둘', '③ 셋', '④ 넷', '⑤ 다섯'],
          },
        ],
      },
    );

    await expect(
      service.generate('success', 15, 15, Difficulty.MIDDLE, 1, [
        'Source concept',
      ]),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'REFERENCE_GENERATION_SHORTFALL',
        requestedCount: 1,
        generatedCount: 0,
        stageCounts: { source: 2, planner: 0, fidelity: 0 },
      }),
    });
    expect(plannerCreate).not.toHaveBeenCalled();
  });

  it('Given an invalid source before a valid replacement, When generating, Then skips the invalid source and returns the exact count', async () => {
    const textbook = new TextbookService();
    jest
      .spyOn(textbook, 'getConcepts')
      .mockReturnValue([{ unitName: '15단원', concepts: ['Career values'] }]);
    const regenerator = new ExamRegeneratorService();
    jest
      .spyOn(regenerator, 'regenerateReferenceBatch')
      .mockImplementation(async (_client, requests, result) => {
        const request = requests[0];
        if (request !== undefined) {
          result.push(finalGenerationResult(request.selectedTemplate));
        }
      });
    const service = new ReferenceFrameGenerationService(textbook, regenerator, {
      createPlannerClient: plannerClient,
      createRegeneratorClient: regeneratorClient,
      readReferences: () => [
        { source: { filename: 'invalid.pdf', unitNumber: 15 } },
        sourceReference('sungjik:15:9', 9, ['Career values']),
      ],
    });

    const drafts = await service.generate(
      'success',
      15,
      15,
      Difficulty.MIDDLE,
      1,
    );

    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.lineage.source.sourceId).toContain('sungjik:15:9');
  });

  it('Given an excluded source before a valid replacement, When generating, Then skips the excluded source', async () => {
    const textbook = new TextbookService();
    jest
      .spyOn(textbook, 'getConcepts')
      .mockReturnValue([{ unitName: '10단원', concepts: ['Career values'] }]);
    const regenerator = new ExamRegeneratorService();
    jest
      .spyOn(regenerator, 'regenerateReferenceBatch')
      .mockImplementation(async (_client, requests, result) => {
        const request = requests[0];
        if (request !== undefined) {
          result.push(finalGenerationResult(request.selectedTemplate));
        }
      });
    const service = new ReferenceFrameGenerationService(textbook, regenerator, {
      createPlannerClient: plannerClient,
      createRegeneratorClient: regeneratorClient,
      readReferences: () => [
        {
          source: { filename: '성직_10단원_문제.pdf', unitNumber: 10 },
          questionNumber: 10,
          stem: 'NCS 탐색 화면에 대한 설명으로 옳은 것은?',
          stimulus: '키워드 | 코드 | NCS | 분류보기 | 기술서 출력',
          choices: ['① 하나', '② 둘', '③ 셋', '④ 넷', '⑤ 다섯'],
          targetConcepts: ['Career values'],
        },
        {
          source: { filename: 'valid-replacement.pdf', unitNumber: 10 },
          questionNumber: 1,
          ...fixtureSource('sungjik:15:9'),
          targetConcepts: ['Career values'],
        },
      ],
    });

    const drafts = await service.generate(
      'success',
      10,
      10,
      Difficulty.MIDDLE,
      1,
    );

    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.lineage.source.sourceId).toBe(
      'success:10:valid-replacement.pdf:1',
    );
  });

  it('Given an ambiguous source before a valid replacement, When generating, Then skips the ambiguous source and returns the exact count', async () => {
    const textbook = new TextbookService();
    jest
      .spyOn(textbook, 'getConcepts')
      .mockReturnValueOnce([
        {
          unitName: '15단원',
          concepts: ['Career values', 'Later canonical target'],
        },
      ])
      .mockReturnValueOnce([
        {
          unitName: '15단원',
          concepts: [
            'Career values',
            ' career values ',
            'Later canonical target',
          ],
        },
      ]);
    const regenerator = new ExamRegeneratorService();
    jest
      .spyOn(regenerator, 'regenerateReferenceBatch')
      .mockImplementation(async (_client, requests, result) => {
        const request = requests[0];
        if (request !== undefined) {
          result.push(finalGenerationResult(request.selectedTemplate));
        }
      });
    const service = new ReferenceFrameGenerationService(textbook, regenerator, {
      createPlannerClient: plannerClient,
      createRegeneratorClient: regeneratorClient,
      readReferences: () => [
        sourceReference('sungjik:15:1', 1, ['Career values']),
        sourceReference('sungjik:15:9', 9, ['Later canonical target']),
      ],
    });

    const drafts = await service.generate(
      'success',
      15,
      15,
      Difficulty.MIDDLE,
      1,
    );

    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.lineage.source.sourceId).toContain('sungjik:15:9');
  });

  it.each(SOURCE_TARGET_FIXTURES)(
    'Given $sourceId, When generating a faithful variant, Then payload target 0 is its canonical source catalog ID',
    async (fixture) => {
      const textbook = new TextbookService();
      jest
        .spyOn(textbook, 'getConcepts')
        .mockReturnValue([
          { unitName: '15단원', concepts: [fixture.canonicalTarget] },
        ]);
      const regenerator = new ExamRegeneratorService();
      let generatedTargetConceptIds: readonly string[] = [];
      jest
        .spyOn(regenerator, 'regenerateReferenceBatch')
        .mockImplementation((_client, requests, result) => {
          const request = requests[0];
          if (request === undefined) return Promise.resolve();
          generatedTargetConceptIds = request.payload.targetConceptIds;
          result.push(finalGenerationResult(request.selectedTemplate));
          return Promise.resolve();
        });
      const service = new ReferenceFrameGenerationService(
        textbook,
        regenerator,
        {
          createPlannerClient: plannerClient,
          createRegeneratorClient: regeneratorClient,
          readReferences: () => [
            sourceReference(fixture.sourceId, fixture.questionNumber, [
              fixture.canonicalTarget,
            ]),
          ],
        },
      );
      const subject = fixture.subjectSlug === 'industry' ? 'kongil' : 'success';

      const drafts = await service.generate(
        fixture.subjectSlug,
        15,
        15,
        Difficulty.MIDDLE,
        1,
        [fixture.canonicalTarget],
      );

      expect(generatedTargetConceptIds[0]).toBe(
        conceptId(subject, 15, fixture.canonicalTarget),
      );
      expect(drafts[0]?.lineage).toEqual(
        expect.objectContaining({
          source: expect.objectContaining({
            sourceId: expect.stringContaining(fixture.sourceId),
          }),
          payload: expect.objectContaining({
            targetConceptIds: [conceptId(subject, 15, fixture.canonicalTarget)],
          }),
          fidelity: expect.objectContaining({
            contractVersion: 1,
          }),
        }),
      );
      expect(drafts[0]?.lineage.fidelity.sourceHash).toBe(
        drafts[0]?.lineage.source.sourceHash,
      );
      expect(drafts[0]?.lineage.source).toEqual(
        drafts[0]?.lineage.payload.source,
      );
    },
  );

  it('Given every candidate is rejected by semantic fidelity checks, When final generation returns no variants, Then exposes the typed fidelity rejection', async () => {
    const textbook = new TextbookService();
    jest
      .spyOn(textbook, 'getConcepts')
      .mockReturnValue([{ unitName: '15단원', concepts: ['Career values'] }]);
    const regenerator = new ExamRegeneratorService();
    jest
      .spyOn(regenerator, 'regenerateReferenceBatch')
      .mockResolvedValue(undefined);
    const service = new ReferenceFrameGenerationService(textbook, regenerator, {
      createPlannerClient: plannerClient,
      createRegeneratorClient: regeneratorClient,
      readReferences: () => [
        sourceReference('sungjik:15:1', 1, ['Career values']),
      ],
    });

    await expect(
      service.generate('success', 15, 15, Difficulty.MIDDLE, 1, [
        'Career values',
      ]),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'REFERENCE_GENERATION_SHORTFALL',
        generatedCount: 0,
        requestedCount: 1,
        stageCounts: { source: 0, planner: 0, fidelity: 1, admission: 0 },
      }),
    });
  });

  it('Given an early planner rejection and a later valid source, When generating, Then replaces the rejected candidate in stable pool order', async () => {
    const textbook = new TextbookService();
    const targetIds = ['Early canonical target', 'Later canonical target'].map(
      (target) => conceptId('success', 15, target),
    );
    jest.spyOn(textbook, 'getConcepts').mockReturnValue([
      {
        unitName: '15단원',
        concepts: ['Early canonical target', 'Later canonical target'],
      },
    ]);
    const regenerator = new ExamRegeneratorService();
    jest
      .spyOn(regenerator, 'regenerateReferenceBatch')
      .mockImplementation(async (_client, requests, result) => {
        const request = requests[0];
        if (request !== undefined) {
          result.push(finalGenerationResult(request.selectedTemplate));
        }
      });
    const client = plannerClient((prompt, payloadAttempt) => {
      if (payloadAttempt >= 3) return undefined;
      return targetIds.find(
        (targetId) => targetId !== sourceTargetConceptId(prompt),
      );
    });
    const service = new ReferenceFrameGenerationService(textbook, regenerator, {
      createPlannerClient: () => client,
      createRegeneratorClient: regeneratorClient,
      readReferences: () => [
        sourceReference('sungjik:15:1', 1, ['Early canonical target']),
        sourceReference('sungjik:15:9', 9, ['Later canonical target']),
      ],
    });

    const drafts = await service.generate(
      'success',
      15,
      15,
      Difficulty.MIDDLE,
      1,
    );

    expect(drafts).toHaveLength(1);
    expect(
      client.create.mock.calls.filter(([request]) => {
        const prompt = JSON.parse(request.messages[1]?.content ?? '{}');
        return (
          prompt.task !==
          'Extract only the structural ReferenceFrame from the reference item.'
        );
      }),
    ).toHaveLength(4);
  });

  it('Given ten requested drafts and one rejected candidate, When the eleventh deterministic candidate is valid, Then returns the exact count in pool order', async () => {
    const textbook = new TextbookService();
    const replacementTargetId = conceptId(
      'success',
      15,
      'Later canonical target',
    );
    jest.spyOn(textbook, 'getConcepts').mockReturnValue([
      {
        unitName: '15단원',
        concepts: ['Career values', 'Later canonical target'],
      },
    ]);
    const regenerator = new ExamRegeneratorService();
    jest
      .spyOn(regenerator, 'regenerateReferenceBatch')
      .mockImplementation(async (_client, requests, result) => {
        const request = requests[0];
        if (request !== undefined) {
          result.push(finalGenerationResult(request.selectedTemplate));
        }
      });
    const client = plannerClient((prompt) =>
      prompt.requiredSource.sourceId.includes('candidate-10')
        ? replacementTargetId
        : undefined,
    );
    const service = new ReferenceFrameGenerationService(textbook, regenerator, {
      createPlannerClient: () => client,
      createRegeneratorClient: regeneratorClient,
      readReferences: () => orderedReferenceCandidates(11),
    });

    const drafts = await service.generate(
      'success',
      15,
      15,
      Difficulty.MIDDLE,
      10,
    );

    expect(drafts).toHaveLength(10);
    expect(drafts.at(-1)?.lineage.source.sourceId).toContain('candidate-11');
  });

  it('Given independent valid candidates, When generating, Then pipelines candidates up to the configured concurrency while preserving pool order', async () => {
    const textbook = new TextbookService();
    jest
      .spyOn(textbook, 'getConcepts')
      .mockReturnValue([{ unitName: '15단원', concepts: ['Career values'] }]);
    const regenerator = new ExamRegeneratorService();
    let active = 0;
    let maxActive = 0;
    const generationOrder: string[] = [];
    jest
      .spyOn(regenerator, 'regenerateReferenceBatch')
      .mockImplementation(async (_client, requests, result) => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        const request = requests[0];
        if (request !== undefined) {
          generationOrder.push(request.reference.source.sourceId);
        }
        await new Promise<void>((resolve) => setTimeout(resolve, 5));
        active -= 1;
        if (request !== undefined) {
          result.push(finalGenerationResult(request.selectedTemplate));
        }
      });
    const service = new ReferenceFrameGenerationService(textbook, regenerator, {
      createPlannerClient: plannerClient,
      createRegeneratorClient: regeneratorClient,
      readReferences: () => orderedReferenceCandidates(4),
    });

    const drafts = await service.generate(
      'success',
      15,
      15,
      Difficulty.MIDDLE,
      4,
      undefined,
      undefined,
      { candidateConcurrency: 2 },
    );

    expect(maxActive).toBe(2);
    expect(drafts.map(({ lineage }) => lineage.source.sourceId)).toEqual(
      generationOrder,
    );
  });

  it('Given ten requested drafts and five planner rejections, When the remaining candidates are valid within the default allowance, Then returns ten drafts', async () => {
    const textbook = new TextbookService();
    const replacementTargetId = conceptId(
      'success',
      15,
      'Later canonical target',
    );
    jest.spyOn(textbook, 'getConcepts').mockReturnValue([
      {
        unitName: '15단원',
        concepts: ['Career values', 'Later canonical target'],
      },
    ]);
    const regenerator = new ExamRegeneratorService();
    jest
      .spyOn(regenerator, 'regenerateReferenceBatch')
      .mockImplementation(async (_client, requests, result) => {
        const request = requests[0];
        if (request !== undefined) {
          result.push(finalGenerationResult(request.selectedTemplate));
        }
      });
    const rejectedCandidateSourceIds = new Set<string>();
    const client = plannerClient((prompt) => {
      const sourceId = prompt.requiredSource.sourceId;
      if (
        !rejectedCandidateSourceIds.has(sourceId) &&
        rejectedCandidateSourceIds.size < 5
      ) {
        rejectedCandidateSourceIds.add(sourceId);
      }
      return rejectedCandidateSourceIds.has(sourceId)
        ? replacementTargetId
        : undefined;
    });
    const service = new ReferenceFrameGenerationService(textbook, regenerator, {
      createPlannerClient: () => client,
      createRegeneratorClient: regeneratorClient,
      readReferences: () => orderedReferenceCandidates(15),
    });

    const drafts = await service.generate(
      'success',
      15,
      15,
      Difficulty.MIDDLE,
      10,
    );

    expect(drafts).toHaveLength(10);
  });

  it('Given candidates beyond the default replacement allowance, When the first fifteen planner candidates are rejected, Then returns a redacted capped shortfall without reaching candidate sixteen', async () => {
    const textbook = new TextbookService();
    const replacementTargetId = conceptId(
      'success',
      15,
      'Later canonical target',
    );
    jest.spyOn(textbook, 'getConcepts').mockReturnValue([
      {
        unitName: '15단원',
        concepts: ['Career values', 'Later canonical target'],
      },
    ]);
    const regenerator = new ExamRegeneratorService();
    const regenerate = jest.spyOn(regenerator, 'regenerateReferenceBatch');
    const cappedCandidateSourceIds = new Set<string>();
    const client = plannerClient((prompt) => {
      const sourceId = prompt.requiredSource.sourceId;
      if (
        !cappedCandidateSourceIds.has(sourceId) &&
        cappedCandidateSourceIds.size < 15
      ) {
        cappedCandidateSourceIds.add(sourceId);
      }
      return cappedCandidateSourceIds.has(sourceId)
        ? replacementTargetId
        : undefined;
    });
    const service = new ReferenceFrameGenerationService(textbook, regenerator, {
      createPlannerClient: () => client,
      createRegeneratorClient: regeneratorClient,
      readReferences: () => orderedReferenceCandidates(25),
    });

    await expect(
      service.generate('success', 15, 15, Difficulty.MIDDLE, 10),
    ).rejects.toMatchObject({
      response: {
        code: 'REFERENCE_GENERATION_SHORTFALL',
        requestedCount: 10,
        generatedCount: 0,
        candidateCounts: {
          attempted: 15,
          eligible: 25,
          generated: 0,
          omittedEligibleCount: 10,
        },
        stageCounts: { source: 0, planner: 15, fidelity: 0 },
      },
    });
    expect(client.create).toHaveBeenCalledTimes(60);
    expect(regenerate).not.toHaveBeenCalled();
  });

  it('Given all eligible candidates reject locally, When the candidate cap is exhausted before an active deadline, Then returns a bounded redacted shortfall', async () => {
    const textbook = new TextbookService();
    const replacementTargetId = conceptId(
      'success',
      15,
      'Later canonical target',
    );
    jest.spyOn(textbook, 'getConcepts').mockReturnValue([
      {
        unitName: '15단원',
        concepts: ['Career values', 'Later canonical target'],
      },
    ]);
    const regenerator = new ExamRegeneratorService();
    const client = plannerClient(() => replacementTargetId);
    const service = new ReferenceFrameGenerationService(textbook, regenerator, {
      createPlannerClient: () => client,
      createRegeneratorClient: regeneratorClient,
      readReferences: () => orderedReferenceCandidates(16),
    });

    await expect(
      service.generate(
        'success',
        15,
        15,
        Difficulty.MIDDLE,
        10,
        undefined,
        undefined,
        {
          deadline: new ReferenceJobDeadline({
            deadlineAtMs: Date.now() + 60_000,
            minimumUsefulBudgets: {
              planner: 1,
              final_generator: 1,
              semantic_verifier: 1,
            },
          }),
        },
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'REFERENCE_GENERATION_SHORTFALL',
        candidateCounts: {
          attempted: 15,
          eligible: 16,
          generated: 0,
          omittedEligibleCount: 1,
        },
        stageCounts: { source: 0, planner: 15, fidelity: 0 },
      },
    });
    expect(client.create).toHaveBeenCalledTimes(60);
  });

  it('Given a cached candidate uses the only allowed scan, When its final generation rejects, Then a later eligible candidate is omitted', async () => {
    const textbook = new TextbookService();
    jest
      .spyOn(textbook, 'getConcepts')
      .mockReturnValue([{ unitName: '15단원', concepts: ['Career values'] }]);
    const regenerator = new ExamRegeneratorService();
    const regenerate = jest
      .spyOn(regenerator, 'regenerateReferenceBatch')
      .mockImplementation(async (_client, requests, result) => {
        const request = requests[0];
        if (request !== undefined) {
          result.push(finalGenerationResult(request.selectedTemplate));
        }
      });
    let cache: CachedFrame | null = null;
    const frameCacheRepo = {
      findOneBy: jest.fn(async () => cache),
      create: jest.fn((value: CachedFrame) => value),
      save: jest.fn(),
    };
    const client = plannerClient();
    const service = new ReferenceFrameGenerationService(
      textbook,
      regenerator,
      {
        createPlannerClient: () => client,
        createRegeneratorClient: regeneratorClient,
        readReferences: () => orderedReferenceCandidates(2),
      },
      undefined,
      frameCacheRepo as never,
    );

    const cachedDrafts = await service.generate(
      'success',
      15,
      15,
      Difficulty.MIDDLE,
      1,
    );
    const cachedFrame = cachedDrafts[0]?.cacheMutation;
    if (cachedFrame === undefined) {
      throw new Error('Expected a staged cache frame.');
    }
    cache = cachedFrame;
    client.create.mockClear();
    frameCacheRepo.findOneBy.mockClear();
    regenerate.mockResolvedValue(undefined);

    await expect(
      service.generate(
        'success',
        15,
        15,
        Difficulty.MIDDLE,
        1,
        undefined,
        undefined,
        { replacementAllowance: 0 },
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'REFERENCE_GENERATION_SHORTFALL',
        candidateCounts: {
          attempted: 1,
          eligible: 2,
          generated: 0,
          omittedEligibleCount: 1,
        },
        stageCounts: { source: 0, planner: 0, fidelity: 1 },
      },
    });
    expect(client.create).toHaveBeenCalledTimes(1);
    expect(frameCacheRepo.findOneBy).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['authentication', 401, 'authentication'],
    ['unsupported structured output', 400, 'request_configuration'],
  ])(
    'Given a provider %s failure, When planner work rejects, Then the failure remains fatal',
    async (_description, status, failureKind) => {
      const textbook = new TextbookService();
      jest
        .spyOn(textbook, 'getConcepts')
        .mockReturnValue([{ unitName: '15단원', concepts: ['Career values'] }]);
      const regenerator = new ExamRegeneratorService();
      const regenerate = jest.spyOn(regenerator, 'regenerateReferenceBatch');
      const create = jest.fn().mockRejectedValue({ status });
      const service = new ReferenceFrameGenerationService(
        textbook,
        regenerator,
        {
          createPlannerClient: () => ({
            chat: { completions: { create } },
          }),
          createRegeneratorClient: regeneratorClient,
          readReferences: () => orderedReferenceCandidates(1),
        },
      );

      await expect(
        service.generate('success', 15, 15, Difficulty.MIDDLE, 1),
      ).rejects.toMatchObject({
        response: {
          code: 'REFERENCE_GENERATION_PROVIDER_FAILURE',
          failureKind,
        },
      });
      expect(create).toHaveBeenCalledTimes(1);
      expect(regenerate).not.toHaveBeenCalled();
    },
  );

  it('Given source, planner, and fidelity failures exhaust the pool, When generating, Then returns only aggregate redacted stage counts', async () => {
    const textbook = new TextbookService();
    const targetIds = ['Early canonical target', 'Later canonical target'].map(
      (target) => conceptId('success', 15, target),
    );
    jest.spyOn(textbook, 'getConcepts').mockReturnValue([
      {
        unitName: '15단원',
        concepts: ['Early canonical target', 'Later canonical target'],
      },
    ]);
    const regenerator = new ExamRegeneratorService();
    jest
      .spyOn(regenerator, 'regenerateReferenceBatch')
      .mockResolvedValue(undefined);
    const client = plannerClient((prompt, payloadAttempt) => {
      if (payloadAttempt >= 3) return undefined;
      return targetIds.find(
        (targetId) => targetId !== sourceTargetConceptId(prompt),
      );
    });
    const service = new ReferenceFrameGenerationService(textbook, regenerator, {
      createPlannerClient: () => client,
      createRegeneratorClient: regeneratorClient,
      readReferences: () => [
        { source: { filename: 'invalid.pdf', unitNumber: 15 } },
        sourceReference('sungjik:15:1', 1, ['Early canonical target']),
        sourceReference('sungjik:15:9', 9, ['Later canonical target']),
      ],
    });

    await expect(
      service.generate('success', 15, 15, Difficulty.MIDDLE, 1),
    ).rejects.toMatchObject({
      response: {
        code: 'REFERENCE_GENERATION_SHORTFALL',
        requestedCount: 1,
        generatedCount: 0,
        stageCounts: { source: 1, planner: 1, fidelity: 1 },
      },
    });
  });

  it('Given an empty textbook unit with multiple source targets, When generating, Then resolves and preserves only the canonical source concept ID', async () => {
    const textbook = new TextbookService();
    jest.spyOn(textbook, 'getConcepts').mockReturnValue([]);
    const regenerator = new ExamRegeneratorService();
    let generatedRequests: readonly ReferenceVariantGenerationRequest[] = [];
    const client = plannerClient();
    jest
      .spyOn(regenerator, 'regenerateReferenceBatch')
      .mockImplementation(async (_client, requests, result) => {
        generatedRequests = requests;
        const request = requests[0];
        if (request !== undefined) {
          result.push(finalGenerationResult(request.selectedTemplate));
        }
      });
    const service = new ReferenceFrameGenerationService(textbook, regenerator, {
      createPlannerClient: () => client,
      createRegeneratorClient: regeneratorClient,
      readReferences: () => [
        sourceReference('kongil:15:8', 8, [
          '하인리히의 사고 예방 5단계',
          'Supporting concept',
        ]),
      ],
    });

    const drafts = await service.generate(
      'industry',
      15,
      15,
      Difficulty.MIDDLE,
      1,
    );

    expect(drafts).toHaveLength(1);
    expect(generatedRequests[0]?.payload.targetConceptIds).toEqual([
      conceptId('kongil', 15, '하인리히의 사고 예방 5단계'),
    ]);
    expect(generatedRequests[0]?.reference.targetConcepts).toEqual([
      '하인리히의 사고 예방 5단계',
    ]);
    const prompts = client.create.mock.calls.map(([request]) =>
      JSON.parse(request.messages[1]?.content ?? '{}'),
    );
    const framePrompt = prompts.find((prompt) => prompt.reference?.target);
    const payloadPrompt = prompts.find(
      (prompt) => prompt.requiredSourceTargetConceptId !== undefined,
    );
    expect(framePrompt.reference.target).toEqual({
      primaryConcept: '하인리히의 사고 예방 5단계',
      concepts: ['하인리히의 사고 예방 5단계'],
    });
    expect(payloadPrompt.requiredSourceTargetConceptId).toBe(
      conceptId('kongil', 15, '하인리히의 사고 예방 5단계'),
    );
  });

  it('does not reuse a wrong primary ID when deriving planner payload targets from the normalized source request', async () => {
    const base = validRequest();
    const primaryConcept = 'Non-default source concept';
    const reference = {
      ...base.reference,
      targetConcepts: [primaryConcept] as const,
      target: {
        primaryConcept,
        concepts: [primaryConcept] as const,
      },
    };
    const targetId = conceptId(base.subject, 1, primaryConcept);
    const request = {
      ...base,
      reference,
      selection: {
        ...base.selection,
        concepts: [{ concept: primaryConcept, unitNumbers: [1] }],
        references: [reference],
      },
      catalogConcepts: [
        {
          id: targetId,
          subject: base.subject,
          unit: 1,
          canonicalLabel: primaryConcept,
          ruleTags: ['comparison'] as const,
        },
      ],
    };

    const result = await planner(plannerClient()).plan(request);

    expect(result).toEqual(
      expect.objectContaining({
        kind: 'planned',
        payload: expect.objectContaining({ targetConceptIds: [targetId] }),
      }),
    );
  });

  it('Given a multi-target catalog source, When warming the frame cache, Then plans and persists only its normalized source target', async () => {
    const textbook = new TextbookService();
    const client = plannerClient();
    const frameCacheRepo = {
      findOneBy: jest.fn().mockResolvedValue(null),
      create: jest.fn((value) => value),
      save: jest.fn().mockResolvedValue(undefined),
    };
    const service = new ReferenceFrameGenerationService(
      textbook,
      new ExamRegeneratorService(),
      { createPlannerClient: () => client },
      {
        find: jest.fn().mockResolvedValue([
          {
            subject: 'sungjik',
            unitNumber: 15,
            sourcePayload: sourceReference('sungjik:15:1', 1, [
              '근로관계법',
              'Supporting concept',
            ]),
          },
        ]),
      },
      frameCacheRepo as never,
    );

    await expect(service.warmCachedFrames()).resolves.toMatchObject({
      created: 1,
      invalidSource: 0,
    });

    const plannerRequest = jest.mocked(client.chat.completions.create).mock
      .calls[0]?.[0];
    const prompt = JSON.parse(plannerRequest?.messages[1]?.content ?? '{}');
    expect(prompt.reference.target).toEqual({
      primaryConcept: '근로관계법',
      concepts: ['근로관계법'],
    });
    expect(frameCacheRepo.save).toHaveBeenCalledTimes(1);
  });

  it('Given a caller filter that excludes the source target, When selecting, Then exposes the typed shortfall reason before final generation', async () => {
    const textbook = new TextbookService();
    jest
      .spyOn(textbook, 'getConcepts')
      .mockReturnValue([
        { unitName: '15단원', concepts: ['Source concept', 'Other concept'] },
      ]);
    const regenerator = new ExamRegeneratorService();
    const generateFinal = jest.spyOn(regenerator, 'regenerateReferenceBatch');
    const service = new ReferenceFrameGenerationService(textbook, regenerator, {
      createPlannerClient: plannerClient,
      createRegeneratorClient: regeneratorClient,
      readReferences: () => [
        sourceReference('sungjik:15:1', 1, ['Source concept']),
      ],
    });

    await expect(
      service.generate('success', 15, 15, Difficulty.MIDDLE, 1, [
        'Other concept',
      ]),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'REFERENCE_SELECTION_SHORTFALL',
        reasons: expect.arrayContaining(['SOURCE_TARGET_EXCLUDED']),
      }),
    });

    expect(generateFinal).not.toHaveBeenCalled();
  });

  it.each([
    [
      'a stale contract version',
      (cache: CachedFrame): CachedFrame => ({
        ...cache,
        contractVersion: cache.contractVersion - 1,
      }),
    ],
    [
      'a stale embedded source hash',
      (cache: CachedFrame): CachedFrame => ({
        ...cache,
        frame: {
          ...cache.frame,
          source: { ...cache.frame.source, sourceHash: 'stale-source-hash' },
        },
      }),
    ],
  ] as const)(
    'Given %s, When generating, Then the cached frame is not reused',
    async (_description, invalidate) => {
      const harness = cacheReuseHarness();

      const drafts = await harness.service.generate(
        'success',
        1,
        1,
        Difficulty.MIDDLE,
        1,
        ['Career values'],
      );
      harness.commit(drafts);
      const cachedFrame = harness.cache();
      if (cachedFrame === null)
        throw new Error('Expected a saved cache frame.');

      harness.plannerCreate.mockClear();
      harness.replaceCache(invalidate(cachedFrame));

      await harness.service.generate('success', 1, 1, Difficulty.MIDDLE, 1, [
        'Career values',
      ]);

      expect(harness.plannerCreate).toHaveBeenCalledTimes(2);
    },
  );

  it('Given an uncached candidate cannot fund two planner calls, When a later cached candidate can fund its cheaper path, Then skips the uncached candidate and returns the cached draft', async () => {
    const textbook = new TextbookService();
    jest.spyOn(textbook, 'getConcepts').mockReturnValue([
      {
        unitName: '15단원',
        concepts: ['Early canonical target', 'Later canonical target'],
      },
    ]);
    const firstCandidate = sourceReference('sungjik:15:1', 1, [
      'Early canonical target',
    ]);
    const secondCandidate = sourceReference('sungjik:15:9', 9, [
      'Later canonical target',
    ]);
    const regenerator = new ExamRegeneratorService();
    jest
      .spyOn(regenerator, 'regenerateReferenceBatch')
      .mockImplementation(async (_client, requests, result) => {
        const request = requests[0];
        if (request !== undefined) {
          result.push(finalGenerationResult(request.selectedTemplate));
        }
      });
    const seedClient = plannerClient();
    const seedFrameCacheRepo = {
      findOneBy: jest.fn().mockResolvedValue(null),
      create: jest.fn((value: CachedFrame) => value),
      save: jest.fn(),
    };
    const seedService = new ReferenceFrameGenerationService(
      textbook,
      regenerator,
      {
        createPlannerClient: () => seedClient,
        createRegeneratorClient: regeneratorClient,
        readReferences: () => [firstCandidate],
      },
      undefined,
      seedFrameCacheRepo as never,
    );
    const seededDraft = await seedService.generate(
      'success',
      15,
      15,
      Difficulty.MIDDLE,
      1,
    );
    const cachedFrame = seededDraft[0]?.cacheMutation;
    if (cachedFrame === undefined) {
      throw new Error('Expected a cacheable deterministic reference frame.');
    }
    const client = plannerClient();
    const frameCacheRepo = {
      findOneBy: jest.fn(({ sourceId }: { sourceId: string }) =>
        sourceId === cachedFrame.sourceId ? cachedFrame : null,
      ),
      create: jest.fn((value: CachedFrame) => value),
      save: jest.fn(),
    };
    const service = new ReferenceFrameGenerationService(
      textbook,
      regenerator,
      {
        createPlannerClient: () => client,
        createRegeneratorClient: regeneratorClient,
        readReferences: () => [firstCandidate, secondCandidate],
      },
      undefined,
      frameCacheRepo as never,
    );

    const drafts = await service.generate(
      'success',
      15,
      15,
      Difficulty.MIDDLE,
      1,
      undefined,
      undefined,
      {
        deadline: new ReferenceJobDeadline({
          deadlineAtMs: Date.now() + 650,
          minimumUsefulBudgets: {
            planner: 100,
            final_generator: 200,
            semantic_verifier: 300,
          },
        }),
      },
    );

    expect(drafts).toHaveLength(1);
    expect(client.create).toHaveBeenCalledTimes(1);
    expect(frameCacheRepo.findOneBy).toHaveBeenCalledTimes(2);
  });

  it('Given no candidate can fund its remaining provider path, When candidate work is evaluated, Then returns a redacted shortfall without provider calls', async () => {
    const textbook = new TextbookService();
    jest
      .spyOn(textbook, 'getConcepts')
      .mockReturnValue([{ unitName: '15단원', concepts: ['Career values'] }]);
    const client = plannerClient();
    const regenerator = new ExamRegeneratorService();
    const regenerate = jest.spyOn(regenerator, 'regenerateReferenceBatch');
    const service = new ReferenceFrameGenerationService(textbook, regenerator, {
      createPlannerClient: () => client,
      createRegeneratorClient: regeneratorClient,
      readReferences: () => orderedReferenceCandidates(1),
    });

    await expect(
      service.generate(
        'success',
        15,
        15,
        Difficulty.MIDDLE,
        1,
        undefined,
        undefined,
        {
          deadline: new ReferenceJobDeadline({
            deadlineAtMs: Date.now() + 600,
            minimumUsefulBudgets: {
              planner: 100,
              final_generator: 200,
              semantic_verifier: 300,
            },
          }),
        },
      ),
    ).rejects.toMatchObject({
      response: {
        code: 'REFERENCE_GENERATION_SHORTFALL',
        candidateCounts: {
          attempted: 1,
          eligible: 1,
          generated: 0,
          omittedEligibleCount: 0,
        },
      },
    });

    expect(client.create).not.toHaveBeenCalled();
    expect(regenerate).not.toHaveBeenCalled();
  });
});
