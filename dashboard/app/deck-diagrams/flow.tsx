'use client';

// 덱의 순서도를 그대로 그리는 작은 SVG 렌더러.
// 외부 라이브러리를 쓰지 않는다 (앱 CSP 가 외부 스크립트를 막는다).

import React from 'react';

export type Cell = { t: string; k?: 'b' | 'd' | 'k' };
export type Side = { after: number; label: string; text: string; rejoin: number; up?: boolean };

export type VSpec = {
  kind: 'v';
  nodes: Cell[];
  labels?: Record<number, string>;
  sides?: Side[];
};
export type SSpec = {
  kind: 's';
  a: Cell[];
  b: Cell[];
  la?: Record<number, string>;
  lb?: Record<number, string>;
  drop?: { from: number; label: string; text: string };
};
export type Spec = VSpec | SSpec;

const INK = '#111111';
const MUTE = '#6b6b6b';
const AH = 8;

function Head({ x, y, d }: { x: number; y: number; d: 'r' | 'l' | 'd' | 'u' }) {
  const a = AH, h = a * 0.62;
  const p =
    d === 'r' ? `${x - a},${y - h} ${x},${y} ${x - a},${y + h}`
    : d === 'l' ? `${x + a},${y - h} ${x},${y} ${x + a},${y + h}`
    : d === 'd' ? `${x - h},${y - a} ${x + h},${y - a} ${x},${y}`
    : `${x - h},${y + a} ${x + h},${y + a} ${x},${y}`;
  return <polygon points={p} fill={INK} />;
}

function Box({ x, y, w, h, c }: { x: number; y: number; w: number; h: number; c: Cell }) {
  const dark = c.k === 'k';
  const dec = c.k === 'd';
  const lines = c.t.split('\n');
  const fs = w > 200 ? 11.5 : 9.5;
  const top = y + h / 2 - ((lines.length - 1) * fs * 1.35) / 2 + fs * 0.36;
  return (
    <g>
      <rect
        x={x} y={y} width={w} height={h} rx={3}
        fill={dark ? INK : dec ? '#f4f4f4' : '#ffffff'}
        stroke={INK} strokeWidth={dec ? 1.5 : 1}
      />
      {lines.map((ln, i) => (
        <text
          key={i} x={x + w / 2} y={top + i * fs * 1.35}
          textAnchor="middle" fontSize={fs}
          fontWeight={dark || dec ? 600 : 500}
          fill={dark ? '#ffffff' : INK}
        >
          {ln}
        </text>
      ))}
    </g>
  );
}

function Lab({ x, y, t }: { x: number; y: number; t: string }) {
  return <text x={x} y={y} fontSize={9.5} fill={MUTE} textAnchor="middle">{t}</text>;
}

function VFlow({ s }: { s: VSpec }) {
  const BW = 300, BH = 40, P = 58, CX = BW / 2;
  const RX = 340, RW = 192;
  const n = s.nodes.length;
  const H = (n - 1) * P + BH;
  const el: React.ReactNode[] = [];
  s.nodes.forEach((c, i) => el.push(<Box key={`n${i}`} x={0} y={i * P} w={BW} h={BH} c={c} />));
  for (let i = 0; i < n - 1; i++) {
    const y1 = i * P + BH, y2 = (i + 1) * P;
    el.push(<line key={`l${i}`} x1={CX} y1={y1} x2={CX} y2={y2 - AH} stroke={INK} />);
    el.push(<Head key={`h${i}`} x={CX} y={y2} d="d" />);
    if (s.labels?.[i]) el.push(<Lab key={`la${i}`} x={CX + 22} y={(y1 + y2) / 2 + 4} t={s.labels[i]} />);
  }
  (s.sides ?? []).forEach((sd, i) => {
    const sy = sd.after * P;
    const my = sy + BH / 2;
    el.push(<Box key={`sb${i}`} x={RX} y={sy} w={RW} h={BH} c={{ t: sd.text }} />);
    el.push(<line key={`sl${i}`} x1={BW} y1={my} x2={RX - AH} y2={my} stroke={INK} />);
    el.push(<Head key={`sh${i}`} x={RX} y={my} d="r" />);
    el.push(<Lab key={`sa${i}`} x={(BW + RX) / 2} y={my - 6} t={sd.label} />);
    if (sd.rejoin >= 0) {
      const ry = sd.rejoin * P + BH / 2;
      const cx = RX + RW / 2;
      el.push(<line key={`sv${i}`} x1={cx} y1={sy + BH} x2={cx} y2={ry} stroke={INK} />);
      el.push(<line key={`sr${i}`} x1={cx} y1={ry} x2={BW + AH} y2={ry} stroke={INK} />);
      el.push(<Head key={`srh${i}`} x={BW} y={ry} d="l" />);
    }
  });
  return <Svg w={532} h={H}>{el}</Svg>;
}

