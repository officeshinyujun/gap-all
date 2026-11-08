'use client';

// 특기입증자료에 넣을 비교 화면을 덱 이미지 자리 크기에 맞춰 재현한 페이지.
// 서비스 기능이 아니다. 각 블록의 실선 테두리 안쪽만 캡처하면 덱 자리에 그대로 들어간다.

import React from 'react';
import { QuestionRenderer } from '@/components/exam/QuestionStem/QuestionRenderer';
import type { ExamQuestion } from '@/types/examQuestion';
import { ChatMock, type Msg } from './chat';
import { FilterCases } from './filter';
import { TableLossCase } from './table23';

/* ---------------- 공통 조각 ---------------- */

function Frame({
  w, h, id, title, children,
}: { w: number; h: number; id: string; title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 56 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
        <span style={C.badge}>{id}</span>
        <span style={{ fontSize: 15, fontWeight: 700 }}>{title}</span>
        <span style={{ fontSize: 12, color: '#999' }}>덱 자리 {w}×{h}</span>
      </div>
      <div style={{ width: w, height: h, border: '1px solid #111', background: '#fff', overflow: 'hidden' }}>
        {children}
      </div>
    </section>
  );
}

/* ---------------- 그림 5-9 문항 두 개 ---------------- */

const OPTS_BAD = [
  '① 근로기준법은 근로자의 권리를 보호한다',
  '② 근로기준법은 사용자의 이익만 보장한다',
  '③ 근로기준법은 임금 지급 방법을 정하지 않는다',
  '④ 근로기준법은 근로시간 기준을 두지 않는다',
  '⑤ 근로기준법은 해고 절차와 무관하다',
];
// 좌: 발문·선택지 모두에 개념명이 그대로 노출된다.

const OPTS_GOOD = [
  '① 갑은 통보만으로 조건을 바꿀 수 있다',
  '② 을은 변경 조건을 받아들여야 한다',
  '③ 갑은 변경 전에 을의 동의를 받아야 한다',
  '④ 을은 기존 조건으로 임금을 청구할 수 없다',
  '⑤ 통보만으로 계약이 새로 성립한다',
];

function q(stem: string, opts: string[], answer: number, stimulus: unknown): ExamQuestion {
  return {
    metadata: { unit_name: '성공적인 직업생활 5단원', target_concept: '근로계약', item_type: '사례 적용 (중)' },
    render_ready: { question_stem: stem, stimulus_data: stimulus, options_list: opts },
    correct_answer: answer,
  } as ExamQuestion;
}

const Q_BAD = q('근로기준법에 대한 설명으로 옳은 것은?', OPTS_BAD, 1, null);
const Q_GOOD = q(
  '다음 사례에 대한 설명으로 옳은 것은?',
  OPTS_GOOD,
  3,
  {
    messages: [
      { id: 'm1', speaker: '갑', text: '다음 달부터 근무 시간을 두 시간 늘리겠습니다. 임금은 그대로입니다.' },
    ],
    participants: ['갑'],
  },
);


/* ---------------- 챗 목업 대사 ---------------- */

const MSG_BEFORE: Msg[] = [
  { who: 'user', text: '4단원에서 근로계약서에 꼭 들어가야 하는 게 뭐야?' },
  {
    who: 'ai',
    blocks: [
      { h: '1. 반드시 적어야 하는 것' },
      {
        li: [
          { t: '임금 — 구성 항목, 계산 방법, 지급 방법' },
          { t: '소정근로시간과 휴게 시간' },
          { t: '휴일과 연차 유급휴가' },
        ],
      },
      { h: '2. 함께 챙길 것' },
      {
        li: [
          { t: '산업안전보건 교육은 연 1회 이수해야 해.', off: true },
          { t: '안전보건관리책임자를 따로 두어야 해.', off: true },
          { t: '직무 스트레스는 이완 훈련으로 관리할 수 있어.', off: true },
        ],
      },
      '이해됐어?',
    ],
  },
];

const MSG_8_BEFORE: Msg[] = [
  { who: 'user', text: '근로계약서에 뭐가 들어가야 해?' },
  {
    who: 'ai',
    blocks: [
      {
        li: [
          { t: '임금, 소정근로시간, 휴일' },
          { t: '산업안전보건 교육 연 1회', off: true },
        ],
      },
    ],
  },
];

const MSG_8_AFTER: Msg[] = [
  { who: 'user', text: '근로계약서에 뭐가 들어가야 해?' },
  {
    who: 'ai',
    blocks: [
      {
        li: [
          { t: '임금 — 항목·계산·지급 방법' },
          { t: '소정근로시간, 휴일, 연차' },
        ],
      },
    ],
  },
];

