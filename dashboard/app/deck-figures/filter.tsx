'use client';

// 단순 필터를 통과했지만 생성 재료로 못 쓰는 원문 사례.
// sourceKey / questionNumber / reasons 는 artifacts/reference-certification-v2.json 의 실제 값이다.

import React from 'react';

type Row = { src: string; q: number; reasons: string[]; breaks: string };

export const ROWS: Row[] = [
  {
    src: 'kongil:2021:6월_모의평가:공업 일반:9',
    q: 9,
    reasons: ['EMPTY_STIMULUS'],
    breaks: '자료가 비어 있다. 판단 근거 없이 발문과 선택지만 남아, 무엇을 바꿔도 같은 문제가 나온다.',
  },
  {
    src: 'success:2024:6월_모의평가:성공적인 직업생활:3',
    q: 3,
    reasons: ['INCOMPLETE_TABLE', 'EMPTY_STIMULUS'],
    breaks: '표의 행과 열이 끝까지 읽히지 않았다. 셀 하나가 비면 정답의 전제가 달라진다.',
  },
  {
    src: 'kongil:2025:6월_모의평가:공업 일반:14',
    q: 14,
    reasons: ['INVALID_CHOICE_COUNT', 'MISSING_OFFICIAL_EXPLANATION'],
    breaks: '선택지 수가 다섯이 아니고 공식 해설도 없다. 정답 규칙을 세울 근거가 없다.',
  },
  {
    src: 'kongil:2022:9월_모의평가:공업 일반:19',
    q: 19,
    reasons: ['PARSE_REFERENCE_REJECTED'],
    breaks: '보기 항목이 선택지와 섞여 파싱이 거부됐다. 그대로 넘기면 빈 슬롯이 남는다.',
  },
];

export function FilterCases() {
  return (
    <div style={S.wrap}>
      {ROWS.map((r) => (
        <div key={r.src} style={S.row}>
          <div style={S.left}>
            <div style={S.src}>{r.src}</div>
            <div style={S.tags}>
              {r.reasons.map((x) => (
                <span key={x} style={S.tag}>{x}</span>
              ))}
            </div>
          </div>
          <div style={S.right}>{r.breaks}</div>
        </div>
      ))}
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  wrap: { display: 'flex', flexDirection: 'column', height: '100%', padding: '10px 12px', gap: 6 },
  row: {
    display: 'grid', gridTemplateColumns: '218px 1fr', gap: 12, alignItems: 'start',
    paddingBottom: 6, borderBottom: '1px solid #ececec', flex: 1,
  },
  left: { minWidth: 0 },
  src: { fontSize: 9, fontFamily: 'ui-monospace, monospace', color: '#666', wordBreak: 'break-all', lineHeight: 1.4 },
  tags: { display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 },
  tag: {
    fontSize: 8.5, fontWeight: 700, background: '#f4f4f4', border: '1px solid #e0e0e0',
    color: '#333', padding: '1px 5px', borderRadius: 3, fontFamily: 'ui-monospace, monospace',
  },
  right: { fontSize: 10.5, lineHeight: 1.55, color: '#111' },
};
