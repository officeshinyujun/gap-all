'use client';

import React, { useState } from 'react';
import { VStack } from '@/components/general/VStack';
import { HStack } from '@/components/general/HStack';
import Typo from '@/components/general/Typo';
import {
  TPLComparativeMatrix,
  TPLFormalDocument,
  TPLConversationalFlow,
  TPLCaseDiagnosticFrame,
  TPLSequentialWorkflow,
  TPLInstructionalScene,
  TPLDigitalForumInterface,
  TPLQuantitativeChart,
  TPLPromotionalCanvas,
} from '@/components/exam/QuestionStem';
import type {
  TPL_COMPARATIVE_MATRIX,
  TPL_FORMAL_DOCUMENT,
  TPL_CONVERSATIONAL_FLOW,
  TPL_CASE_DIAGNOSTIC_FRAME,
  TPL_SEQUENTIAL_WORKFLOW,
  TPL_INSTRUCTIONAL_SCENE,
  TPL_DIGITAL_FORUM_INTERFACE,
  TPL_QUANTITATIVE_CHART,
  TPL_PROMOTIONAL_CANVAS,
  ChartType,
} from '@/types/questionstem';
import s from './page.module.scss';

// ============================================================
// 예시 데이터
// ============================================================

const MATRIX_DATA: TPL_COMPARATIVE_MATRIX = {
  headers: [
    { id: 'h0', label: '구분' },
    { id: 'h1', label: '갑국' },
    { id: 'h2', label: '을국' },
    { id: 'h3', label: '병국' },
  ],
  rows: [
    { id: 'r1', cells: ['GDP 성장률 (%)', '3.2', '1.8', '5.1'] },
    { id: 'r2', cells: ['실업률 (%)', '4.5', '7.2', '3.1'] },
    { id: 'r3', cells: ['물가 상승률 (%)', '2.1', '3.8', '6.4'] },
    { id: 'r4', cells: ['경상수지 (억 달러)', '+120', '-45', '+310'] },
  ],
  selection_chips: [
    '경기 침체 가능성이 높다',
    '물가 안정이 잘 이루어지고 있다',
    '수출이 수입보다 많다',
    '고용 시장이 불안정하다',
    '경제 성장이 가장 빠르다',
  ],
};

const FORMAL_DOC_DATA: TPL_FORMAL_DOCUMENT = {
  doc_type: '환경부 정책 보고서',
  header_info: {
    title: '2024년 국내 탄소 배출 현황 및 감축 방안',
    date: '2024. 3. 15.',
    author: '기후변화정책과',
  },
  paragraphs: [
    {
      sub_title: '1. 현황 분석',
      content:
        '2024년 국내 온실가스 총 배출량은 전년 대비 약 3.2% 감소한 것으로 잠정 집계되었다. 이는 재생에너지 발전 비중 확대와 산업 부문의 에너지 효율 개선이 복합적으로 작용한 결과로 분석된다.',
    },
    {
      sub_title: '2. 주요 감축 요인',
      content:
        '태양광 및 풍력 발전 설비 용량이 전년 대비 18% 증가하였으며, 전기차 보급 대수는 누적 150만 대를 돌파하였다. 또한 건물 에너지 효율 등급제 강화로 건물 부문 배출량이 5.7% 감소하였다.',
    },
    {
      sub_title: '3. 향후 과제',
      content:
        '2030 국가 온실가스 감축 목표(NDC) 달성을 위해서는 현재 감축 속도를 2배 이상 가속화해야 한다. 특히 철강·시멘트 등 탄소 집약 산업의 구조 전환과 수소 경제 활성화가 핵심 과제로 부상하고 있다.',
    },
  ],
  footnotes: [
    '온실가스 배출량은 이산화탄소 환산 기준(CO₂eq)으로 산정함.',
    'NDC: Nationally Determined Contribution(국가 결정 기여)',
  ],
};

const CONV_DATA: TPL_CONVERSATIONAL_FLOW = {
  participants: [
    { id: 'p1', name: '민준', role: '학생' },
    { id: 'p2', name: '선생님', role: '교사' },
  ],
  messages: [
    {
      p_id: 'p1',
      text: '선생님, 광합성과 세포 호흡은 서로 반대 과정이라고 할 수 있나요?',
      timestamp: '오전 10:12',
    },
    {
      p_id: 'p2',
      text: '좋은 질문이야. 광합성은 빛 에너지를 이용해 이산화탄소와 물로 포도당을 합성하는 과정이고, 세포 호흡은 포도당을 분해해 에너지를 얻는 과정이지. 반응물과 생성물이 서로 반대이니 넓은 의미에서 역반응 관계라고 볼 수 있어.',
      timestamp: '오전 10:13',
    },
    {
      p_id: 'p1',
      text: '그렇다면 식물은 낮에는 광합성만 하고 밤에는 세포 호흡만 하나요?',
      timestamp: '오전 10:14',
    },
    {
      p_id: 'p2',
      text: '아니야. 식물은 낮에도 세포 호흡을 계속해. 다만 낮에는 광합성 속도가 세포 호흡 속도보다 훨씬 빠르기 때문에 전체적으로 이산화탄소를 흡수하는 것처럼 보이는 거야. 이를 겉보기 광합성이라고 하지.',
      timestamp: '오전 10:15',
    },
    {
      p_id: 'p1',
      text: '아, 그래서 보상점이라는 개념이 나오는군요!',
      timestamp: '오전 10:16',
    },
  ],
};

