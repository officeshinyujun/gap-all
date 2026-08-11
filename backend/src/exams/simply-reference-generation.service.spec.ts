import { Difficulty } from '../entities/exam-record.entity';
import {
  SimplyReferenceGenerationService,
  simplyReferenceFingerprint,
} from './simply-reference-generation.service';

function sourcePayload(
  index: number,
  viewItems: readonly string[] = [],
): Record<string, unknown> {
  return {
    source: { filename: `source-${index}.pdf`, unitNumber: 1 },
    questionNumber: index,
    stem: `Question ${index}`,
    stimulus: `Reference stimulus ${index}`,
    choices:
      viewItems.length === 0
        ? ['① one', '② two', '③ three', '④ four', '⑤ five']
        : ['① ㄱ', '② ㄴ', '③ ㄱ, ㄴ', '④ ㄴ, ㄷ', '⑤ ㄱ, ㄴ, ㄷ'],
    viewItems,
    targetConcepts: ['Career values'],
  };
}

type PromptSource = Readonly<{
  sourceId: string;
  sourceHash: string;
  selectedTemplate: string;
}>;

function stimulusDataForTemplate(template: string): Record<string, unknown> {
  if (template === 'TPL_COMPARATIVE_MATRIX') {
    return {
      headers: [{ id: 'criterion', label: '조건' }],
      rows: [{ id: 'row-1', cells: ['결과'] }],
      selection_chips: [],
    };
  }
  return {
    case_profile: { name: 'A씨', context: '직업생활 사례' },
    narrative: 'A씨가 근로 조건을 확인하는 상황이다.',
    check_items: [],
  };
}

function responseFor(sources: readonly PromptSource[]): string {
  return JSON.stringify({
    questions: sources.map((source) => ({
      ...source,
      questionStem: `Generated question ${source.sourceId}`,
      stimulusDataJson: JSON.stringify(
        stimulusDataForTemplate(source.selectedTemplate),
      ),
      comboBlock: null,
      choices: ['① one', '② two', '③ three', '④ four', '⑤ five'],
      correctAnswer: 1,
      explanation: 'Because the source evidence supports choice one.',
    })),
  });
}

function responseForDifferentTemplate(
  sources: readonly PromptSource[],
): string {
  return JSON.stringify({
    questions: sources.map((source) => ({
      ...source,
      questionStem: `Generated question ${source.sourceId}`,
      stimulusDataJson: JSON.stringify(
        source.selectedTemplate === 'TPL_FORMAL_DOCUMENT'
          ? stimulusDataForTemplate('TPL_CASE_DIAGNOSTIC_FRAME')
          : {
              doc_type: '안내문',
              header_info: {},
              paragraphs: [
                { content: '원본 근거를 보존한 안내문 내용입니다.' },
              ],
            },
      ),
      comboBlock: null,
      choices: ['① one', '② two', '③ three', '④ four', '⑤ five'],
      correctAnswer: 1,
      explanation: 'Because the source evidence supports choice one.',
    })),
  });
}

function comboResponseFor(sources: readonly PromptSource[]): string {
  return JSON.stringify({
    questions: sources.map((source) => ({
      ...source,
      questionStem: `Generated combo question ${source.sourceId}`,
      stimulusDataJson: JSON.stringify(
        stimulusDataForTemplate(source.selectedTemplate),
      ),
      comboBlock: {
        title: '<보기>',
        items: [
          { key: 'ㄱ', text: '첫 번째 판단 내용' },
          { key: 'ㄴ', text: '두 번째 판단 내용' },
          { key: 'ㄷ', text: '세 번째 판단 내용' },
        ],
      },
      choices: ['① ㄱ', '② ㄴ', '③ ㄱ, ㄴ', '④ ㄴ, ㄷ', '⑤ ㄱ, ㄴ, ㄷ'],
      correctAnswer: 3,
      explanation: 'ㄱ과 ㄴ이 옳고 ㄷ은 조건에 맞지 않는다.',
    })),
  });
}

function legacyResponseFor(sources: readonly PromptSource[]): string {
  return JSON.stringify({
    questions: sources.map((source, index) => ({
      source_id: source.sourceId,
      source_hash: source.sourceHash,
      render_ready: {
        question_stem: `Generated question ${index + 1}`,
        stimulus_data: stimulusDataForTemplate(source.selectedTemplate),
        options_list: ['① one', '② two', '③ three', '④ four', '⑤ five'],
        combo_block: null,
      },
      correct_answer: 1,
      explanation: {
        judgment: 'Because the source evidence supports choice one.',
      },
    })),
  });
}

