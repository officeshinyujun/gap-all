// reference-pdf-v3 built 행을 줄인 테스트 고정값.
// 출처: artifacts/reference-corpus-v3/built/moi_kongil_2023_6.json (q3),
//       artifacts/reference-corpus-v3/built/moi_kongil_2022_csat.json (q10)
// bbox/cropPath 등 렌더와 무관한 필드와 해설은 뺐다. figures[].url은 업로드 스크립트가 붙이는 값을 흉내 낸다.

export const V3_TABLE_FIGURE_PAYLOAD = {
  stem: '다음 수행 평가 보고서에 나타난 (가), (나) 공업에 대한 설명으로 옳은 것만을 <보기>에서 있는 대로 고른 것은?',
  points: 2,
  stimulus:
    '수행 평가 보고서\n◆ 주제: 풍력 발전기 제작과 관련된 우리나라 공업에 대해 조사하기\n\n[그림 F1: 산을 배경으로 들판에 서 있는 풍력 발전기(3날개 풍차) 그림.]\n\n관련 공업 | 제품 생산 과정\n(가) | [그림 F2]\n(나) | [그림 F3]',
  stimulusBlocks: [
    {
      type: 'text',
      text: '수행 평가 보고서\n◆ 주제: 풍력 발전기 제작과 관련된 우리나라 공업에 대해 조사하기',
    },
    { type: 'figure', figureId: 'F1' },
    {
      type: 'table',
      title: null,
      headers: [['관련 공업', '제품 생산 과정']],
      rows: [
        ['(가)', '[그림 F2]'],
        ['(나)', '[그림 F3]'],
      ],
      caption: null,
    },
  ],
  viewItems: [
    'ㄱ. (가) 공업은 나프타를 원료로 제품을 생산할 수 있다.',
    'ㄴ. (나) 공업은 제선, 제강 등의 과정을 거쳐 제품을 생산한다.',
    'ㄷ. (가)와 (나) 공업은 자본 집약적인 장치 공업이다.',
  ],
  choices: ['① ㄱ', '② ㄴ', '③ ㄱ, ㄷ', '④ ㄴ, ㄷ', '⑤ ㄱ, ㄴ, ㄷ'],
  choiceTable: null,
  correctAnswer: 5,
  explanation: '',
  questionNumber: 3,
  targetConcepts: ['공업의 종류', '석유 화학 공업', '금속 공업'],
  figures: [
    {
      id: 'F1',
      kind: 'illustration',
      description: '산을 배경으로 들판에 서 있는 풍력 발전기(3날개 풍차) 그림.',
      storagePath: null,
      url: 'https://example.supabase.co/storage/v1/object/public/reference-figures/v3/moi_kongil_2023_6/q3-F1.png',
    },
    {
      id: 'F2',
      kind: 'diagram',
      description: '(가) 공업의 제품 생산 과정 도식(석유 화학 공정).',
      storagePath: null,
      url: 'https://example.supabase.co/storage/v1/object/public/reference-figures/v3/moi_kongil_2023_6/q3-F2.png',
    },
    {
      // 업로드 전(url 없음)
      id: 'F3',
      kind: 'diagram',
      description: '(나) 공업의 제품 생산 과정 도식(철강 공정).',
      storagePath: null,
    },
  ],
  source: {
    type: 'moi',
    subject: 'kongil',
    subjectKor: '공업 일반',
    year: 2023,
    examType: '6월_모의평가',
    chapter: null,
    section: null,
    filename: '03 직탐(공업 일반)_문제.pdf',
    unitNumber: 3,
  },
  extraction: {
    version: 'reference-pdf-v3',
    sourceKey: 'moi:kongil:2023:6월_모의평가',
    v2LogicalSourceIds: [
      'kongil:3:kongil_2023_6월_모의평가_03 직탐(공업 일반)_문제.pdf:3',
    ],
  },
} as const;

export const V3_DIALOGUE_CHOICE_TABLE_PAYLOAD = {
  stem: '다음 인터뷰를 통해 유추할 수 있는 A 씨의 직업관과 직업의식으로 가장 적절한 것은?',
  points: 2,
  stimulus:
    '기자: 급변하는 사회에서도 오랫동안 도예가로 왕성하게 활동하고 있는 비결은 무엇인가요?\nA 씨: 돈을 버는 것보다 일 자체가 즐거움과 행복을 줄 수 있어야 된다고 생각합니다.',
  stimulusBlocks: [
    {
      type: 'dialogue',
      lines: [
        {
          speaker: '기자',
          text: '급변하는 사회에서도 오랫동안 도예가로 왕성하게 활동하고 있는 비결은 무엇인가요?',
        },
        {
          speaker: 'A 씨',
          text: '돈을 버는 것보다 일 자체가 즐거움과 행복을 줄 수 있어야 된다고 생각합니다.',
        },
      ],
    },
  ],
  viewItems: [],
  choices: [
    '① 결과 지향적 직업관 / 봉사 의식',
    '② 결과 지향적 직업관 / 평등 의식',
    '③ 과정 지향적 직업관 / 전문 의식',
    '④ 과정 지향적 직업관 / 평등 의식',
    '⑤ 물질 지향적 직업관 / 전문 의식',
  ],
  choiceTable: {
    headers: ['직업관', '직업의식'],
    rows: [
      ['결과 지향적 직업관', '봉사 의식'],
      ['결과 지향적 직업관', '평등 의식'],
      ['과정 지향적 직업관', '전문 의식'],
      ['과정 지향적 직업관', '평등 의식'],
      ['물질 지향적 직업관', '전문 의식'],
    ],
  },
  correctAnswer: 3,
  explanation: '',
  questionNumber: 10,
  targetConcepts: ['직업관과 직업의식'],
  figures: [],
  source: {
    type: 'moi',
    subject: 'kongil',
    subjectKor: '공업 일반',
    year: 2022,
    examType: '수능',
    chapter: null,
    section: null,
    filename: '03 직탐(공업 일반)_문제.pdf',
    unitNumber: 7,
  },
} as const;

/** 테스트에서 자유롭게 고칠 수 있는 깊은 복사본. */
export function v3Payload(
  payload:
    | typeof V3_TABLE_FIGURE_PAYLOAD
    | typeof V3_DIALOGUE_CHOICE_TABLE_PAYLOAD = V3_TABLE_FIGURE_PAYLOAD,
): Record<string, any> {
  return JSON.parse(JSON.stringify(payload)) as Record<string, any>;
}

/** 같은 문항을 v2처럼(구조화 필드 없이) 만든 것. */
export function v2StylePayload(
  payload:
    | typeof V3_TABLE_FIGURE_PAYLOAD
    | typeof V3_DIALOGUE_CHOICE_TABLE_PAYLOAD = V3_TABLE_FIGURE_PAYLOAD,
): Record<string, any> {
  const copy = v3Payload(payload);
  delete copy.stimulusBlocks;
  delete copy.figures;
  delete copy.choiceTable;
  return copy;
}