const CASE_DATA: TPL_CASE_DIAGNOSTIC_FRAME = {
  case_profile: {
    name: '갑',
    context: '고등학교 3학년, 도시 거주, 월 용돈 15만 원',
  },
  narrative:
    '갑은 매달 용돈을 받으면 즉시 최신 스마트폰 액세서리와 의류를 구매하는 데 대부분을 지출한다. 저축은 거의 하지 않으며, 용돈이 부족할 때는 부모님께 추가로 요청한다. 갑은 친구들과의 비교를 통해 소비 결정을 내리는 경향이 있으며, 구매 후 만족감이 오래 지속되지 않아 새로운 소비를 반복한다.',
  check_items: [
    { id: 'c1', label: '합리적 소비 계획을 수립한다', is_checked: false },
    { id: 'c2', label: '충동 구매를 자제한다', is_checked: false },
    { id: 'c3', label: '과시적 소비 성향을 보인다', is_checked: true },
    { id: 'c4', label: '저축을 통해 미래를 대비한다', is_checked: false },
    { id: 'c5', label: '타인의 소비를 모방하는 경향이 있다', is_checked: true },
    { id: 'c6', label: '소득 범위 내에서 지출을 관리한다', is_checked: false },
  ],
};

const WORKFLOW_DATA: TPL_SEQUENTIAL_WORKFLOW = {
  orientation: 'horizontal',
  steps: [
    { idx: 1, label: '문제 인식', desc: '현상 파악 및 문제 정의', is_missing: false },
    { idx: 2, label: '(가)', desc: '', is_missing: true },
    { idx: 3, label: '대안 탐색', desc: '가능한 해결책 목록화', is_missing: false },
    { idx: 4, label: '(나)', desc: '', is_missing: true },
    { idx: 5, label: '실행 및 평가', desc: '선택안 실행 후 결과 검토', is_missing: false },
  ],
};

const INSTRUCTIONAL_DATA: TPL_INSTRUCTIONAL_SCENE = {
  instructor: {
    id: '선생님',
    text: '오늘은 세포 분열의 두 가지 유형인 체세포 분열과 감수 분열을 비교해 보겠습니다. 아래 표를 보면서 차이점을 정리해 봅시다.',
  },
  canvas_content: {
    type: 'table',
    data: [
      ['구분', '체세포 분열', '감수 분열'],
      ['분열 횟수', '1회', '2회'],
      ['딸세포 수', '2개', '4개'],
      ['염색체 수', '모세포와 동일 (2n)', '모세포의 절반 (n)'],
      ['일어나는 곳', '생장점, 형성층 등', '생식 기관'],
      ['목적', '생장, 재생', '생식세포 형성'],
    ],
  },
  students: [
    {
      id: '학생 A',
      text: '그러면 감수 분열로 만들어진 생식세포가 수정되면 다시 2n이 되는 건가요?',
    },
    {
      id: '학생 B',
      text: '체세포 분열에서는 왜 염색체 수가 유지되나요? DNA 복제가 먼저 일어나기 때문인가요?',
    },
  ],
};

const FORUM_DATA: TPL_DIGITAL_FORUM_INTERFACE = {
  forum_name: '청소년 환경 실천 커뮤니티',
  main_post: {
    author: 'GreenMinjun_97',
    title: '일상에서 탄소 발자국 줄이는 방법 공유해요',
    content:
      '안녕하세요! 저는 최근 개인 탄소 발자국을 줄이기 위해 여러 가지를 실천하고 있어요. 대중교통 이용, 텀블러 사용, 채식 위주 식단 등을 시도해 보았는데, 그 중에서 가장 효과적이었던 것은 불필요한 소비를 줄이는 것이었습니다. 여러분은 어떤 방법을 실천하고 계신가요?',
  },
  comments: [
    {
      author: 'EcoSuji_2006',
      text: '저는 장바구니를 항상 들고 다니고, 음식물 쓰레기를 최소화하려고 노력해요. 특히 냉장고 정리를 자주 해서 식재료를 낭비하지 않으려고 합니다.',
    },
    {
      author: 'NatureHyun',
      text: '전기 절약도 중요하더라고요. 사용하지 않는 콘센트 뽑기, LED 조명 교체 등 작은 것부터 시작했는데 전기 요금도 줄고 뿌듯해요.',
    },
    {
      author: 'ClimateJiwon',
      text: '중고 거래 앱을 적극 활용하고 있어요. 새 제품 생산에 드는 탄소를 줄일 수 있고, 경제적으로도 이득이라 일석이조예요!',
    },
  ],
};

