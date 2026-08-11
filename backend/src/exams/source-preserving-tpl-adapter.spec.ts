import { Difficulty } from '../entities/exam-record.entity';
import type { AiQuestionBlueprint, AiQuestionCandidate } from './ai-blueprint.types';
import { materializeAiQuestion, materializeSourcePreservingFallback } from './ai-question-materializer';
import { validateAiQuestion } from './ai-question-validator';
import { materializeSourcePreservingTpl } from './source-preserving-tpl-adapter';
import type { StructuredTplName } from './tpl-schemas';

const sourceByTemplate: Record<
  Exclude<StructuredTplName, 'TPL_CASE_DIAGNOSTIC_FRAME' | 'TPL_CONVERSATIONAL_FLOW' | 'TPL_COMPARATIVE_MATRIX' | 'TPL_FORMAL_DOCUMENT' | 'TPL_ARTICLE' | 'TPL_ANNOUNCEMENT' | 'TPL_SEQUENTIAL_WORKFLOW'>,
  Record<string, unknown>
> = {
  TPL_DIGITAL_FORUM_INTERFACE: {
    forum_name: '진로 상담 게시판',
    main_post: { author: '학생', title: '질문', content: '직업 가치관이 궁금합니다.' },
    comments: [],
  },
  TPL_INSTRUCTIONAL_SCENE: {
    instructor: { id: 'teacher', text: '학습 목표를 확인한다.' },
    canvas_content: { type: 'text', data: '직업의 요건' },
    students: [],
  },
  TPL_PROMOTIONAL_CANVAS: {
    slogan: '안전한 작업장',
    bullets: ['보호 장비를 착용한다.'],
    visual_elements: [],
    missing_part: '',
  },
  TPL_INCIDENT_REPORT: {
    title: '화재 사고 보고서', incident_type: '화재', date: '2026-03-10',
    location: '서울시', overview: '화재 발생', cause: '배선 문제',
    damage: '피해 없음', response: '진화', prevention: '점검 강화',
    timeline: [{ time: '14:23', event: '신고 접수' }],
  },
  TPL_REPORT: {
    title: '실적 보고서', author: '경영지원팀', date: '2026-01-20',
    metadata: [{ label: '기업명', value: '한국기업' }],
    sections: [{ heading: '요약', content: '매출은 15% 증가했다.', table: { headers: ['분기'], rows: [['1Q']] } }],
    conclusion: '성장이 기대된다.',
  },
  TPL_QUANTITATIVE_CHART: {
    chart_type: 'bar', axes: [{ key: 'hours', label: '근무 시간', max: 40 }],
    datasets: [{ label: 'A 기업', values: [35] }],
  },
  TPL_STATISTICS: {
    title: '취업률 통계', category_label: '연령대', value_label: '취업률',
    data_entries: [{ category: '20대', value: '75.2%', sub_entries: [] }],
    unit: '%', source: '통계청', period: '2025', summary: '청년층 통계',
  },
};

const templates = Object.keys(sourceByTemplate) as Array<keyof typeof sourceByTemplate>;

function blueprint(template: StructuredTplName, source: string): AiQuestionBlueprint {
  return {
    id: `source-${template}`,
    family: 'case', subjectId: 'subject-1', unitNumber: 1, targetConcept: '직무 분석',
    template, caseContext: source, invariantFacts: [], mutableSlots: [],
    answerRule: { id: 'source-answer', description: 'server-owned source answer' },
    answerIndex: 1, distractorRule: { id: 'source-distractors', description: 'server-owned' },
    distractorConcepts: ['직업 윤리', '직업 훈련', '인사 평가', '경력 개발'],
    difficulty: Difficulty.MIDDLE, sourceEvidence: [{ sourceId: 'source', sourceHash: 'hash', unitNumber: 1 }],
    blueprintVersion: 'v3',
  };
}

describe('source-preserving adapters for disabled TPLs', () => {
  it.each(templates)('preserves the exact certified %s stimulus', (template) => {
    const source = JSON.stringify(sourceByTemplate[template]);
    expect(materializeSourcePreservingTpl(template, source)).toEqual(sourceByTemplate[template]);

    const candidate: AiQuestionCandidate = {
      stemText: '제시된 자료의 조건을 판단한다.',
      explanationText: '직무 분석은 자료의 조건을 파악하는 것이다.',
    };
    const materialized = materializeAiQuestion(blueprint(template, source), candidate);
    expect(materialized.kind).toBe('accepted');
    if (materialized.kind === 'rejected') return;
    expect(materialized.question.stimulusData).toEqual(sourceByTemplate[template]);
    expect(materialized.question.correctAnswer).toBe(1);
    expect(validateAiQuestion(blueprint(template, source), candidate, materialized.question)).toEqual({
      passed: true,
      validatorVersion: 'v3',
    });
  });

  it('rejects malformed or non-renderable source instead of inventing structure', () => {
    expect(materializeSourcePreservingTpl('TPL_QUANTITATIVE_CHART', '{"axes":[]}')).toBeNull();
    expect(materializeSourcePreservingTpl('TPL_STATISTICS', 'not-json')).toBeNull();
  });

  it('uses source-preserving fallback only when the certified source remains safe', () => {
    const source = JSON.stringify(sourceByTemplate.TPL_REPORT);
    const result = materializeSourcePreservingFallback(
      { ...blueprint('TPL_REPORT', source), sourceFactAnchors: ['15%'] },
      { stemText: 'missing source fact', explanationText: '직무 분석은 자료의 조건을 파악하는 것이다.' },
    );

    expect(result.kind).toBe('accepted');
  });

  it('rejects source-preserving fallback when the certified source is not renderable', () => {
    expect(materializeSourcePreservingFallback(
      blueprint('TPL_REPORT', '{"title":"incomplete"}'),
      { stemText: 'missing source fact', explanationText: '설명' },
    )).toEqual(expect.objectContaining({ kind: 'rejected' }));
  });
});
