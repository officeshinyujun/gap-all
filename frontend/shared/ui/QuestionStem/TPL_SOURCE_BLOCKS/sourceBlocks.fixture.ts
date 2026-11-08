// TPL_SOURCE_BLOCKS 테스트용 fixture.
// artifacts/reference-corpus-v3/built/moi_kongil_2024_6.json (q1·q2·q3·q12·q13)과
// moi_kongil_2024_9.json q1의 choiceTable을 잘라 계약 형태로 옮겼다. src는 임의의 https 자리표시자다.

import type { TPL_SOURCE_BLOCKS } from '@/types/questionstem';
import type { ExamQuestion } from '@/types/examQuestion';

export const SOURCE_BLOCKS_FIXTURE: TPL_SOURCE_BLOCKS = {
  blocks: [
    {
      type: 'text',
      text: '43년째 자신의 길을 걸어가고 있는 목공예 명장 A 씨는 최고의 전통 호랑이 목침*을 만들기 위해 기술과 지식을 끊임없이 습득하고 연마하여 발전시키고 있다.\n* 목침(木枕) : 나무토막으로 만든 베개',
    },
    {
      type: 'table',
      title: '○○공사 현장 안전 점검 결과',
      headers: [
        ['작업장', '점검 사항', '점검 결과', ''],
        ['', '', '예', '아니오'],
      ],
      rows: [
        ['(가)', '용접 작업 중 발생된 불꽃이 날아들 위험이 있는 곳에서 보호구를 착용하고 있는가?', '☐', '☑'],
        ['(나)', '작업자에게 안전모를 착용하도록 작업장에 산업안전보건표지를 부착하였는가?', '☑', '☐'],
      ],
      caption: null,
    },
    {
      type: 'table',
      title: null,
      headers: [['공업', '특징', '에너지 활용 사례']],
      rows: [
        ['(가)', '제선, 제강, 연주 및 압연 과정을 거쳐 제품을 생산하는 공업', '태양광 에너지를 제품 생산 공정에 사용하는 비율이 증가하고 있음. [그림 F1]'],
        ['(나)', '부양성, 적재성, 이동성을 갖춘 해상 수송 수단을 생산하는 공업', '수소 에너지를 사용하는 여객선이 개발됨. [그림 F2]'],
      ],
      // caption은 같은 시험지 q12 표의 각주
      caption: '* 지그(jig): 기계의 부품을 가공할 때 그 부품을 일정한 자리에 고정하여 절삭 공구가 닿을 위치를 결정하는 데 쓰이는 보조 기구',
    },
    {
      type: 'dialogue',
      lines: [
        { speaker: '사장', text: 'A 제품과 B 제품에 대해 추진한 전략을 부서별로 말씀해 보세요.' },
        { speaker: '마케팅 부장', text: '해외 수요 증가에 대비하여 DIN 표준을 적용한 A 제품을 출시하였습니다.' },
      ],
    },
    { type: 'figure', figure_id: 'F3' },
  ],
  figures: {
    F1: {
      src: 'https://placehold.co/320x180/png?text=F1',
      alt: '지붕에 태양광 패널이 설치된 공장(제철소) 건물 그림.',
      kind: 'illustration',
    },
    F2: {
      src: null,
      alt: '해상을 운항하는 여객선 그림.',
      kind: 'illustration',
    },
    F3: {
      src: 'https://placehold.co/640x240/png?text=F3',
      alt: '회의 테이블에 사장, 마케팅 부장, 품질 부장, 개발 부장이 앉아 대화하는 장면.',
      kind: 'illustration',
    },
    F4: {
      src: null,
      alt: '작업실에서 목침(나무 베개)을 조각하는 장인의 모습.',
      kind: 'illustration',
    },
  },
  choice_table: {
    headers: ['직업의식', '직업관'],
    rows: [
      ['전문 의식', '과정 지향적 직업관'],
      ['전문 의식', '물질 지향적 직업관'],
      ['책임 의식', '물질 지향적 직업관'],
      ['연대 의식', '과정 지향적 직업관'],
      ['연대 의식', '물질 지향적 직업관'],
    ],
  },
};

export const SOURCE_BLOCKS_QUESTION_FIXTURE: ExamQuestion = {
  metadata: {
    unit_name: '7단원',
    target_concept: '산업 안전',
    item_type: 'reference',
    recommended_template: 'TPL_SOURCE_BLOCKS',
  },
  render_ready: {
    question_stem: '다음 자료에 대한 설명으로 옳은 것은?',
    stimulus_data: SOURCE_BLOCKS_FIXTURE,
    options_list: [
      '① 전문 의식 / 과정 지향적 직업관',
      '② 전문 의식 / 물질 지향적 직업관',
      '③ 책임 의식 / 물질 지향적 직업관',
      '④ 연대 의식 / 과정 지향적 직업관',
      '⑤ 연대 의식 / 물질 지향적 직업관',
    ],
  },
};
