import type { DataSource, Repository } from 'typeorm';
import { TextbookService } from '../textbook/textbook.service';
import { StudyService } from './study.service';
import { StudyQuizGeneratorService } from './study-quiz-generator.service';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('local study data access', () => {
  const originalProvider = process.env.DB_PROVIDER;

  beforeEach(() => {
    process.env.DB_PROVIDER = 'local';
  });

  afterAll(() => {
    process.env.DB_PROVIDER = originalProvider;
    delete process.env.STUDY_USE_OFFLINE_CONCEPT_TAGS;
  });

  afterEach(() => {
    delete process.env.STUDY_USE_OFFLINE_CONCEPT_TAGS;
  });

  it('contains complete local pilot content for all six Unit 1 tags', () => {
    const file = path.resolve(__dirname, '../../../textbook/_v2/rebuild/success/concept-tags-offline.json');
    const cards = JSON.parse(fs.readFileSync(file, 'utf8')) as Array<Record<string, any>>;
    const unitOneCards = cards.filter((card) => card._offline?.unitNumber === 1);
    expect(unitOneCards.map((card) => card.name)).toEqual([
      '직업 가치관(내재적/외재적)',
      '홀랜드(Holland) 직업 흥미 유형',
      '직업의 요건(계속성, 경제성, 사회성,',
      '근무 방식(유연근로시간제, 교대근무,',
      '직업 생활의 중요성(개인적·사회적 차원)',
      '하렌(Harren)의 진로 의사 결정 유형',
    ]);
    for (const card of unitOneCards.filter((card) => card.contentStatus === 'complete')) {
      expect(card).toMatchObject({
        name: expect.any(String),
        rank: expect.any(Number),
        frequency: expect.any(Number),
        sources: expect.any(Array),
        description: expect.any(String),
        keyPoints: expect.any(Array),
        examTips: expect.any(Array),
        conceptContent: expect.any(String),
        relatedQuestions: expect.any(Array),
        sourceTag: expect.any(String),
        contentStatus: 'complete',
      });
      expect(card.description.trim()).not.toBe('');
      expect(card.keyPoints.length).toBeGreaterThan(0);
      expect(card.conceptContent.trim()).not.toBe('');
    }
    expect(unitOneCards.find((card) => card.name === '하렌(Harren)의 진로 의사 결정 유형')).toMatchObject({
      contentStatus: 'needs_review',
    });
  });

  it('reads concepts, units, and summation cards through parameterized local queries', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'unit-1', unit_number: 1 }])
      .mockResolvedValueOnce([{ unit_id: 'unit-1', concept_name: '개념 A' }])
      .mockResolvedValueOnce([{ unit_number: 1, text_payload: '교과서 본문' }])
      .mockResolvedValueOnce([{ id: 'unit-1' }])
      .mockResolvedValueOnce([
        { title: '요약', body: '요약 본문', key_concepts: ['개념 A'] },
      ]);
    const service = new TextbookService(
      {} as never,
      { query } as unknown as DataSource,
    );

    await expect(service.getConcepts('success', 1, 1)).resolves.toEqual([
      { unitName: '1단원', concepts: ['개념 A'] },
    ]);
    await expect(service.getUnits('success', 1, 1)).resolves.toEqual([
      { unit_name: '1단원', text_payload: '교과서 본문' },
    ]);
    await expect(service.getSummationMd('success', 1)).resolves.toBe(
      JSON.stringify({
        cards: [
          {
            content: {
              title: '요약',
              body: '요약 본문',
              key_concepts: ['개념 A'],
            },
          },
        ],
      }),
    );
    expect(query.mock.calls[0][0]).toContain('subject = $1');
  });

  it('uses local concept-card fields when returning frequency concepts', async () => {
    const cards = Array.from({ length: 5 }, (_, index) => ({
      rank: index + 1,
      name: `개념 ${index + 1}`,
      frequency: 1,
      sources: ['기출'],
      definition: `정의 ${index + 1}`,
      key_points: [`핵심 ${index + 1}`],
      textbook_excerpt: `원문 ${index + 1}`,
      enriched_definition: `상세 정의 ${index + 1}`,
      comparisonTable: index === 0 ? '| 구분 | 값 |\n|---|---|\n| 핵심 | 필수 |' : '',
      importantNumbers: index === 0 ? [5, '5조 원'] : [],
      realQuestion: {
        questionData: {
          source_exam: '기출',
          number: index + 1,
          stem: `문제 ${index + 1}`,
          options: ['①', '②'],
          answer: '①',
        },
        conceptHighlightV2: {
          stimulusClues: [],
          optionAnalysis: [],
          solvingFlow: [{ step: 1, action: '개념을 적용한다.' }],
          takeaway: `핵심 ${index + 1}`,
        },
      },
    }));
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'unit-1' }])
        .mockResolvedValueOnce(
          cards.map((card) => ({ concept_name: card.name, sort_order: card.rank - 1 })),
        )
        .mockResolvedValueOnce(cards),
    } as unknown as DataSource;
    const service = new StudyService(
      {} as Repository<any>,
      {} as Repository<any>,
      {} as Repository<any>,
      {} as Repository<any>,
      {} as never,
      dataSource,
      {} as Repository<any>,
      {} as Repository<any>,
      {} as Repository<any>,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.getFrequencyConcept('success', 1);

    expect(result.concepts).toHaveLength(5);
    expect(result.concepts[0]).toMatchObject({
      name: '개념 1',
      description: '상세 정의 1',
      keyPoints: ['핵심 1'],
      sampleQuestion: expect.objectContaining({
        questionSource: '기출',
        questionNumber: 1,
      }),
      conceptHighlightV2: expect.objectContaining({ takeaway: '핵심 1' }),
    });
    expect(result.concepts[0].conceptContent).toContain('정의 1');
    expect(result.concepts[0].conceptContent).toContain('원문 1');
    expect(result.concepts[0].examMustKnow).toMatchObject({
      type: 'comparison',
      summary: expect.stringContaining('핵심'),
      mustRemember: expect.arrayContaining(['중요 수치: 5']),
    });
  });

  it('falls back to frequency data when fewer than five local cards exist', async () => {
    const cards = Array.from({ length: 4 }, (_, index) => ({
      rank: index + 1,
      name: `개념 ${index + 1}`,
    }));
    const frequencyData = {
      concepts: [
        {
          name: '빈출 개념',
          description: '출제 요약',
          conceptContent: '## 개념 정의\n\n정확한 개념 정의\n\n## 시험 출제 포인트\n\n- 출제 포인트',
          sampleQuestion: { question_text: '문제' },
        },
      ],
    };
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'unit-1' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce(cards)
        .mockResolvedValueOnce([{ frequency_data: frequencyData }]),
    } as unknown as DataSource;
    const service = new StudyService(
      {} as Repository<any>,
      {} as Repository<any>,
      {} as Repository<any>,
      {} as Repository<any>,
      {} as never,
      dataSource,
      {} as Repository<any>,
      {} as Repository<any>,
      {} as Repository<any>,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.getFrequencyConcept('success', 1)).resolves.toEqual({
      concepts: [
        expect.objectContaining({
          name: '빈출 개념',
          description: '정확한 개념 정의',
          sampleQuestion: { question_text: '문제' },
        }),
      ],
    });
  });

  it('stays offline and rebuilds a missing local sequence from textbook tags', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'unit-1' }])
      .mockResolvedValueOnce([{ concept_name: '대표 태그', sort_order: 0 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const aiUnitProfileService = { getProfile: jest.fn() };
    const service = new StudyService(
      {} as Repository<any>,
      {} as Repository<any>,
      {} as Repository<any>,
      {} as Repository<any>,
      {} as never,
      { query } as unknown as DataSource,
      {} as Repository<any>,
      {} as Repository<any>,
      {} as Repository<any>,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      aiUnitProfileService as never,
    );

    await expect(service.getFrequencyConcept('success', 1)).resolves.toMatchObject({
      concepts: [{ name: '대표 태그', contentStatus: 'missing' }],
    });
    expect(aiUnitProfileService.getProfile).not.toHaveBeenCalled();
  });

  it('uses the offline artifact so every canonical tag reaches study', async () => {
    process.env.STUDY_USE_OFFLINE_CONCEPT_TAGS = 'true';
    const query = jest.fn()
      .mockResolvedValueOnce([{ id: 'unit-1' }])
      .mockResolvedValueOnce([
        { concept_name: '직업 생활의 의미와 중요성', sort_order: 0 },
        { concept_name: '홀랜드(Holland) 직업 흥미 유형', sort_order: 1 },
      ]);
    const service = new StudyService(
      {} as Repository<any>, {} as Repository<any>, {} as Repository<any>, {} as Repository<any>,
      {} as never, { query } as unknown as DataSource, {} as Repository<any>, {} as Repository<any>,
      {} as Repository<any>, {} as never, {} as never, {} as never, {} as never,
    );

    const result = await service.getFrequencyConcept('success', 1);

    expect(result.concepts.map((concept: any) => concept.name)).toEqual([
      '직업 가치관(내재적/외재적)',
      '홀랜드(Holland) 직업 흥미 유형',
      '직업의 요건(계속성, 경제성, 사회성,',
      '근무 방식(유연근로시간제, 교대근무,',
      '직업 생활의 중요성(개인적·사회적 차원)',
      '하렌(Harren)의 진로 의사 결정 유형',
    ]);
    expect(result.concepts.every((concept: any) => concept._offline === undefined || concept.name)).toBe(true);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('does not assign an equally matching card to an arbitrary representative tag', async () => {
    const service = new StudyService(
      {} as Repository<any>,
      {} as Repository<any>,
      {} as Repository<any>,
      {} as Repository<any>,
      {} as never,
      {} as DataSource,
      {} as Repository<any>,
      {} as Repository<any>,
      {} as Repository<any>,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const aligned = (service as any).alignFrequencyConcepts(
      { concepts: [{ name: 'career gamma' }] },
      [
        { name: 'career alpha', sortOrder: 0 },
        { name: 'career beta', sortOrder: 1 },
      ],
    );

    expect(aligned.concepts.map((concept: any) => concept.name)).toEqual([
      'career alpha',
      'career beta',
    ]);
    expect(aligned.concepts.every((concept: any) => concept.contentStatus === 'missing')).toBe(true);
  });

  it('rebuilds the study sequence from representative tags and hides legacy-only cards', async () => {
    const cards = [
      { rank: 1, name: '대표 태그 1의 정의', definition: '정의 1', key_points: ['핵심 1'] },
      { rank: 2, name: '레거시 전용 카드', definition: '노출하지 않을 내용' },
      { rank: 3, name: '대표 태그 2', definition: '정의 2', key_points: ['핵심 2'] },
      { rank: 4, name: '기타 카드 A' },
      { rank: 5, name: '기타 카드 B' },
    ];
    const dataSource = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ id: 'unit-1' }])
        .mockResolvedValueOnce([
          { concept_name: '대표 태그 1', sort_order: 0 },
          { concept_name: '대표 태그 2', sort_order: 1 },
        ])
        .mockResolvedValueOnce(cards),
    } as unknown as DataSource;
    const service = new StudyService(
      {} as Repository<any>,
      {} as Repository<any>,
      {} as Repository<any>,
      {} as Repository<any>,
      {} as never,
      dataSource,
      {} as Repository<any>,
      {} as Repository<any>,
      {} as Repository<any>,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    const result = await service.getFrequencyConcept('success', 1);

    expect(result.concepts.map((concept: any) => concept.name)).toEqual([
      '대표 태그 1',
      '대표 태그 2',
    ]);
    expect(result.concepts[0].subtopics).toEqual([{ name: '대표 태그 1의 정의' }]);
  });

  it('returns and writes quiz cache through the local database', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce([{ data: [{ id: 1, sentence_template: '문장' }] }])
      .mockResolvedValueOnce([]);
    const service = new StudyQuizGeneratorService(
      {} as Repository<any>,
      {} as TextbookService,
      {} as never,
      { query } as unknown as DataSource,
    );

    await expect(service.generateBlankQuestions('success', 1, 10)).resolves.toEqual([
      { id: 1, sentence_template: '문장' },
    ]);
    await (service as any).writeCache('success', 1, 'blank', 10, [{ id: 2 }]);

    expect(query.mock.calls[0][0]).toContain('SELECT data FROM quiz_cache');
    expect(query.mock.calls[1][0]).toContain('ON CONFLICT');
    expect(query.mock.calls[1][1][4]).toBe(JSON.stringify([{ id: 2 }]));
  });
});
