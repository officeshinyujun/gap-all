'use client';

// 특기입증자료 덱에 들어간 순서도를 한 화면에서 확인하기 위한 페이지.
// 서비스 기능이 아니라 문서 검토용이다. 외부 라이브러리 없이 SVG 로 직접 그린다.

import React, { useState } from 'react';
import { Flow, type Spec } from './flow';

type Item = { id: string; chapter: string; caption: string; spec: Spec };

const ITEMS: Item[] = [
  {
    id: '그림 1-1',
    chapter: '소개-2',
    caption: '수집한 자료가 검증을 거쳐 학습·시험·챗·오답으로 이어지는 전체 관계.',
    spec: {
      kind: 'v',
      nodes: [
        { t: '교과서 원문 · PDF 문항 · AI 출력' },
        { t: '과목 · 단원 · 대표 개념 연결\nTPL · 문항 데이터 · Blueprint' },
        { t: '출처 · 자료 · 정답 관계 검증' },
        { t: '학습 · 시험 · 챗 · 오답', k: 'k' },
      ],
    },
  },
  {
    id: '그림 3-6',
    chapter: '03-6',
    caption: '원문을 AI 생성 대상으로 넘기기 전에 정답·자료 형식·출처를 확인하는 순서. 하나라도 걸리면 그 원문은 쓰지 않는다.',
    spec: {
      kind: 'v',
      nodes: [
        { t: '원문 문항과 정답을 읽는다' },
        { t: '정답이 하나인가', k: 'd' },
        { t: '출처와 개념 정보가 남았는가', k: 'd' },
        { t: '자료가 지원하는 TPL로 표현되는가', k: 'd' },
        { t: '빈 슬롯·임시 문구가 없는가', k: 'd' },
        { t: 'Blueprint 분석 단계로 이동', k: 'k' },
      ],
      labels: { 1: '예', 2: '예', 3: '예', 4: '예' },
      sides: [{ after: 1, label: '아니오', text: '생성 후보에서 제외', rejoin: -1 }],
    },
  },
  {
    id: '그림 3-7',
    chapter: '03-9',
    caption: '원문 선택부터 Blueprint·제한된 생성·서버 검증·재생성·기록까지 이어지는 최종 생성 경로.',
    spec: {
      kind: 'v',
      nodes: [
        { t: 'Reference Catalog 원문 문항' },
        { t: '과목·단원·개념으로 원문 선택' },
        { t: '불변 사실·변경 슬롯·정답 규칙 분리' },
        { t: 'Blueprint 구성' },
        { t: '제한된 생성 프롬프트 작성' },
        { t: 'AI가 허용된 문장 슬롯만 작성' },
        { t: '서버가 문항 조립·정답 재계산' },
        { t: '구조·정답·의미 검증 통과?', k: 'd' },
        { t: '최종 문항 저장 · 출처와 규칙 기록', k: 'k' },
      ],
      labels: { 7: '예' },
      sides: [
        { after: 7, label: '아니오', text: '실패 원인·필수 근거를 넣어\n다시 생성', rejoin: 5 },
      ],
    },
  },
  {
    id: '그림 4-4',
    chapter: '04-4',
    caption: '요청·검증·저장·풀이·채점·오답 복습이 연결되는 비동기 시험 생성 흐름.',
    spec: {
      kind: 's',
      a: [
        { t: '시험 조건\n선택' }, { t: '작업 ID\n발급' },
        { t: '문항\n생성·검증' }, { t: '통과 문항이\n있는가?', k: 'd' },
      ],
      b: [
        { t: '트랜잭션으로\n시험 저장' }, { t: '시험 풀이' },
        { t: '채점·오답\n기록' }, { t: '공부·복습\n연결', k: 'k' },
      ],
      drop: { from: 3, label: '아니오', text: '실패 상태와\n원인 기록' },
    },
  },
  {
    id: '그림 4-5',
    chapter: '04-5',
    caption: '빈도 보정에서 멈추지 않고 단원별 대표 개념을 먼저 고정하는 쪽으로 바꾼 과정.',
    spec: {
      kind: 's',
      a: [
        { t: '실전문항에서\n개념 추출' }, { t: '등장 횟수·\n가중치 계산' },
        { t: '빈도가\n왜곡되는가?', k: 'd' }, { t: '이상 빈도에\n상한 적용' },
      ],
      b: [
        { t: '단원 오배정이\n해결됐는가?', k: 'd' }, { t: '단원별 대표 개념\n먼저 고정' },
        { t: '일반 단어 빼고\n카드·문항 재연결' }, { t: '빈도는 보조\n지표로만 사용', k: 'k' },
      ],
      la: { 2: '예' },
      lb: { 0: '아니오' },
    },
  },
  {
    id: '그림 4-6',
    chapter: '04-5',
    caption: '근거 자료를 모은 뒤 카드를 만들고, 검증 결과에 따라 완료와 검토 필요로 나누는 과정.',
    spec: {
      kind: 's',
      a: [
        { t: '대표 개념 태그' }, { t: '교과서·카드·\n기출 근거 수집' },
        { t: '태그별 입력\n자료 저장' }, { t: '근거 범위 안에서\n학습 카드 생성' },
      ],
      b: [
        { t: '정의·문항·정답·\n선택지 분석이 있는가?', k: 'd' }, { t: '완료 카드로 분류' },
        { t: '검수 후\n서비스 반영' }, { t: '실패는 품질\n보고서에 기록', k: 'k' },
      ],
      lb: { 0: '통과' },
    },
  },
  {
    id: '그림 4-7',
    chapter: '04-5',
    caption: '개념을 읽는 데서 끝내지 않고 실제 지문과 선택지의 판단 근거로 옮겨 가는 학습 순서.',
    spec: {
      kind: 's',
      a: [
        { t: '단원의 대표\n개념 선택' }, { t: '개념 정의·\n핵심 포인트' },
        { t: '기억할 내용과\n자주 틀리는 구분' }, { t: '같은 개념의\n실제 기출 열기' },
      ],
      b: [
        { t: '지문 속 판단\n단서 확인' }, { t: '선택지별\nO·X 근거 비교' },
        { t: '다른 문항으로\n개념 재적용', k: 'k' },
      ],
    },
  },
  {
    id: '그림 5-5',
    chapter: '05-5',
    caption: '공부 노트 한 단원이 검색 가능한 청크가 되기까지의 순서.',
    spec: {
      kind: 's',
      a: [
        { t: '단원별로 정리한\n공부 노트' }, { t: '1,500자 지점\n계산' },
        { t: '앞뒤 150자에서\n문장 끝 찾기' }, { t: '그 자리에서\n자르기' },
      ],
      b: [
        { t: '앞 청크와\n300자 겹치기' }, { t: '50자 미만\n조각 버리기' },
        { t: 'text-embedding\n-3-small 임베딩' }, { t: '과목·단원·순서와\n함께 저장', k: 'k' },
      ],
    },
  },
  {
    id: '그림 5-7',
    chapter: '05-7',
    caption: '질문 하나가 답변이 되기까지의 순서. 검색보다 범위 결정이 먼저 온다.',
    spec: {
      kind: 'v',
      nodes: [
        { t: '학생 질문 입력' },
        { t: '과목·단원 범위 먼저 고정' },
        { t: '질문에 ‘N단원’이 있는가?', k: 'd' },
        { t: '개념 카드 · 벡터 · 키워드 검색' },
        { t: '병합 · 중복 제거 · 단원 분산' },
        { t: '쓸 교과 문맥이 있는가?', k: 'd' },
        { t: '범위·문맥·최근 대화 10개로 답변 생성', k: 'k' },
      ],
      labels: { 2: '아니오', 5: '예' },
      sides: [
        { after: 2, label: '예', text: '그 단원 전체 청크를 순서대로', rejoin: 4 },
        { after: 5, label: '아니오', text: '단원별 구조화 요약 사용', rejoin: 6 },
      ],
    },
  },
];

