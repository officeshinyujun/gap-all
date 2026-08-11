import { buildStudyInsights, type StudyNoteCandidate } from './study-insights';

describe('buildStudyInsights', () => {
  const candidate: StudyNoteCandidate = {
    subjectSlug: 'success',
    unitNumber: 4,
    title: '기업 형태와 사회적 책임',
    aliases: ['기업의 형태', '사회적 기업'],
    comparisonAxes: ['책임 범위'],
    formatCandidates: ['사례 판단형'],
    trapCandidates: ['영리·비영리 구분'],
  };

  it('uses note-derived labels only when backed by reference questions', () => {
    const result = buildStudyInsights(
      'success',
      4,
      [
        {
          logicalSourceId: 'source-1',
          unitNumber: 4,
          concepts: ['사회적 기업'],
          family: 'case',
          certified: true,
          supported: true,
          source: '성직_4단원_문제.pdf',
          questionNumber: 2,
        },
        {
          logicalSourceId: 'source-2',
          unitNumber: 4,
          concepts: ['사회적 기업'],
          family: 'case',
          certified: true,
          supported: true,
          source: '2024_수능',
          questionNumber: 15,
        },
      ],
      [candidate],
    );

    expect(result.patterns).toEqual([
      expect.objectContaining({
        title: '기업 형태와 사회적 책임',
        frequency: 2,
        confidence: 'high',
        referenceQuestionIds: ['source-1', 'source-2'],
        keyChecks: ['책임 범위'],
      }),
    ]);
  });

  it('does not emit a note-only candidate', () => {
    const result = buildStudyInsights('success', 4, [], [candidate]);
    expect(result.patterns).toEqual([]);
  });

  it('counts unique references and sorts ties deterministically', () => {
    const result = buildStudyInsights(
      'success',
      4,
      [
        {
          logicalSourceId: 'source-a-1',
          unitNumber: 4,
          concepts: ['가 개념'],
          family: 'concept',
          certified: true,
          supported: true,
          source: 'a.pdf',
          questionNumber: 1,
        },
        {
          logicalSourceId: 'source-a-1',
          unitNumber: 4,
          concepts: ['가 개념'],
          family: 'concept',
          certified: true,
          supported: true,
          source: 'a.pdf',
          questionNumber: 1,
        },
        {
          logicalSourceId: 'source-a-2',
          unitNumber: 4,
          concepts: ['가 개념'],
          family: 'case',
          certified: true,
          supported: true,
          source: 'b.pdf',
          questionNumber: 2,
        },
        {
          logicalSourceId: 'source-b-1',
          unitNumber: 4,
          concepts: ['나 개념'],
          family: 'concept',
          certified: true,
          supported: true,
          source: 'c.pdf',
          questionNumber: 3,
        },
        {
          logicalSourceId: 'source-c-1',
          unitNumber: 4,
          concepts: ['다 개념'],
          family: 'concept',
          certified: true,
          supported: true,
          source: 'd.pdf',
          questionNumber: 4,
        },
      ],
      [],
    );

    expect(result.patterns.map(({ title, frequency }) => ({ title, frequency }))).toEqual([
      { title: '가 개념', frequency: 2 },
      { title: '나 개념', frequency: 1 },
      { title: '다 개념', frequency: 1 },
    ]);
  });

  it('adds only reference-backed must-know blocks', () => {
    const result = buildStudyInsights(
      'success',
      4,
      [
        {
          logicalSourceId: 'source-economic-1',
          unitNumber: 4,
          concepts: ['경제 주체'],
          family: 'case',
          certified: true,
          supported: true,
          source: '성직_4단원_문제.pdf',
          questionNumber: 1,
        },
        {
          logicalSourceId: 'source-economic-2',
          unitNumber: 4,
          concepts: ['기업의 역할'],
          family: 'case',
          certified: true,
          supported: true,
          source: '성직_4단원_문제.pdf',
          questionNumber: 4,
        },
      ],
      [],
    );

    expect(result.mustKnowBlocks).toEqual([
      expect.objectContaining({
        id: 'success-4-economic-actors',
        title: '경제 주체별 역할',
        referenceQuestionIds: ['source-economic-1', 'source-economic-2'],
        reviewStatus: 'verified',
      }),
    ]);
  });
});
