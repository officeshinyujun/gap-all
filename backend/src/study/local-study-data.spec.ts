import type { DataSource, Repository } from 'typeorm';
import { TextbookService } from '../textbook/textbook.service';
import { StudyService } from './study.service';
import { StudyQuizGeneratorService } from './study-quiz-generator.service';

describe('local study data access', () => {
  const originalProvider = process.env.DB_PROVIDER;

  beforeEach(() => {
    process.env.DB_PROVIDER = 'local';
  });

  afterAll(() => {
    process.env.DB_PROVIDER = originalProvider;
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