// 차트 데이터 — chart_type을 동적으로 교체해서 사용
const CHART_BASE_AXES = [
  { key: '2020', label: '2020년', max: 100 },
  { key: '2021', label: '2021년', max: 100 },
  { key: '2022', label: '2022년', max: 100 },
  { key: '2023', label: '2023년', max: 100 },
];

const CHART_BASE_DATASETS = [
  { label: '재생에너지 비중 (%)', values: [18, 22, 27, 33] },
  { label: '화석연료 비중 (%)', values: [72, 68, 62, 55] },
];

const PROMO_DATA: TPL_PROMOTIONAL_CANVAS = {
  slogan: '지구를 위한 선택, 2024 친환경 산업 박람회',
  bullets: [
    '국내외 200여 개 친환경 기업 참가',
    '탄소 중립 기술 시연 및 체험 행사',
    '전문가 특별 강연 (매일 오후 2시)',
    '선착순 1,000명 친환경 굿즈 증정',
    '입장 무료 (사전 온라인 등록 필수)',
  ],
  visual_elements: ['박람회 공식 로고', '친환경 제품 전시 사진', '행사장 안내 지도'],
  missing_part: '행사 기간',
};

// ============================================================
// 탭 정의
// ============================================================

type TabId =
  | 'matrix'
  | 'document'
  | 'conversation'
  | 'case'
  | 'workflow'
  | 'scene'
  | 'forum'
  | 'chart'
  | 'promo';

interface Tab {
  id: TabId;
  label: string;
  template: string;
}

const TABS: Tab[] = [
  { id: 'matrix', label: '비교 행렬', template: 'TPL_COMPARATIVE_MATRIX' },
  { id: 'document', label: '공식 문서', template: 'TPL_FORMAL_DOCUMENT' },
  { id: 'conversation', label: '대화문', template: 'TPL_CONVERSATIONAL_FLOW' },
  { id: 'case', label: '사례 진단', template: 'TPL_CASE_DIAGNOSTIC_FRAME' },
  { id: 'workflow', label: '순서도', template: 'TPL_SEQUENTIAL_WORKFLOW' },
  { id: 'scene', label: '수업 장면', template: 'TPL_INSTRUCTIONAL_SCENE' },
  { id: 'forum', label: '게시판', template: 'TPL_DIGITAL_FORUM_INTERFACE' },
  { id: 'chart', label: '차트', template: 'TPL_QUANTITATIVE_CHART' },
  { id: 'promo', label: '광고문', template: 'TPL_PROMOTIONAL_CANVAS' },
];

const CHART_TYPES: { type: ChartType; label: string }[] = [
  { type: 'bar', label: '막대' },
  { type: 'line', label: '꺾은선' },
  { type: 'radar', label: '방사형' },
];

// ============================================================
// 페이지 컴포넌트
// ============================================================