function SFlow({ s }: { s: SSpec }) {
  const BW = 124, BH = 42, G = 12, Y2 = 96;
  const X = [0, 1, 2, 3].map((i) => i * (BW + G));
  const el: React.ReactNode[] = [];
  s.a.forEach((c, i) => el.push(<Box key={`a${i}`} x={X[i]} y={0} w={BW} h={BH} c={c} />));
  s.b.forEach((c, i) => el.push(<Box key={`b${i}`} x={X[3 - i]} y={Y2} w={BW} h={BH} c={c} />));
  for (let i = 0; i < s.a.length - 1; i++) {
    el.push(<line key={`al${i}`} x1={X[i] + BW} y1={BH / 2} x2={X[i + 1] - AH} y2={BH / 2} stroke={INK} />);
    el.push(<Head key={`ah${i}`} x={X[i + 1]} y={BH / 2} d="r" />);
    if (s.la?.[i]) el.push(<Lab key={`ala${i}`} x={(X[i] + BW + X[i + 1]) / 2} y={BH / 2 - 7} t={s.la[i]} />);
  }
  el.push(<line key="mid" x1={X[3] + BW / 2} y1={BH} x2={X[3] + BW / 2} y2={Y2 - AH} stroke={INK} />);
  el.push(<Head key="midh" x={X[3] + BW / 2} y={Y2} d="d" />);
  for (let i = 0; i < s.b.length - 1; i++) {
    const from = X[3 - i], to = X[3 - i - 1] + BW;
    el.push(<line key={`bl${i}`} x1={from} y1={Y2 + BH / 2} x2={to + AH} y2={Y2 + BH / 2} stroke={INK} />);
    el.push(<Head key={`bh${i}`} x={to} y={Y2 + BH / 2} d="l" />);
    if (s.lb?.[i]) el.push(<Lab key={`bla${i}`} x={(from + to) / 2} y={Y2 + BH / 2 - 7} t={s.lb[i]} />);
  }
  if (s.drop) {
    const fx = X[s.drop.from] + BW / 2;
    el.push(<Box key="dp" x={X[0]} y={Y2} w={BW} h={BH} c={{ t: s.drop.text }} />);
    el.push(<line key="d1" x1={fx} y1={BH} x2={fx} y2={BH + 34} stroke={INK} />);
    el.push(<line key="d2" x1={X[0] + BW / 2} y1={BH + 34} x2={fx} y2={BH + 34} stroke={INK} />);
    el.push(<line key="d3" x1={X[0] + BW / 2} y1={BH + 34} x2={X[0] + BW / 2} y2={Y2 - AH} stroke={INK} />);
    el.push(<Head key="d4" x={X[0] + BW / 2} y={Y2} d="d" />);
    el.push(<Lab key="d5" x={X[0] + BW / 2 + 26} y={BH + 52} t={s.drop.label} />);
  }
  return <Svg w={532} h={Y2 + BH}>{el}</Svg>;
}

function Svg({ w, h, children }: { w: number; h: number; children: React.ReactNode }) {
  return (
    <svg
      viewBox={`-2 -2 ${w + 4} ${h + 4}`}
      width="100%"
      style={{ maxWidth: w, height: 'auto', fontFamily: 'inherit' }}
    >
      {children}
    </svg>
  );
}

export function Flow({ spec }: { spec: Spec }) {
  return spec.kind === 'v' ? <VFlow s={spec} /> : <SFlow s={spec} />;
}
