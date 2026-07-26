import { StimulusNormalizer } from './stimulus-normalizer';

const normalizer = new StimulusNormalizer();

describe('StimulusNormalizer TPL renderability', () => {
  const renderableFixtures: Array<[string, Record<string, unknown>]> = [
    [
      'TPL_COMPARATIVE_MATRIX',
      {
        headers: [{ id: 'type', label: '구분' }],
        rows: [{ id: 'a', cells: ['A 기업'] }],
        selection_chips: [],
      },
    ],
    [
      'TPL_FORMAL_DOCUMENT',
      {
        doc_type: '안내문',
        header_info: {
          title: '채용 안내',
          date: '2026.01.01',
          author: '인사팀',
        },
        paragraphs: [{ sub_title: '대상', content: '지원 자격을 확인한다.' }],
        footnotes: [],
      },
    ],
    [
      'TPL_CONVERSATIONAL_FLOW',
      {
        participants: [{ id: 'a', name: 'A씨', role: '상담자' }],
        messages: [
          { p_id: 'a', text: '상담 내용을 확인합니다.', timestamp: '' },
        ],
      },
    ],
    [
      'TPL_CASE_DIAGNOSTIC_FRAME',
      {
        case_profile: { name: 'A씨', context: '근무 상황' },
        narrative: 'A씨는 주 5일 근무 계약을 체결했다.',
        check_items: [],
      },
    ],
    [
      'TPL_SEQUENTIAL_WORKFLOW',
      {
        orientation: 'vertical',
        steps: [
          {
            idx: 1,
            label: '접수',
            desc: '신청서를 제출한다.',
            is_missing: false,
          },
        ],
      },
    ],
    [
      'TPL_INSTRUCTIONAL_SCENE',
      {
        instructor: { id: 'teacher', text: '오늘의 학습 목표를 확인한다.' },
        canvas_content: { type: 'text', data: '직업의 요건' },
        students: [],
      },
    ],
    [
      'TPL_DIGITAL_FORUM_INTERFACE',
      {
        forum_name: '진로 상담 게시판',
        main_post: {
          author: '학생',
          title: '질문',
          content: '직업 가치관이 궁금합니다.',
        },
        comments: [],
      },
    ],
    [
      'TPL_QUANTITATIVE_CHART',
      {
        chart_type: 'bar',
        axes: [{ key: 'hours', label: '근무 시간', max: 40 }],
        datasets: [{ label: 'A 기업', values: [35] }],
      },
    ],
    [
      'TPL_PROMOTIONAL_CANVAS',
      {
        slogan: '안전한 작업장',
        bullets: ['보호 장비를 착용한다.'],
        visual_elements: [],
        missing_part: '',
      },
    ],
  ];

  it.each(renderableFixtures)(
    '%s accepts renderable data',
    (template, data) => {
      expect(normalizer.isRenderableTplData(data, template)).toBe(true);
    },
  );

  it('preserves an unsupported template as readable plain text', () => {
    const normalized = normalizer.normalizeItem({
      metadata: { recommended_template: 'TPL_EXAM_REFERENCE' },
      render_ready: { stimulus_data: 'A씨의 근무 사례를 읽고 답한다.' },
    });

    expect(normalized.metadata.recommended_template).toBe('TPL_PLAIN_TEXT');
    expect(normalized.render_ready.stimulus_data).toEqual({
      data: 'A씨의 근무 사례를 읽고 답한다.',
    });
  });

  it('rejects an empty structured document before defaults can mask it', () => {
    expect(
      normalizer.isRenderableTplData(
        {
          doc_type: '안내문',
          header_info: { title: '', date: '', author: '' },
          paragraphs: [],
          footnotes: [],
        },
        'TPL_FORMAL_DOCUMENT',
      ),
    ).toBe(false);
  });

  it('adds safe visual defaults to legacy conversations', () => {
    expect(
      normalizer.normalizeStimulusData(
        {
          participants: [
            { id: 'student', name: '학생', role: '학생' },
            { id: 'teacher', name: '교사', role: '교사' },
          ],
          messages: [
            { p_id: 'student', text: '상담을 요청합니다.', timestamp: '' },
          ],
        },
        'TPL_CONVERSATIONAL_FLOW',
      ),
    ).toMatchObject({
      participants: [
        { id: 'student', icon_key: 'student' },
        { id: 'teacher', icon_key: 'teacher' },
      ],
      scene_kind: 'none',
      visual_aid: { kind: 'none', actor_ids: [], relations: [] },
    });
  });

  it('rejects malformed explicit conversation visual data', () => {
    expect(
      normalizer.isRenderableTplData(
        {
          participants: [
            { id: 'student', name: '학생', role: '학생', icon_key: 'student' },
            { id: 'teacher', name: '교사', role: '교사', icon_key: 'teacher' },
          ],
          messages: [
            { p_id: 'student', text: '상담을 요청합니다.', timestamp: '' },
          ],
          scene_kind: 'school',
          visual_aid: {
            kind: 'actor_flow',
            actor_ids: ['student', 'other'],
            relations: [],
          },
        },
        'TPL_CONVERSATIONAL_FLOW',
      ),
    ).toBe(false);
  });
});