export default function QuestionStemDevPage() {
  const [activeTab, setActiveTab] = useState<TabId>('matrix');
  const [chartType, setChartType] = useState<ChartType>('bar');

  const chartData: TPL_QUANTITATIVE_CHART = {
    chart_type: chartType,
    axes: CHART_BASE_AXES,
    datasets: CHART_BASE_DATASETS,
  };

  const renderComponent = () => {
    switch (activeTab) {
      case 'matrix':
        return (
          <TPLComparativeMatrix
            data={MATRIX_DATA}
            label="다음 표는 갑국, 을국, 병국의 주요 경제 지표를 나타낸 것이다. 이에 대한 설명으로 옳은 것은?"
          />
        );
      case 'document':
        return (
          <TPLFormalDocument
            data={FORMAL_DOC_DATA}
            label="다음 보고서를 읽고 물음에 답하시오."
          />
        );
      case 'conversation':
        return (
          <TPLConversationalFlow
            data={CONV_DATA}
            label="다음은 민준이와 선생님의 대화이다. 빈칸 (가)에 들어갈 내용으로 가장 적절한 것은?"
          />
        );
      case 'case':
        return (
          <TPLCaseDiagnosticFrame
            data={CASE_DATA}
            label="다음 사례에 나타난 갑의 소비 행태에 대한 분석으로 옳은 것만을 <보기>에서 있는 대로 고른 것은?"
          />
        );
      case 'workflow':
        return (
          <TPLSequentialWorkflow
            data={WORKFLOW_DATA}
            label="다음은 합리적 의사 결정 과정을 나타낸 것이다. (가), (나)에 들어갈 내용으로 옳은 것은?"
          />
        );
      case 'scene':
        return (
          <TPLInstructionalScene
            data={INSTRUCTIONAL_DATA}
            label="다음은 생물 수업의 일부이다. 이에 대한 설명으로 옳은 것만을 <보기>에서 있는 대로 고른 것은?"
          />
        );
      case 'forum':
        return (
          <TPLDigitalForumInterface
            data={FORUM_DATA}
            label="다음은 인터넷 게시판의 글이다. 윗글에 대한 이해로 적절하지 않은 것은?"
          />
        );
      case 'chart':
        return (
          <TPLQuantitativeChart
            data={chartData}
            label="다음 그래프는 연도별 에너지원 비중 변화를 나타낸 것이다. 이에 대한 설명으로 옳지 않은 것은?"
          />
        );
      case 'promo':
        return (
          <TPLPromotionalCanvas
            data={PROMO_DATA}
            label="다음 광고문을 읽고 물음에 답하시오."
          />
        );
      default:
        return null;
    }
  };

  const activeTabInfo = TABS.find((t) => t.id === activeTab)!;

  const getJsonData = (): object => {
    switch (activeTab) {
      case 'matrix': return MATRIX_DATA;
      case 'document': return FORMAL_DOC_DATA;
      case 'conversation': return CONV_DATA;
      case 'case': return CASE_DATA;
      case 'workflow': return WORKFLOW_DATA;
      case 'scene': return INSTRUCTIONAL_DATA;
      case 'forum': return FORUM_DATA;
      case 'chart': return chartData;
      case 'promo': return PROMO_DATA;
      default: return {};
    }
  };

  return (
    <VStack gap={0} fullWidth fullHeight className={s.page}>
      {/* 헤더 */}
      <div className={s.header}>
        <VStack gap={4}>
          <Typo.BD size={20} color="primary">QuestionStem 컴포넌트 테스트</Typo.BD>
          <Typo.TH size={14} color="secondary">
            EBS 수능특강 스타일 지문 컴포넌트 9종 렌더링 테스트 페이지
          </Typo.TH>
        </VStack>
      </div>

      {/* 탭 네비게이션 */}
      <div className={s.tabBar}>
        <HStack gap={0} wrap="wrap">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              className={`${s.tab} ${activeTab === tab.id ? s.tabActive : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <VStack gap={2} align="center">
                <span className={s.tabLabel}>{tab.label}</span>
                <span className={s.tabTemplate}>{tab.template}</span>
              </VStack>
            </button>
          ))}
        </HStack>
      </div>

      {/* 콘텐츠 */}
      <div className={s.content}>
        <HStack gap={24} align="start" fullWidth fullHeight>
          {/* 좌측: 렌더링된 컴포넌트 */}
          <VStack gap={16} className={s.previewPanel}>
            <HStack gap={8} align="center" justify="between" fullWidth>
              <HStack gap={8} align="center">
                <span className={s.panelBadge}>PREVIEW</span>
                <Typo.SM size={14} color="primary">{activeTabInfo.label}</Typo.SM>
                <Typo.TH size={12} color="secondary">— {activeTabInfo.template}</Typo.TH>
              </HStack>
              {/* 차트 타입 전환 버튼 */}
              {activeTab === 'chart' && (
                <HStack gap={4} align="center">
                  {CHART_TYPES.map(({ type, label }) => (
                    <button
                      key={type}
                      className={`${s.chartTypeBtn} ${chartType === type ? s.chartTypeBtnActive : ''}`}
                      onClick={() => setChartType(type)}
                    >
                      {label}
                    </button>
                  ))}
                </HStack>
              )}
            </HStack>
            <div className={s.previewBox}>
              {renderComponent()}
            </div>
          </VStack>

          {/* 우측: JSON 데이터 */}
          <VStack gap={16} className={s.jsonPanel}>
            <HStack gap={8} align="center">
              <span className={s.panelBadge}>JSON DATA</span>
              <Typo.SM size={14} color="primary">입력 스키마</Typo.SM>
            </HStack>
            <pre className={s.jsonBlock}>
              {JSON.stringify(getJsonData(), null, 2)}
            </pre>
          </VStack>
        </HStack>
      </div>
    </VStack>
  );
}
