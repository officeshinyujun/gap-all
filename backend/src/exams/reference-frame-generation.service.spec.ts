import { Difficulty } from '../entities/exam-record.entity';
import { TextbookService } from '../textbook/textbook.service';
import {
  ExamRegeneratorService,
  type ReferenceGenerationClient,
} from './exam-regenerator.service';
import {
  AR_ARCHETYPE_FIXTURES,
  validFrameJson,
  validPayloadJson,
} from './reference-frame-planner.fixtures';
import { ReferenceFrameGenerationService } from './reference-frame-generation.service';
import { conceptId } from './reference-concept-catalog-resolver';
import type { ReferenceArchetype } from './reference-archetype';
import type { ReferenceFramePlannerClient } from './reference-frame-planner.types';
import type { StructuredTplName } from './tpl-schemas';
import type {
  ReferenceFrame,
  SourceIdentity,
  SubjectStyle,
  UnitRange,
} from './reference-frame.types';

function plannerClient(): ReferenceFramePlannerClient {
  return {
    chat: {
      completions: {
        create: jest.fn().mockImplementation((request) => {
          const prompt: unknown = JSON.parse(
            request.messages[1]?.content ?? '{}',
          );
          if (typeof prompt !== 'object' || prompt === null) {
            throw new Error('Missing planner prompt.');
          }
          const required = prompt as {
            requiredSource: SourceIdentity;
            requiredSubject: SubjectStyle;
            requiredUnitRange: UnitRange;
            requiredArchetype: ReferenceArchetype;
            requiredSourceTargetConceptId?: string;
            task: unknown;
          };
          const archetype = required.requiredArchetype;
          const answerCount =
            archetype.choiceTopology === 'combo_sets'
              ? archetype.viewItemCount
              : archetype.choiceCount;
          const answerOptions = Array.from(
            { length: answerCount },
            (_, index) => ({
              id: `option_${index + 1}`,
              verdict: index === 0,
              atomIds: [`atom_${(index % 3) + 1}`],
            }),
          );
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
                      required.requiredSourceTargetConceptId ??
                        conceptId('success', 1, 'Career values'),
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
        }),
      },
    },
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
  if (fixture === undefined) throw new Error(`Missing source fixture: ${sourceId}`);
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
    }, undefined, frameCacheRepo as never);

    const drafts = await service.generate('success', 1, 1, Difficulty.MIDDLE, 1, [
      'Career values',
    ]);

    expect(drafts).toHaveLength(1);
    expect(cacheSave).toHaveBeenCalledTimes(1);
    expect(frameCacheRepo.create).not.toHaveBeenCalled();
    expect(cacheSave.mock.calls[0]?.[0]?.contractVersion).toBe(301);
    expect(cacheSave.mock.calls[0]?.[0]?.archetypeFingerprint).toEqual(
      expect.stringMatching(/^3:/),
    );
    expect(cacheSave.mock.calls[0]?.[0]?.frame?.archetype).toEqual(
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

  it('rejects malformed catalog rows before invoking the generator', async () => {
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
        code: 'REFERENCE_SELECTION_SHORTFALL',
      }),
    });

    expect(generate).not.toHaveBeenCalled();
  });

  it.each(SOURCE_TARGET_FIXTURES)(
    'Given $sourceId, When generating a faithful variant, Then payload target 0 is its canonical source catalog ID',
    async (fixture) => {
      const textbook = new TextbookService();
      jest.spyOn(textbook, 'getConcepts').mockReturnValue([
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
      const service = new ReferenceFrameGenerationService(textbook, regenerator, {
        createPlannerClient: plannerClient,
        createRegeneratorClient: regeneratorClient,
        readReferences: () => [
          sourceReference(
            fixture.sourceId,
            fixture.questionNumber,
            [fixture.canonicalTarget],
          ),
        ],
      });
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
    jest.spyOn(textbook, 'getConcepts').mockReturnValue([
      { unitName: '15단원', concepts: ['Career values'] },
    ]);
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
        code: 'REFERENCE_FIDELITY_REJECTED',
        generatedCount: 0,
        requestedCount: 1,
      }),
    });
  });

  it.each([
    {
      name: 'an unknown source target',
      catalogConcepts: ['Known concept'],
      sourceTarget: 'Unknown concept',
      requestedConcepts: ['Unknown concept'],
      expectedCode: 'REFERENCE_SOURCE_CONCEPT_UNRESOLVED',
    },
    {
      name: 'a source target only cataloged outside the requested range',
      catalogConcepts: ['Archived concept'],
      sourceTarget: 'Archived concept',
      requestedConcepts: ['Archived concept'],
      expectedCode: 'REFERENCE_SOURCE_CONCEPT_UNRESOLVED',
      catalogUnit: 16,
    },
    {
      name: 'a caller filter that excludes the canonical source target',
      catalogConcepts: ['Source concept', 'Other concept'],
      sourceTarget: 'Source concept',
      requestedConcepts: ['Other concept'],
      expectedCode: 'REFERENCE_SELECTION_SHORTFALL',
    },
  ] as const)(
    'Given $name, When generating, Then rejects before final generation',
    async ({
      catalogConcepts,
      catalogUnit = 15,
      expectedCode,
      requestedConcepts,
      sourceTarget,
    }) => {
      const textbook = new TextbookService();
      jest.spyOn(textbook, 'getConcepts').mockReturnValue([
        { unitName: `${catalogUnit}단원`, concepts: [...catalogConcepts] },
      ]);
      const regenerator = new ExamRegeneratorService();
      const generateFinal = jest.spyOn(
        regenerator,
        'regenerateReferenceBatch',
      );
      const service = new ReferenceFrameGenerationService(textbook, regenerator, {
        createPlannerClient: plannerClient,
        createRegeneratorClient: regeneratorClient,
        readReferences: () => [
          sourceReference('sungjik:15:1', 1, [sourceTarget]),
        ],
      });

      await expect(
        service.generate(
          'success',
          15,
          15,
          Difficulty.MIDDLE,
          1,
          requestedConcepts,
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: expectedCode }),
      });

      expect(generateFinal).not.toHaveBeenCalled();
    },
  );

  it('Given a caller filter that excludes the source target, When selecting, Then exposes the typed shortfall reason before final generation', async () => {
    const textbook = new TextbookService();
    jest.spyOn(textbook, 'getConcepts').mockReturnValue([
      { unitName: '15단원', concepts: ['Source concept', 'Other concept'] },
    ]);
    const regenerator = new ExamRegeneratorService();
    const generateFinal = jest.spyOn(
      regenerator,
      'regenerateReferenceBatch',
    );
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

      await harness.service.generate('success', 1, 1, Difficulty.MIDDLE, 1, [
        'Career values',
      ]);
      const cachedFrame = harness.cache();
      if (cachedFrame === null) throw new Error('Expected a saved cache frame.');

      harness.plannerCreate.mockClear();
      harness.replaceCache(invalidate(cachedFrame));

      await harness.service.generate('success', 1, 1, Difficulty.MIDDLE, 1, [
        'Career values',
      ]);

      expect(harness.plannerCreate).toHaveBeenCalledTimes(2);
    },
  );
});
