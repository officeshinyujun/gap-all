import { validateSimplyReferenceStructuredTpl } from './simply-reference-generation-contract';
import { STRUCTURED_TPL_NAMES } from './tpl-schemas';

const renderableStimulusByTemplate: Record<string, Record<string, unknown>> = {
  TPL_COMPARATIVE_MATRIX: {
    headers: [{ id: 'criterion', label: '판단 기준' }],
    rows: [{ id: 'row-1', cells: ['비교 내용'] }],
    selection_chips: [],
  },
  TPL_FORMAL_DOCUMENT: {
    doc_type: '안내문',
    header_info: { title: '채용 안내', date: '2026.01.01', author: '인사팀' },
    paragraphs: [{ sub_title: '대상', content: '지원 자격을 확인한다.' }],
    footnotes: [],
  },
  TPL_CONVERSATIONAL_FLOW: {
    participants: [{ id: 'a', name: 'A씨', role: '상담자' }],
    messages: [{ p_id: 'a', text: '상담 내용을 확인합니다.', timestamp: '' }],
  },
  TPL_CASE_DIAGNOSTIC_FRAME: {
    case_profile: { name: 'A씨', context: '근무 상황' },
    narrative: 'A씨는 근무 계약을 체결했다.',
    check_items: [],
  },
  TPL_SEQUENTIAL_WORKFLOW: {
    orientation: 'vertical',
    steps: [
      { idx: 1, label: '접수', desc: '신청서를 제출한다.', is_missing: false },
    ],
  },
  TPL_INSTRUCTIONAL_SCENE: {
    instructor: { id: 'teacher', text: '오늘의 학습 목표를 확인한다.' },
    canvas_content: { type: 'text', data: '직업의 요건' },
    students: [],
  },
  TPL_DIGITAL_FORUM_INTERFACE: {
    forum_name: '진로 상담 게시판',
    main_post: {
      author: '학생',
      title: '질문',
      content: '직업 가치관이 궁금합니다.',
    },
    comments: [],
  },
  TPL_QUANTITATIVE_CHART: {
    chart_type: 'bar',
    axes: [{ key: 'hours', label: '근무 시간', max: 40 }],
    datasets: [{ label: 'A 기업', values: [35] }],
  },
  TPL_PROMOTIONAL_CANVAS: {
    slogan: '안전한 작업장',
    bullets: ['보호 장비를 착용한다.'],
    visual_elements: [],
    missing_part: '',
  },
  TPL_ARTICLE: {
    title: '최신 노동법 개정안 발표',
    body_paragraphs: [
      '정부는 2026년부터 시행되는 노동법 개정안을 발표했다.',
      '이번 개정안은 근로자 권리 보호를 강화하는 내용을 담고 있다.',
    ],
    byline: '홍길동 기자',
    published_date: '2026-01-15',
    source: '뉴스데일리',
  },
  TPL_STATISTICS: {
    title: '연령별 취업률 통계',
    category_label: '연령대',
    data_entries: [
      { label: '20대', value: '75.2%', sub_label: '청년층' },
      { label: '30대', value: '82.1%', sub_label: '장년층' },
    ],
    unit: '%',
    source: '통계청 2025',
  },
  TPL_INCIDENT_REPORT: {
    title: '공장 화재 사고 보고서',
    incident_type: '화재',
    date: '2026-03-10',
    location: '서울시 구로구',
    overview: '전기적 결함으로 인한 화재 발생',
    cause: '노후화된 배선 문제',
    damage: '인명 피해 없음, 재산 피해 약 5천만원',
    response: '소방서 출동, 30분 만에 진화',
    prevention: '정기 전기 안전 점검 강화',
    timeline: [
      { time: '14:23', event: '화재 신고 접수' },
      { time: '14:28', event: '소방대 도착' },
      { time: '14:53', event: '화재 진압 완료' },
    ],
  },
  TPL_ANNOUNCEMENT: {
    title: '2026년 상반기 채용 공고',
    organizer: '㈜한국기업 인사팀',
    schedule: { start: '2026-04-01', end: '2026-04-30' },
    location: '서울시 강남구',
    target: '경력 3년 이상',
    details: [
      { label: '접수 방법', content: '온라인 접수' },
      { label: '제출 서류', content: '이력서, 자기소개서' },
    ],
    contact: '02-1234-5678',
  },
  TPL_REPORT: {
    title: '2025년 사업 실적 보고서',
    author: '경영지원팀',
    date: '2026-01-20',
    metadata: [
      { label: '기업명', value: '㈜한국기업' },
      { label: '작성 부서', value: '경영지원팀' },
    ],
    sections: [
      {
        heading: '영업 실적 요약',
        content: '2025년 총 매출은 전년 대비 15% 증가했습니다.',
        table: {
          headers: ['분기', '매출액', '성장률'],
          rows: [
            ['1Q', '100억', '10%'],
            ['2Q', '120억', '20%'],
          ],
        },
      },
    ],
    conclusion:
      '전반적으로 양호한 실적을 달성했으며, 2026년에도 성장이 기대됩니다.',
  },
};

describe('simply reference structured TPL contracts', () => {
  it.each(STRUCTURED_TPL_NAMES)(
    'Given %s renderable stimulus data, When validating a new draft, Then schema and web/PDF contracts pass',
    (template) => {
      expect(
        validateSimplyReferenceStructuredTpl(
          template,
          renderableStimulusByTemplate[template],
        ),
      ).toBe(true);
    },
  );

  it('Given plain or fallback data, When validating a new draft, Then it is rejected', () => {
    expect(
      validateSimplyReferenceStructuredTpl('TPL_PLAIN_TEXT', {
        data: 'fallback',
      }),
    ).toBe(false);
    expect(
      validateSimplyReferenceStructuredTpl('TPL_CASE_DIAGNOSTIC_FRAME', {
        data: 'fallback',
      }),
    ).toBe(false);
  });
});