export default function DeckDiagramsPage() {
  const [scale, setScale] = useState(1);
  return (
    <main style={S.page}>
      <header style={S.head}>
        <h1 style={S.h1}>특기입증자료 순서도 모음</h1>
        <p style={S.sub}>
          덱에 들어간 흐름도를 한 화면에서 확인하기 위한 페이지입니다. 서비스 기능이 아닙니다.
        </p>
        <label style={S.zoom}>
          배율 {scale.toFixed(1)}×
          <input
            type="range" min={0.6} max={2.4} step={0.1} value={scale}
            onChange={(e) => setScale(Number(e.target.value))}
            style={{ marginLeft: 12, width: 220 }}
          />
        </label>
      </header>
      <div style={S.grid}>
        {ITEMS.map((it) => (
          <section key={it.id} style={S.card}>
            <div style={S.cardHead}>
              <span style={S.badge}>{it.chapter}</span>
              <span style={S.figid}>{it.id}</span>
            </div>
            <div style={{ width: 532 * scale, maxWidth: '100%' }}>
              <Flow spec={it.spec} />
            </div>
            <p style={S.caption}>{it.id}. {it.caption}</p>
          </section>
        ))}
      </div>
    </main>
  );
}

const S: Record<string, React.CSSProperties> = {
  page: { padding: '40px 32px 120px', background: '#fafafa', minHeight: '100vh', color: '#111' },
  head: { maxWidth: 980, margin: '0 auto 32px' },
  h1: { fontSize: 26, fontWeight: 700, margin: 0 },
  sub: { fontSize: 14, color: '#666', margin: '8px 0 20px' },
  zoom: { fontSize: 13, color: '#444', display: 'inline-flex', alignItems: 'center' },
  grid: { maxWidth: 980, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 28 },
  card: { background: '#fff', border: '1px solid #e5e5e5', borderRadius: 10, padding: '24px 28px 20px' },
  cardHead: { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 18 },
  badge: { fontSize: 11, fontWeight: 600, background: '#111', color: '#fff', padding: '3px 8px', borderRadius: 4 },
  figid: { fontSize: 11, color: '#999', fontFamily: 'monospace' },
  caption: { fontSize: 13, color: '#575757', marginTop: 18, lineHeight: 1.5 },
};