function sourcesFromPrompt(prompt: string): readonly PromptSource[] {
  const parsed: unknown = JSON.parse(prompt);
  if (!isRecord(parsed) || !Array.isArray(parsed.sources)) {
    throw new Error('Expected a simple reference prompt with sources.');
  }
  return parsed.sources.map((source) => {
    if (
      !isRecord(source) ||
      typeof source.sourceId !== 'string' ||
      typeof source.sourceHash !== 'string' ||
      typeof source.selectedTemplate !== 'string'
    ) {
      throw new Error(
        'Expected every simple reference source to have an id and hash.',
      );
    }
    return {
      sourceId: source.sourceId,
      sourceHash: source.sourceHash,
      selectedTemplate: source.selectedTemplate,
    };
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

describe('SimplyReferenceGenerationService', () => {
  it('Given ten eligible sources, When generating simply_reference questions, Then sends two distinct five-source batches', async () => {
    const batchSourceIds: string[][] = [];
    const completeBatch = jest.fn(async (prompt: string) => {
      const sources = sourcesFromPrompt(prompt);
      batchSourceIds.push(sources.map((source) => source.sourceId));
      return responseFor(sources);
    });
    const service = {
      textbookService: {
        getConcepts: jest
          .fn()
          .mockReturnValue([
            { unitName: '1단원', concepts: ['Career values'] },
          ]),
      },
      catalogReader: {
        find: jest.fn().mockResolvedValue(
          Array.from({ length: 10 }, (_, index) => ({
            unitNumber: 1,
            sourcePayload: sourcePayload(index + 1),
          })),
        ),
      },
      dependencies: { completeBatch },
    };

    const drafts =
      await SimplyReferenceGenerationService.prototype.generate.call(
        service,
        'success',
        1,
        1,
        Difficulty.MIDDLE,
        10,
      );

    expect(completeBatch).toHaveBeenCalledTimes(2);
    expect(batchSourceIds.map((sourceIds) => sourceIds.length)).toEqual([5, 5]);
    expect(new Set(batchSourceIds.flat()).size).toBe(10);
    expect(drafts).toHaveLength(10);
    expect(
      new Set(drafts.map((draft) => draft.lineage.source.sourceId)).size,
    ).toBe(10);
    expect(drafts.map((draft) => draft.lineage.batchOrdinal)).toEqual([
      1, 1, 1, 1, 1, 2, 2, 2, 2, 2,
    ]);
  });

  it('Given answer-key verified sources, When source-preserving generation is enabled, Then stores the original question without calling the model', async () => {
    const completeBatch = jest.fn();
    const officialSource = {
      ...sourcePayload(1, [
        'ㄱ. 첫 번째 판단 내용',
        'ㄴ. 두 번째 판단 내용',
        'ㄷ. 세 번째 판단 내용',
      ]),
      stem: '다음 자료를 통해 알 수 있는 내용으로 옳은 것은?',
      stimulus:
        'A씨가 원문 자료의 수치와 조건을 검토한다.\n두 번째 원문 문단이다.',
      choices: ['① ㄱ', '② ㄴ', '③ ㄱ, ㄴ', '④ ㄴ, ㄷ', '⑤ ㄱ, ㄴ, ㄷ'],
      correctAnswer: 3,
    };
    const service = {
      textbookService: {
        getConcepts: jest
          .fn()
          .mockReturnValue([
            { unitName: '1단원', concepts: ['Career values'] },
          ]),
      },
      catalogReader: {
        find: jest
          .fn()
          .mockResolvedValue([
            { unitNumber: 1, sourcePayload: officialSource },
          ]),
      },
      dependencies: { completeBatch },
    };

    const drafts =
      await SimplyReferenceGenerationService.prototype.generate.call(
        service,
        'success',
        1,
        1,
        Difficulty.MIDDLE,
        1,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { sourcePreserving: true, generationNonce: 'verified-source' },
      );

    expect(completeBatch).not.toHaveBeenCalled();
    expect(drafts).toHaveLength(1);
    const stimulusData = drafts[0]?.result.render_ready.stimulus_data as {
      case_profile: { name: string; context: string };
      narrative: string;
    };
    const firstSourceLine = 'A씨가 원문 자료의 수치와 조건을 검토한다.';
    expect(
      [stimulusData.case_profile.context, stimulusData.narrative].filter((text) =>
        text.includes(firstSourceLine),
      ),
    ).toHaveLength(1);
    expect(drafts[0]).toMatchObject({
      result: {
        metadata: { recommended_template: 'TPL_CASE_DIAGNOSTIC_FRAME' },
        render_ready: {
          question_stem: officialSource.stem,
          stimulus_data: {
            case_profile: { name: 'A씨', context: '' },
            narrative: officialSource.stimulus,
            check_items: [],
          },
          options_list: officialSource.choices,
          combo_block: {
            title: '<보기>',
            items: [
              { key: 'ㄱ', text: '첫 번째 판단 내용' },
              { key: 'ㄴ', text: '두 번째 판단 내용' },
              { key: 'ㄷ', text: '세 번째 판단 내용' },
            ],
          },
        },
        correct_answer: 3,
      },
      lineage: {
        generationPath: 'simply_reference',
        selectedTemplate: 'TPL_CASE_DIAGNOSTIC_FRAME',
      },
    });
  });

  it('round-robins Study pattern sources and keeps internal pattern tags', async () => {
    const completeBatch = jest.fn();
    const sources = [1, 2, 3].map((index) => ({
      ...sourcePayload(index, ['ㄱ. 첫 번째 판단 내용', 'ㄴ. 두 번째 판단 내용', 'ㄷ. 세 번째 판단 내용']),
      stem: '다음 자료를 통해 알 수 있는 내용으로 옳은 것은?',
      stimulus: `A씨가 원문 자료 ${index}의 조건을 검토한다.`,
      choices: ['① ㄱ', '② ㄴ', '③ ㄱ, ㄴ', '④ ㄴ, ㄷ', '⑤ ㄱ, ㄴ, ㄷ'],
      correctAnswer: 3,
    }));
    const sourceIds = sources.map(
      (source) => `success:1:${(source.source as { filename: string }).filename}:${source.questionNumber}`,
    );
    const service = {
      textbookService: {
        getConcepts: jest.fn().mockReturnValue([
          { unitName: '1단원', concepts: ['Career values'] },
        ]),
      },
      catalogReader: {
        find: jest.fn().mockResolvedValue(
          sources.map((source) => ({ unitNumber: 1, sourcePayload: source })),
        ),
      },
      dependencies: { completeBatch },
    };

    const drafts = await SimplyReferenceGenerationService.prototype.generate.call(
      service,
      'success',
      1,
      1,
      Difficulty.MIDDLE,
      3,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        sourcePreserving: true,
        studyPatternGroups: [[sourceIds[0], sourceIds[1]], [sourceIds[2]]],
        studyPatternTags: {
          [sourceIds[0]]: { examPatternId: 'pattern-a', questionFormat: '사례 판단형' },
          [sourceIds[1]]: { examPatternId: 'pattern-a', questionFormat: '사례 판단형' },
          [sourceIds[2]]: { examPatternId: 'pattern-b', questionFormat: '개념 확인' },
        },
      },
    );

    expect(completeBatch).not.toHaveBeenCalled();
    expect(drafts.map((draft) => draft.lineage.source.sourceId)).toEqual([
      sourceIds[0],
      sourceIds[2],
      sourceIds[1],
    ]);
    expect(drafts.map((draft) => draft.lineage.examPatternId)).toEqual([
      'pattern-a',
      'pattern-b',
      'pattern-a',
    ]);
  });

  it('Given sources without answer keys, When source-preserving generation is enabled, Then fails before calling the model', async () => {
    const completeBatch = jest.fn();
    const service = {
      textbookService: {
        getConcepts: jest
          .fn()
          .mockReturnValue([
            { unitName: '1단원', concepts: ['Career values'] },
          ]),
      },
      catalogReader: {
        find: jest
          .fn()
          .mockResolvedValue([
            { unitNumber: 1, sourcePayload: sourcePayload(1) },
          ]),
      },
      dependencies: { completeBatch },
    };

    await expect(
      SimplyReferenceGenerationService.prototype.generate.call(
        service,
        'success',
        1,
        1,
        Difficulty.MIDDLE,
        1,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { sourcePreserving: true },
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'REFERENCE_SOURCE_REEXTRACTION_REQUIRED',
      }),
    });
    expect(completeBatch).not.toHaveBeenCalled();
  });

  it('Given a complete delimiter-separated source table, When source-preserving generation is enabled, Then retains every table cell', async () => {
    const completeBatch = jest.fn();
    const tableSource = {
      ...sourcePayload(2),
      stem: '다음 표를 보고 옳은 내용을 고르시오.',
      stimulus: '구분 | A | B\n특징 | 원문 A | 원문 B',
      correctAnswer: 1,
    };
    const service = {
      textbookService: {
        getConcepts: jest.fn().mockReturnValue([
          { unitName: '1단원', concepts: ['Career values'] },
        ]),
      },
      catalogReader: {
        find: jest.fn().mockResolvedValue([
          { unitNumber: 1, sourcePayload: tableSource },
        ]),
      },
      dependencies: { completeBatch },
    };

    const drafts = await SimplyReferenceGenerationService.prototype.generate.call(
      service,
      'success',
      1,
      1,
      Difficulty.MIDDLE,
      1,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { sourcePreserving: true },
    );

    expect(completeBatch).not.toHaveBeenCalled();
    expect(drafts).toMatchObject([
      {
        result: {
          metadata: { recommended_template: 'TPL_COMPARATIVE_MATRIX' },
          render_ready: {
            stimulus_data: {
              headers: [
                { id: 'column-1', label: '구분 ' },
                { id: 'column-2', label: ' A ' },
                { id: 'column-3', label: ' B' },
              ],
              rows: [
                { id: 'row-1', cells: ['특징 ', ' 원문 A ', ' 원문 B'] },
              ],
              selection_chips: [],
            },
          },
        },
      },
    ]);
  });

  it('Given a model response that omits a selected source, When generating a batch, Then repairs only that source', async () => {
    let callCount = 0;
    const service = {
      textbookService: {
        getConcepts: jest
          .fn()
          .mockReturnValue([
            { unitName: '1단원', concepts: ['Career values'] },
          ]),
      },
      catalogReader: {
        find: jest.fn().mockResolvedValue(
          Array.from({ length: 5 }, (_, index) => ({
            unitNumber: 1,
            sourcePayload: sourcePayload(index + 1),
          })),
        ),
      },
      dependencies: {
        completeBatch: jest.fn(async (prompt: string) => {
          callCount += 1;
          const sources = sourcesFromPrompt(prompt);
          return responseFor(callCount === 1 ? sources.slice(0, 4) : sources);
        }),
      },
    };

    const drafts =
      await SimplyReferenceGenerationService.prototype.generate.call(
        service,
        'success',
        1,
        1,
        Difficulty.MIDDLE,
        5,
      );

    expect(drafts).toHaveLength(5);
    expect(callCount).toBe(2);
  });

  it('Given valid data for a different template, When generating a simply-reference question, Then rejects it and repairs with the selected template', async () => {
    let callCount = 0;
    const service = {
      textbookService: {
        getConcepts: jest
          .fn()
          .mockReturnValue([
            { unitName: '1단원', concepts: ['Career values'] },
          ]),
      },
      catalogReader: {
        find: jest
          .fn()
          .mockResolvedValue([
            { unitNumber: 1, sourcePayload: sourcePayload(1) },
          ]),
      },
      dependencies: {
        completeBatch: jest.fn(async (prompt: string) => {
          callCount += 1;
          const sources = sourcesFromPrompt(prompt);
          return callCount === 1
            ? responseForDifferentTemplate(sources)
            : responseFor(sources);
        }),
      },
    };

    const drafts =
      await SimplyReferenceGenerationService.prototype.generate.call(
        service,
        'success',
        1,
        1,
        Difficulty.MIDDLE,
        1,
      );

    expect(callCount).toBe(2);
    expect(drafts[0]?.result.metadata.recommended_template).toBe(
      drafts[0]?.lineage.selectedTemplate,
    );
  });

  it('Given a legacy-shaped model response, When generating a batch, Then parses its question fields', async () => {
    const service = {
      textbookService: {
        getConcepts: jest
          .fn()
          .mockReturnValue([
            { unitName: '1단원', concepts: ['Career values'] },
          ]),
      },
      catalogReader: {
        find: jest.fn().mockResolvedValue(
          Array.from({ length: 1 }, (_, index) => ({
            unitNumber: 1,
            sourcePayload: sourcePayload(index + 1),
          })),
        ),
      },
      dependencies: {
        completeBatch: jest.fn(async (prompt: string) =>
          legacyResponseFor(sourcesFromPrompt(prompt)),
        ),
      },
    };

    const drafts =
      await SimplyReferenceGenerationService.prototype.generate.call(
        service,
        'success',
        1,
        1,
        Difficulty.MIDDLE,
        1,
      );

    expect(drafts).toHaveLength(1);
    expect(drafts[0]?.result.render_ready.question_stem).toBe(
      'Generated question 1',
    );
  });

  it('Given invalid batch and singleton outputs, When recovery is exhausted, Then fails with a bounded retry error', async () => {
    const completeBatch = jest.fn(async () => '{"questions":[]}');
    const service = {
      textbookService: {
        getConcepts: jest
          .fn()
          .mockReturnValue([
            { unitName: '1단원', concepts: ['Career values'] },
          ]),
      },
      catalogReader: {
        find: jest
          .fn()
          .mockResolvedValue([
            { unitNumber: 1, sourcePayload: sourcePayload(1) },
          ]),
      },
      dependencies: { completeBatch },
    };

    await expect(
      SimplyReferenceGenerationService.prototype.generate.call(
        service,
        'success',
        1,
        1,
        Difficulty.MIDDLE,
        1,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'SIMPLY_REFERENCE_GENERATION_INVALID_OUTPUT',
        reason: 'RETRY_EXHAUSTED',
      }),
    });
    expect(completeBatch).toHaveBeenCalledTimes(3);
  });

  it('Given a reference with ㄱㄴㄷ view items, When the initial result omits its combo block, Then repairs and preserves the view format', async () => {
    let callCount = 0;
    const completeBatch = jest.fn(async (prompt: string) => {
      callCount += 1;
      const sources = sourcesFromPrompt(prompt);
      return callCount === 1 ? responseFor(sources) : comboResponseFor(sources);
    });
    const service = {
      textbookService: {
        getConcepts: jest
          .fn()
          .mockReturnValue([
            { unitName: '1단원', concepts: ['Career values'] },
          ]),
      },
      catalogReader: {
        find: jest.fn().mockResolvedValue([
          {
            unitNumber: 1,
            sourcePayload: sourcePayload(1, [
              'ㄱ. 첫 번째 원본 판단',
              'ㄴ. 두 번째 원본 판단',
              'ㄷ. 세 번째 원본 판단',
            ]),
          },
        ]),
      },
      dependencies: { completeBatch },
    };

    const drafts =
      await SimplyReferenceGenerationService.prototype.generate.call(
        service,
        'success',
        1,
        1,
        Difficulty.MIDDLE,
        1,
      );

    expect(completeBatch).toHaveBeenCalledTimes(2);
    expect(drafts[0]?.result.render_ready.combo_block).toEqual({
      title: '<보기>',
      items: [
        { key: 'ㄱ', text: '첫 번째 판단 내용' },
        { key: 'ㄴ', text: '두 번째 판단 내용' },
        { key: 'ㄷ', text: '세 번째 판단 내용' },
      ],
    });
  });

  it('Given generated stimulus data that violates the source TPL, When generating, Then repairs it with the same template contract', async () => {
    let callCount = 0;
    const completeBatch = jest.fn(async (prompt: string) => {
      callCount += 1;
      const sources = sourcesFromPrompt(prompt);
      if (callCount === 1) {
        return JSON.stringify({
          questions: sources.map((source) => ({
            ...source,
            questionStem: 'Generated question',
            stimulusDataJson: JSON.stringify({ body: 'wrong TPL shape' }),
            comboBlock: null,
            choices: ['① one', '② two', '③ three', '④ four', '⑤ five'],
            correctAnswer: 1,
            explanation: 'Choice one is correct.',
          })),
        });
      }
      return responseFor(sources);
    });
    const service = {
      textbookService: {
        getConcepts: jest
          .fn()
          .mockReturnValue([
            { unitName: '1단원', concepts: ['Career values'] },
          ]),
      },
      catalogReader: {
        find: jest
          .fn()
          .mockResolvedValue([
            { unitNumber: 1, sourcePayload: sourcePayload(1) },
          ]),
      },
      dependencies: { completeBatch },
    };

    const drafts =
      await SimplyReferenceGenerationService.prototype.generate.call(
        service,
        'success',
        1,
        1,
        Difficulty.MIDDLE,
        1,
      );

    expect(completeBatch).toHaveBeenCalledTimes(2);
    expect(drafts[0]?.result.metadata.recommended_template).toBe(
      'TPL_CASE_DIAGNOSTIC_FRAME',
    );
    expect(drafts[0]?.result.render_ready.stimulus_data).toMatchObject({
      case_profile: expect.any(Object),
      narrative: expect.any(String),
    });
  });

  it('Given a contract source table, When the provider returns an unrelated A/B cost matrix, Then rejects it before accepting a draft', async () => {
    const completeBatch = jest.fn(async (prompt: string) => {
      const sources = sourcesFromPrompt(prompt);
      return JSON.stringify({
        questions: sources.map((source) => ({
          ...source,
          questionStem: '두 방안 중 비용이 더 적은 것은?',
          stimulusDataJson: JSON.stringify({
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
          }),
          comboBlock: null,
          choices: ['① A안', '② B안', '③ 둘 다', '④ 알 수 없음', '⑤ 해당 없음'],
          correctAnswer: 2,
          explanation: 'B안의 초기 비용이 더 적다.',
        })),
      });
    });
    const service = {
      textbookService: {
        getConcepts: jest
          .fn()
          .mockReturnValue([
            { unitName: '1단원', concepts: ['Career values'] },
          ]),
      },
      catalogReader: {
        find: jest.fn().mockResolvedValue([
          {
            unitNumber: 1,
            sourcePayload: {
              ...sourcePayload(1),
              stimulus:
                '| 구분 | 내용 |\n| --- | --- |\n| 기업체명 | ㈜△△식품 |\n| 1일 근로 시간 | 08:30~17:30 |\n| 임금 | 시간당 12,000원 |',
            },
          },
        ]),
      },
      dependencies: { completeBatch },
    };

    await expect(
      SimplyReferenceGenerationService.prototype.generate.call(
        service,
        'success',
        1,
        1,
        Difficulty.MIDDLE,
        1,
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'SIMPLY_REFERENCE_GENERATION_INVALID_OUTPUT',
        reason: 'RETRY_EXHAUSTED',
      }),
    });

    expect(completeBatch).toHaveBeenCalledTimes(3);
    const initialPrompt = JSON.parse(completeBatch.mock.calls[0]?.[0] ?? '{}');
    expect(initialPrompt.sources[0].selectedTemplate).toBe(
      'TPL_COMPARATIVE_MATRIX',
    );
    expect(JSON.stringify(initialPrompt)).not.toContain('A안');
    expect(JSON.stringify(initialPrompt)).not.toContain('B안');
    expect(JSON.stringify(initialPrompt)).not.toContain('500만 원');
    expect(JSON.stringify(initialPrompt)).not.toContain('300만 원');
    expect(initialPrompt.sources[0].matrixGroundingTerms).toEqual(
      expect.arrayContaining(['기업체명', '1일 근로 시간', '임금']),
    );
  });

  it('Given mixed eligible references, When sources are selected automatically, Then prioritizes structured ㄱㄴㄷ material analysis', async () => {
    const selectedSourceIds: string[][] = [];
    const completeBatch = jest.fn(async (prompt: string) => {
      const sources = sourcesFromPrompt(prompt);
      selectedSourceIds.push(sources.map((source) => source.sourceId));
      return comboResponseFor(sources);
    });
    const service = {
      textbookService: {
        getConcepts: jest
          .fn()
          .mockReturnValue([
            { unitName: '1단원', concepts: ['Career values'] },
          ]),
      },
      catalogReader: {
        find: jest.fn().mockResolvedValue([
          { unitNumber: 1, sourcePayload: sourcePayload(1) },
          {
            unitNumber: 1,
            sourcePayload: {
              ...sourcePayload(2, [
                'ㄱ. 표의 첫 번째 판단',
                'ㄴ. 표의 두 번째 판단',
                'ㄷ. 표의 세 번째 판단',
              ]),
              stimulus: '| 기준 | 결과 |\n| --- | --- |\n| 조건 | 결과 |',
            },
          },
        ]),
      },
      dependencies: { completeBatch },
    };

    await SimplyReferenceGenerationService.prototype.generate.call(
      service,
      'success',
      1,
      1,
      Difficulty.HIGH,
      1,
    );

    expect(selectedSourceIds).toEqual([['success:1:source-2.pdf:2']]);
  });

  it('Given an excluded catalog source, When generating, Then only the eligible replacement reaches the provider', async () => {
    const selectedSourceIds: string[][] = [];
    const completeBatch = jest.fn(async (prompt: string) => {
      const sources = sourcesFromPrompt(prompt);
      selectedSourceIds.push(sources.map((source) => source.sourceId));
      return comboResponseFor(sources);
    });
    const service = {
      textbookService: {
        getConcepts: jest
          .fn()
          .mockReturnValue([
            { unitName: '10단원', concepts: ['Career values'] },
          ]),
      },
      catalogReader: {
        find: jest.fn().mockResolvedValue([
          {
            unitNumber: 10,
            sourcePayload: {
              source: {
                filename: '성직_10단원_문제.pdf',
                unitNumber: 10,
              },
              questionNumber: 10,
              stem: 'NCS 탐색 화면에 대한 설명으로 옳은 것은?',
              stimulus: '키워드 | 코드 | NCS | 분류보기 | 기술서 출력',
              choices: ['① 하나', '② 둘', '③ 셋', '④ 넷', '⑤ 다섯'],
              targetConcepts: ['Career values'],
            },
          },
          {
            unitNumber: 10,
            sourcePayload: {
              ...sourcePayload(2, [
                'ㄱ. 표의 첫 번째 판단',
                'ㄴ. 표의 두 번째 판단',
                'ㄷ. 표의 세 번째 판단',
              ]),
              stimulus: '| 기준 | 결과 |\n| --- | --- |\n| 조건 | 결과 |',
            },
          },
        ]),
      },
      dependencies: { completeBatch },
    };

    await SimplyReferenceGenerationService.prototype.generate.call(
      service,
      'success',
      10,
      10,
      Difficulty.MIDDLE,
      1,
    );

    expect(selectedSourceIds).toEqual([['success:10:source-2.pdf:2']]);
  });

  it('Given equally structured sources, When selecting automatically, Then ranks information units and conditions deterministically', async () => {
    const selectedSourceIds: string[][] = [];
    const service = {
      textbookService: {
        getConcepts: jest
          .fn()
          .mockReturnValue([
            { unitName: '1단원', concepts: ['Career values'] },
          ]),
      },
      catalogReader: {
        find: jest.fn().mockResolvedValue([
          {
            unitNumber: 1,
            sourcePayload: {
              ...sourcePayload(1),
              stimulus: 'A씨는 직업을 선택한다.',
            },
          },
          {
            unitNumber: 1,
            sourcePayload: {
              ...sourcePayload(2),
              stimulus: 'A씨는 직업을 선택한다.\n조건을 확인한다.',
            },
          },
          {
            unitNumber: 1,
            sourcePayload: {
              ...sourcePayload(3),
              stimulus: 'A씨는 조건을 확인한다.\n다만 예외를 확인한다.',
            },
          },
        ]),
      },
      dependencies: {
        completeBatch: jest.fn(async (prompt: string) => {
          const sources = sourcesFromPrompt(prompt);
          selectedSourceIds.push(sources.map((source) => source.sourceId));
          return responseFor(sources);
        }),
      },
    };

    await SimplyReferenceGenerationService.prototype.generate.call(
      service,
      'success',
      1,
      1,
      Difficulty.MIDDLE,
      1,
    );

    expect(selectedSourceIds).toEqual([['success:1:source-3.pdf:3']]);
  });

  it('Given explicit source IDs, When generating, Then preserves caller order instead of seeded ranking order', async () => {
    const selectedSourceIds: string[][] = [];
    const sourceIds = ['success:1:source-2.pdf:2', 'success:1:source-1.pdf:1'];
    const service = {
      textbookService: {
        getConcepts: jest
          .fn()
          .mockReturnValue([
            { unitName: '1단원', concepts: ['Career values'] },
          ]),
      },
      catalogReader: {
        find: jest.fn().mockResolvedValue([
          { unitNumber: 1, sourcePayload: sourcePayload(1) },
          {
            unitNumber: 1,
            sourcePayload: {
              ...sourcePayload(2),
              stimulus: 'A씨는 근무 조건을 확인한다.',
            },
          },
        ]),
      },
      dependencies: {
        completeBatch: jest.fn(async (prompt: string) => {
          const sources = sourcesFromPrompt(prompt);
          selectedSourceIds.push(sources.map((source) => source.sourceId));
          return responseFor(sources);
        }),
      },
    };

    await SimplyReferenceGenerationService.prototype.generate.call(
      service,
      'success',
      1,
      1,
      Difficulty.MIDDLE,
      2,
      undefined,
      sourceIds,
    );

    expect(selectedSourceIds).toEqual([sourceIds]);
  });

  it('Given a user has seen a source, When generating automatically, Then selects unseen sources first', async () => {
    const selectedSourceIds: string[][] = [];
    const service = {
      textbookService: {
        getConcepts: jest
          .fn()
          .mockReturnValue([
            { unitName: '1단원', concepts: ['Career values'] },
          ]),
      },
      catalogReader: {
        find: jest.fn().mockResolvedValue([
          { unitNumber: 1, sourcePayload: sourcePayload(1) },
          { unitNumber: 1, sourcePayload: sourcePayload(2) },
          { unitNumber: 1, sourcePayload: sourcePayload(3) },
        ]),
      },
      dependencies: {
        completeBatch: jest.fn(async (prompt: string) => {
          const sources = sourcesFromPrompt(prompt);
          selectedSourceIds.push(sources.map((source) => source.sourceId));
          return responseFor(sources);
        }),
      },
    };

    await SimplyReferenceGenerationService.prototype.generate.call(
      service,
      'success',
      1,
      1,
      Difficulty.MIDDLE,
      2,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      {
        generationNonce: 'repeat-2',
        previousSourceIds: ['success:1:source-3.pdf:3'],
      },
    );

    expect(selectedSourceIds[0]).not.toContain('success:1:source-3.pdf:3');
  });

  it('Given a previous visible fingerprint, When the first output repeats it, Then repairs that source with a new nonce-backed variation', async () => {
    let attempt = 0;
    const source = sourcePayload(1);
    const fingerprint = simplyReferenceFingerprint({
      questionStem: 'Generated question success:1:source-1.pdf:1',
      stimulusData: stimulusDataForTemplate('TPL_CASE_DIAGNOSTIC_FRAME'),
      optionsList: ['① one', '② two', '③ three', '④ four', '⑤ five'],
      comboBlock: null,
    });
    const service = {
      textbookService: {
        getConcepts: jest
          .fn()
          .mockReturnValue([
            { unitName: '1단원', concepts: ['Career values'] },
          ]),
      },
      catalogReader: {
        find: jest
          .fn()
          .mockResolvedValue([{ unitNumber: 1, sourcePayload: source }]),
      },
      dependencies: {
        completeBatch: jest.fn(async (prompt: string) => {
          attempt += 1;
          const sources = sourcesFromPrompt(prompt);
          const response = responseFor(sources);
          return attempt === 1
            ? response
            : response.replace(
                'Generated question success:1:source-1.pdf:1',
                'Different question success:1:source-1.pdf:1',
              );
        }),
      },
    };

    const drafts =
      await SimplyReferenceGenerationService.prototype.generate.call(
        service,
        'success',
        1,
        1,
        Difficulty.MIDDLE,
        1,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { generationNonce: 'repeat-3', previousFingerprints: [fingerprint] },
      );

    expect(attempt).toBe(2);
    expect(drafts[0]?.result.render_ready.question_stem).toBe(
      'Different question success:1:source-1.pdf:1',
    );
    expect(drafts[0]?.lineage.generationNonce).toBe(
      'repeat-3:retry:success:1:source-1.pdf:1:1',
    );
  });

  it('Given a duplicate visible output and an unselected source, When generating, Then replaces the duplicate source', async () => {
    const requestedSourceIds: string[][] = [];
    let attempt = 0;
    const fingerprint = simplyReferenceFingerprint({
      questionStem: 'Prior visible question',
      stimulusData: stimulusDataForTemplate('TPL_CASE_DIAGNOSTIC_FRAME'),
      optionsList: ['① one', '② two', '③ three', '④ four', '⑤ five'],
      comboBlock: null,
    });
    const service = {
      textbookService: {
        getConcepts: jest
          .fn()
          .mockReturnValue([
            { unitName: '1단원', concepts: ['Career values'] },
          ]),
      },
      catalogReader: {
        find: jest.fn().mockResolvedValue([
          { unitNumber: 1, sourcePayload: sourcePayload(1) },
          { unitNumber: 1, sourcePayload: sourcePayload(2) },
        ]),
      },
      dependencies: {
        completeBatch: jest.fn(async (prompt: string) => {
          const sources = sourcesFromPrompt(prompt);
          requestedSourceIds.push(sources.map((source) => source.sourceId));
          attempt += 1;
          if (attempt > 1) return responseFor(sources);
          return JSON.stringify({
            questions: sources.map((source) => ({
              ...source,
              questionStem: 'Prior visible question',
              stimulusDataJson: JSON.stringify(
                stimulusDataForTemplate(source.selectedTemplate),
              ),
              comboBlock: null,
              choices: ['① one', '② two', '③ three', '④ four', '⑤ five'],
              correctAnswer: 1,
              explanation: 'Prior explanation.',
            })),
          });
        }),
      },
    };

    const drafts =
      await SimplyReferenceGenerationService.prototype.generate.call(
        service,
        'success',
        1,
        1,
        Difficulty.MIDDLE,
        1,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { generationNonce: 'replacement', previousFingerprints: [fingerprint] },
      );

    expect(requestedSourceIds).toHaveLength(2);
    expect(requestedSourceIds[1]?.[0]).not.toBe(requestedSourceIds[0]?.[0]);
    expect(drafts[0]?.lineage.source.sourceId).toBe(requestedSourceIds[1]?.[0]);
  });

  it('Given duplicate output and no replacement source, When variations are exhausted, Then returns a structured variant error', async () => {
    const fingerprint = simplyReferenceFingerprint({
      questionStem: 'Prior visible question',
      stimulusData: stimulusDataForTemplate('TPL_CASE_DIAGNOSTIC_FRAME'),
      optionsList: ['① one', '② two', '③ three', '④ four', '⑤ five'],
      comboBlock: null,
    });
    const completeBatch = jest.fn(async (prompt: string) => {
      const sources = sourcesFromPrompt(prompt);
      return JSON.stringify({
        questions: sources.map((source) => ({
          ...source,
          questionStem: 'Prior visible question',
          stimulusDataJson: JSON.stringify(
            stimulusDataForTemplate(source.selectedTemplate),
          ),
          comboBlock: null,
          choices: ['① one', '② two', '③ three', '④ four', '⑤ five'],
          correctAnswer: 1,
          explanation: 'Prior explanation.',
        })),
      });
    });
    const service = {
      textbookService: {
        getConcepts: jest
          .fn()
          .mockReturnValue([
            { unitName: '1단원', concepts: ['Career values'] },
          ]),
      },
      catalogReader: {
        find: jest
          .fn()
          .mockResolvedValue([
            { unitNumber: 1, sourcePayload: sourcePayload(1) },
          ]),
      },
      dependencies: { completeBatch },
    };

    await expect(
      SimplyReferenceGenerationService.prototype.generate.call(
        service,
        'success',
        1,
        1,
        Difficulty.MIDDLE,
        1,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        { generationNonce: 'exhausted', previousFingerprints: [fingerprint] },
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        code: 'SIMPLY_REFERENCE_VARIANT_EXHAUSTED',
        reason: 'VARIANT_EXHAUSTED',
      }),
    });
    expect(completeBatch).toHaveBeenCalledTimes(3);
  });

  it('Given a combo claim repeated in the stem, When generating, Then repairs so claims appear only in the combo block', async () => {
    let callCount = 0;
    const service = {
      textbookService: {
        getConcepts: jest
          .fn()
          .mockReturnValue([
            { unitName: '1단원', concepts: ['Career values'] },
          ]),
      },
      catalogReader: {
        find: jest.fn().mockResolvedValue([
          {
            unitNumber: 1,
            sourcePayload: sourcePayload(1, [
              'ㄱ. 첫 번째 판단 내용',
              'ㄴ. 두 번째 판단 내용',
              'ㄷ. 세 번째 판단 내용',
            ]),
          },
        ]),
      },
      dependencies: {
        completeBatch: jest.fn(async (prompt: string) => {
          callCount += 1;
          const response = JSON.parse(
            comboResponseFor(sourcesFromPrompt(prompt)),
          ) as {
            questions: Array<Record<string, unknown>>;
          };
          const firstQuestion = response.questions[0];
          if (callCount === 1 && firstQuestion !== undefined) {
            firstQuestion.questionStem =
              '첫 번째 판단 내용에 대한 설명으로 옳은 것은?';
          }
          return JSON.stringify(response);
        }),
      },
    };

    const drafts =
      await SimplyReferenceGenerationService.prototype.generate.call(
        service,
        'success',
        1,
        1,
        Difficulty.INTERGRATE,
        1,
      );

    expect(callCount).toBe(2);
    expect(
      drafts[0]?.result.render_ready.combo_block?.items.map((item) => item.key),
    ).toEqual(['ㄱ', 'ㄴ', 'ㄷ']);
  });
});
