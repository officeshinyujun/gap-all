'use client';

// 그림 2-3 — 표 문항을 (좌) 원문 그대로 / (우) 본문 텍스트 한 덩어리로 옮겼을 때의 비교.
// 서비스 기능이 아니라, 초기 파이프라인의 동작을 다시 만든 재현 화면이다.

import React from 'react';

const HEAD = ['구분', '정규직', '기간제 근로자'];
const ROWS: string[][] = [
  ['계약 기간', '정함 없음', '2년 이내'],
  ['갱신', '해당 없음', '반복 갱신 시 무기계약 전환'],
  ['퇴직급여', '1년 이상 근속 시 지급', '1년 이상 근속 시 지급'],
  ['연차 유급휴가', '근속 1년 15일', '근속 1년 15일'],
];

const STEM = '다음 표에 대한 설명으로 옳은 것은?';
const OPTS = [
  '① 기간제 근로자는 계약 기간에 제한이 없다.',
  '② 기간제 근로자는 퇴직급여를 받을 수 없다.',
  '③ 기간제 근로자의 계약을 반복 갱신하면 무기계약으로 전환될 수 있다.',
  '④ 정규직은 연차 유급휴가를 받지 못한다.',
  '⑤ 두 형태 모두 계약 기간이 2년으로 정해져 있다.',
];

// 오른쪽: 표를 본문 텍스트 한 덩어리로 붙였을 때 실제로 남는 모양.
const FLAT =
  '구분 정규직 기간제 근로자 계약 기간 정함 없음 2년 이내 갱신 해당 없음 ' +
  '반복 갱신 시 무기계약 전환 퇴직급여 1년 이상 근속 시 지급 1년 이상 근속 시 지급 ' +
  '연차 유급휴가 근속 1년 15일 근속 1년 15일';

export function TableLossCase() {
  return (
    <div style={S.wrap}>
      {/* ---------- 좌 : 원문 ---------- */}
      <div style={{ ...S.col, borderRight: '1px solid #e5e5e5' }}>
        <div style={S.head}>원문 PDF — 표가 표로 남아 있다</div>
        <div style={S.paper}>
          <div style={S.stem}>
            <b style={S.qno}>17.</b> {STEM}
          </div>
          <table style={S.table}>
            <tbody>
              <tr>
                {HEAD.map((h) => (
                  <th key={h} style={{ ...S.cell, ...S.th }}>{h}</th>
                ))}
              </tr>
              {ROWS.map((r) => (
                <tr key={r[0]}>
                  {r.map((c, i) => (
                    <td key={i} style={{ ...S.cell, ...(i === 0 ? S.rowHead : null) }}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <ol style={S.opts}>
            {OPTS.map((o) => (
              <li key={o} style={S.opt}>{o}</li>
            ))}
          </ol>
        </div>
        <div style={S.foot}>열·행 이름이 남아 있어 “기간제 / 갱신” 칸을 짚을 수 있다</div>
      </div>

      {/* ---------- 우 : 텍스트 한 덩어리 ---------- */}
      <div style={S.col}>
        <div style={S.head}>텍스트로만 옮긴 결과 — 관계가 사라졌다</div>
        <div style={S.paper}>
          <div style={S.stem}>
            <b style={S.qno}>17.</b> {STEM}
          </div>
          <p style={S.flat}>{FLAT}</p>
          <ol style={S.opts}>
            {OPTS.map((o) => (
              <li key={o} style={S.opt}>{o}</li>
            ))}
          </ol>
        </div>
        <div style={S.foot}>
          <span style={S.mark}>어느 값이 어느 칸인지 알 수 없다</span> — ③을 판단할 근거가 본문에 남지 않는다
        </div>
      </div>
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  wrap: {
    display: 'grid', gridTemplateColumns: '1fr 1fr', height: '100%',
    background: '#fff', fontFamily: 'Wanted Sans, system-ui, sans-serif', color: '#111',
  },
  col: { display: 'flex', flexDirection: 'column', minWidth: 0 },
  head: {
    fontSize: 10, fontWeight: 700, color: '#8a8a8a',
    padding: '9px 12px', borderBottom: '1px solid #ececec',
  },
  paper: { flex: 1, padding: '11px 12px', overflow: 'hidden' },
  stem: { fontSize: 10.5, lineHeight: 1.5, marginBottom: 8 },
  qno: { marginRight: 3 },
  table: { width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed', marginBottom: 9 },
  cell: {
    border: '1px solid #111', padding: '3px 4px', fontSize: 8.5, lineHeight: 1.35,
    textAlign: 'left', verticalAlign: 'top', wordBreak: 'keep-all',
  },
  th: { background: '#f2f2f2', fontWeight: 700, textAlign: 'center' },
  rowHead: { background: '#fafafa', fontWeight: 600 },
  flat: {
    fontSize: 9, lineHeight: 1.75, color: '#333', margin: '0 0 9px',
    background: '#f7f7f7', border: '1px dashed #c9c9c9', padding: '7px 8px',
    wordBreak: 'keep-all',
  },
  opts: { listStyle: 'none', margin: 0, padding: 0 },
  opt: { fontSize: 9, lineHeight: 1.65, color: '#222', wordBreak: 'keep-all' },
  foot: {
    fontSize: 9, color: '#8a8a8a', padding: '8px 12px', borderTop: '1px solid #ececec',
    lineHeight: 1.5,
  },
  mark: { color: '#CF6B6B', fontWeight: 700 },
};