/* ---------------- 페이지 ---------------- */

export default function DeckFiguresPage() {
  return (
    <main style={C.page}>
      <h1 style={C.h1}>덱 비교 화면 재현</h1>
      <p style={C.note}>
        덱의 <b>[캡처 필요]</b> 자리를 그 크기 그대로 재현한 페이지입니다. 서비스 기능이 아닙니다.
        <br />
        <b>2-3·5-4·5-7은 과거 동작을 다시 만든 재현 화면</b>이므로, 덱 캡션에도 “재현”이라고 적어야 합니다.
        5-8의 두 문항은 실제 문항 렌더러가 그린 화면입니다.
      </p>

      {/* ---- 그림 2-3 ---- */}
      <Frame w={532} h={420} id="그림 2-3" title="표 문항을 원문 그대로(좌) / 텍스트 한 덩어리로(우) 옮겼을 때">
        <TableLossCase />
      </Frame>

      {/* ---- 그림 3-7 ---- */}
      <Frame w={532} h={220} id="그림 3-7" title="단순 필터를 통과했지만 생성에 못 쓰는 원문">
        <FilterCases />
      </Frame>

      {/* ---- 그림 5-4 ---- */}
      <Frame w={300} h={390} id="그림 5-4" title="범위를 고정하기 전, 다른 단원 문장이 섞인 응답">
        <ChatMock
          compact
          title="성공적인 직업생활"
          sub="1단원 ~ 20단원"
          messages={MSG_BEFORE}
          footer=""
        />
      </Frame>

      {/* ---- 그림 5-7 ---- */}
      <Frame w={532} h={170} id="그림 5-7" title="같은 질문, 범위 고정 전(좌)과 후(우)">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', height: '100%' }}>
          <div style={{ height: '100%', borderRight: `1px solid ${'#23232E'}` }}>
            <ChatMock compact title="전 — 전체 단원에서 유사도 검색" sub="1단원 ~ 20단원" messages={MSG_8_BEFORE} />
          </div>
          <div style={{ height: '100%' }}>
            <ChatMock compact title="후 — 과목·단원 범위를 먼저 고정" sub="4단원" messages={MSG_8_AFTER} />
          </div>
        </div>
      </Frame>

      {/* ---- 그림 5-8 ---- */}
      <Frame w={532} h={260} id="그림 5-8" title="개념명을 그대로 쓴 문항(좌)과 사례로 돌려 물은 문항(우)">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', height: '100%' }}>
          <div style={{ ...C.qhalf, borderRight: '1px solid #e5e5e5' }}>
            <div style={C.halfHead}>전 — 발문에 개념명이 그대로 나옴</div>
            <div style={C.qbox}>
              <QuestionRenderer question={Q_BAD} questionNumber={1} />
            </div>
          </div>
          <div style={C.qhalf}>
            <div style={C.halfHead}>후 — 사례로 돌려 물음</div>
            <div style={C.qbox}>
              <QuestionRenderer question={Q_GOOD} questionNumber={1} />
            </div>
          </div>
        </div>
      </Frame>
    </main>
  );
}

const C: Record<string, React.CSSProperties> = {
  page: {
    maxWidth: 900, margin: '0 auto', padding: '40px 24px 120px',
    fontFamily: 'Wanted Sans, system-ui, sans-serif', color: '#111',
  },
  h1: { fontSize: 26, fontWeight: 700, marginBottom: 8 },
  note: { fontSize: 13, color: '#555', lineHeight: 1.7, marginBottom: 40 },
  badge: { fontSize: 11, fontWeight: 700, background: '#111', color: '#fff', padding: '3px 8px', borderRadius: 4 },
  chat: { display: 'flex', flexDirection: 'column', height: '100%', background: '#fff' },
  chatHead: {
    fontSize: 10, fontWeight: 600, color: '#666', padding: '9px 12px',
    borderBottom: '1px solid #ececec',
  },
  chatBody: { flex: 1, padding: 12, overflow: 'hidden' },
  chatFoot: {
    fontSize: 9, color: '#999', padding: '8px 12px', borderTop: '1px solid #ececec',
  },
  half: { padding: 12, display: 'flex', flexDirection: 'column' },
  halfHead: { fontSize: 10, fontWeight: 700, color: '#8a8a8a', marginBottom: 8 },
  halfFoot: { fontSize: 9, color: '#999', marginTop: 'auto', paddingTop: 8 },
  qhalf: { padding: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column' },
  qbox: { flex: 1, overflow: 'hidden', fontSize: 10, transform: 'scale(0.55)', transformOrigin: 'top left', width: '182%' },
};
