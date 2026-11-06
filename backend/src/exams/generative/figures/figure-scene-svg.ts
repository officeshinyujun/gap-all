/**
 * 인물 그림 SVG 렌더러: 단정한 회색조 플랫 벡터 반신 인물(기출 삽화처럼 장식용).
 * 그림 안에는 글자를 넣지 않는다. 화자명·발화는 바로 뒤 dialogue 블록이 보여 준다.
 *
 * 인물은 원점(가운데 x=0, 위 y=0) 기준 좌표로 그리고 오른쪽을 바라본다. 왼쪽을 보게 하려면 좌우 반전한다.
 */
import type { PersonAge, PersonGender, SceneFigureSpec, ScenePerson, SceneRole } from './figure-spec';
import { el, svgRoot } from './svg-builder';

const LINE = '#262626';
const SKIN = '#fbfbfb';
const STROKE = 1.7;
const FRAME_BOTTOM = 224;

type Pose = 'down' | 'mic' | 'hold' | 'tablet' | 'gesture' | 'point';

type Outfit = Readonly<{
  body: string;
  sleeve: string;
  pose: Pose;
}>;

const HAIR: Readonly<Record<PersonAge, string>> = {
  child: '#3b3b3b',
  teen: '#2f2f2f',
  adult: '#3a3a3a',
  senior: '#c9c9c9',
};

function outfit(role: SceneRole): Outfit {
  switch (role) {
    case 'reporter':
      return { body: '#c4c4c4', sleeve: '#c4c4c4', pose: 'mic' };
    case 'teacher':
      return { body: '#a3a3a3', sleeve: '#a3a3a3', pose: 'hold' };
    case 'student':
      return { body: '#6f6f6f', sleeve: '#6f6f6f', pose: 'gesture' };
    case 'office':
      return { body: '#ffffff', sleeve: '#ffffff', pose: 'gesture' };
    case 'executive':
      return { body: '#5c5c5c', sleeve: '#5c5c5c', pose: 'gesture' };
    case 'worker':
      return { body: '#7d7d7d', sleeve: '#7d7d7d', pose: 'gesture' };
    case 'engineer':
      return { body: '#9a9a9a', sleeve: '#9a9a9a', pose: 'tablet' };
    case 'doctor':
      return { body: '#ffffff', sleeve: '#ffffff', pose: 'gesture' };
    case 'counselor':
      return { body: '#b8b8b8', sleeve: '#b8b8b8', pose: 'hold' };
    case 'chef':
      return { body: '#ffffff', sleeve: '#ffffff', pose: 'gesture' };
    case 'farmer':
      return { body: '#cfcfcf', sleeve: '#cfcfcf', pose: 'gesture' };
    case 'researcher':
      return { body: '#ffffff', sleeve: '#ffffff', pose: 'tablet' };
    case 'presenter':
      return { body: '#8f8f8f', sleeve: '#8f8f8f', pose: 'mic' };
    case 'citizen':
      return { body: '#adadad', sleeve: '#adadad', pose: 'gesture' };
  }
}

type Rig = Readonly<{
  /** 전체 세로 이동(아이는 아래로) */
  dy: number;
  headRx: number;
  headRy: number;
  headCy: number;
  neckTop: number;
  neckBottom: number;
  /** 어깨 반폭 */
  shoulder: number;
  shoulderY: number;
}>;

function rig(person: ScenePerson): Rig {
  const male = person.gender === 'male';
  switch (person.age) {
    case 'child':
      return { dy: 0, headRx: 30, headRy: 33, headCy: 96, neckTop: 122, neckBottom: 140, shoulder: 40, shoulderY: 152 };
    case 'teen':
      return { dy: 0, headRx: 28, headRy: 34, headCy: 76, neckTop: 102, neckBottom: 122, shoulder: male ? 52 : 47, shoulderY: 136 };
    default:
      return { dy: 0, headRx: 28, headRy: 34, headCy: 70, neckTop: 96, neckBottom: 116, shoulder: male ? 58 : 51, shoulderY: 130 };
  }
}

/** 외곽선이 있는 굵은 팔(소매): 진한 선 위에 같은 경로를 소매색으로 한 번 더 */
function limb(d: string, color: string, width: number): string {
  return [
    el('path', { d, fill: 'none', stroke: LINE, 'stroke-width': width + STROKE * 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
    el('path', { d, fill: 'none', stroke: color, 'stroke-width': width, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }),
  ].join('');
}

function hand(x: number, y: number, r = 7.5): string {
  return el('ellipse', { cx: x, cy: y, rx: r, ry: r * 0.92, fill: SKIN, stroke: LINE, 'stroke-width': STROKE });
}

/**
 * 몸통 실루엣: 먼 쪽(왼쪽)은 내린 팔까지 포함한 외곽, 가까운 쪽은 팔을 내렸으면 팔까지, 팔을 들었으면 몸통만.
 * 팔과 몸의 경계는 armCrease로 선만 긋는다(기출 삽화처럼 단순하게).
 */
function torsoPath(r: Rig, nearArmDown: boolean): string {
  const s = r.shoulder;
  const top = r.neckBottom - 3;
  const sy = r.shoulderY;
  const bottom = FRAME_BOTTOM + 10;
  const near = nearArmDown ? s : s - 13;
  return [
    `M${-13} ${top}`,
    `C${-28} ${top + 3} ${-s + 2} ${sy - 12} ${-s - 3} ${sy + 10}`,
    `C${-s - 6} ${sy + 40} ${-s - 6} ${bottom - 40} ${-s - 4} ${bottom}`,
    `L${near + 4} ${bottom}`,
    nearArmDown
      ? `C${s + 6} ${bottom - 40} ${s + 6} ${sy + 40} ${s + 3} ${sy + 10}`
      : `C${near + 2} ${bottom - 40} ${near + 1} ${sy + 40} ${near} ${sy + 10}`,
    `C${s - 2} ${sy - 12} ${28} ${top + 3} ${13} ${top}`,
    'Z',
  ].join('');
}

function armCrease(r: Rig, sign: 1 | -1): string {
  const s = r.shoulder;
  const sy = r.shoulderY;
  return el('path', {
    d: `M${sign * (s - 17)} ${sy + 28}C${sign * (s - 15)} ${sy + 50} ${sign * (s - 15)} ${FRAME_BOTTOM - 20} ${sign * (s - 16)} ${FRAME_BOTTOM + 10}`,
    fill: 'none',
    stroke: LINE,
    'stroke-width': 1.4,
    'stroke-linecap': 'round',
  });
}

function backHair(person: ScenePerson, r: Rig): string {
  if (person.gender !== 'female') return '';
  const color = HAIR[person.age];
  const { headRx: rx, headCy: cy } = r;
  if (person.age === 'senior') return '';
  if (person.age === 'child') {
    // 양 갈래 묶음
    return [
      el('ellipse', { cx: -rx - 8, cy: cy + 6, rx: 9, ry: 15, fill: color, stroke: LINE, 'stroke-width': STROKE }),
      el('ellipse', { cx: rx + 8, cy: cy + 6, rx: 9, ry: 15, fill: color, stroke: LINE, 'stroke-width': STROKE }),
    ].join('');
  }
  // 어깨 길이 단발(뒷머리)
  const bottom = r.neckBottom + 14;
  const d = [
    `M${-rx - 4} ${cy - 6}`,
    `C${-rx - 8} ${cy + 30} ${-rx - 10} ${bottom - 10} ${-rx + 2} ${bottom}`,
    `L${rx - 2} ${bottom}`,
    `C${rx + 10} ${bottom - 10} ${rx + 8} ${cy + 30} ${rx + 4} ${cy - 6}`,
    'Z',
  ].join('');
  return el('path', { d, fill: color, stroke: LINE, 'stroke-width': STROKE, 'stroke-linejoin': 'round' });
}

function frontHair(person: ScenePerson, r: Rig, hatted: boolean): string {
  const color = HAIR[person.age];
  const { headRx: rx, headRy: ry, headCy: cy } = r;
  const top = cy - ry;
  if (person.gender === 'male') {
    if (person.age === 'senior') {
      // 옆머리만 남은 회색 머리
      return [
        el('path', { d: `M${-rx - 1} ${cy + 2}C${-rx - 3} ${cy - 16} ${-rx + 4} ${cy - 24} ${-rx + 12} ${cy - 25}L${-rx + 8} ${cy - 8}Z`, fill: color, stroke: LINE, 'stroke-width': STROKE, 'stroke-linejoin': 'round' }),
        el('path', { d: `M${rx + 1} ${cy + 2}C${rx + 3} ${cy - 16} ${rx - 4} ${cy - 24} ${rx - 12} ${cy - 25}L${rx - 8} ${cy - 8}Z`, fill: color, stroke: LINE, 'stroke-width': STROKE, 'stroke-linejoin': 'round' }),
      ].join('');
    }
    if (hatted) {
      return el('path', { d: `M${-rx - 1} ${cy + 4}C${-rx - 2} ${cy - 10} ${-rx + 2} ${cy - 18} ${-rx + 8} ${cy - 20}L${-rx + 6} ${cy - 2}Z`, fill: color, stroke: LINE, 'stroke-width': STROKE, 'stroke-linejoin': 'round' });
    }
    // 짧은 머리, 오른쪽(바라보는 쪽)으로 넘긴 앞머리
    const d = [
      `M${-rx - 1} ${cy + 4}`,
      `C${-rx - 5} ${cy - 22} ${-rx + 2} ${top - 4} ${-2} ${top - 5}`,
      `C${rx - 4} ${top - 6} ${rx + 4} ${cy - 18} ${rx + 1} ${cy - 2}`,
      `C${rx - 4} ${cy - 13} ${rx - 14} ${cy - 18} ${2} ${cy - 21}`,
      `C${-8} ${cy - 16} ${-rx + 6} ${cy - 14} ${-rx + 5} ${cy - 2}`,
      'Z',
    ].join('');
    return el('path', { d, fill: color, stroke: LINE, 'stroke-width': STROKE, 'stroke-linejoin': 'round' });
  }
  if (person.age === 'senior') {
    // 짧게 볶은 회색 머리: 물결 가장자리
    const d = [
      `M${-rx - 3} ${cy + 8}`,
      `C${-rx - 9} ${cy - 6} ${-rx - 6} ${cy - 22} ${-rx + 4} ${cy - 26}`,
      `C${-rx + 6} ${top - 6} ${-4} ${top - 9} ${4} ${top - 5}`,
      `C${14} ${top - 9} ${rx + 6} ${top - 2} ${rx + 4} ${cy - 22}`,
      `C${rx + 10} ${cy - 14} ${rx + 8} ${cy - 2} ${rx + 3} ${cy + 8}`,
      `C${rx} ${cy - 6} ${rx - 6} ${cy - 14} ${rx - 14} ${cy - 17}`,
      `C${rx - 22} ${cy - 13} ${-rx + 10} ${cy - 18} ${-rx + 4} ${cy - 8}`,
      'Z',
    ].join('');
    return el('path', { d, fill: color, stroke: LINE, 'stroke-width': STROKE, 'stroke-linejoin': 'round' });
  }
  if (hatted) {
    return [
      el('path', { d: `M${-rx - 2} ${cy + 10}C${-rx - 3} ${cy - 8} ${-rx + 2} ${cy - 18} ${-rx + 10} ${cy - 20}L${-rx + 6} ${cy + 2}Z`, fill: color, stroke: LINE, 'stroke-width': STROKE, 'stroke-linejoin': 'round' }),
      el('path', { d: `M${rx + 2} ${cy + 10}C${rx + 3} ${cy - 8} ${rx - 2} ${cy - 18} ${rx - 10} ${cy - 20}L${rx - 6} ${cy + 2}Z`, fill: color, stroke: LINE, 'stroke-width': STROKE, 'stroke-linejoin': 'round' }),
    ].join('');
  }
  // 이마를 덮는 옆 가르마 앞머리 + 얼굴 양옆 머리
  const d = [
    `M${-rx - 4} ${cy + 18}`,
    `C${-rx - 8} ${cy - 18} ${-rx + 2} ${top - 6} ${2} ${top - 6}`,
    `C${rx - 2} ${top - 6} ${rx + 8} ${cy - 18} ${rx + 4} ${cy + 18}`,
    `L${rx - 2} ${cy + 16}`,
    `C${rx} ${cy - 2} ${rx - 2} ${cy - 12} ${rx - 8} ${cy - 16}`,
    `C${rx - 18} ${cy - 10} ${-6} ${cy - 14} ${-12} ${cy - 22}`,
    `C${-16} ${cy - 14} ${-rx + 4} ${cy - 8} ${-rx + 2} ${cy + 16}`,
    'Z',
  ].join('');
  const tail = person.age === 'teen'
    ? el('path', { d: `M${-rx + 2} ${cy - 18}C${-rx - 16} ${cy - 12} ${-rx - 18} ${cy + 18} ${-rx - 8} ${cy + 34}C${-rx - 4} ${cy + 18} ${-rx - 4} ${cy} ${-rx + 4} ${cy - 8}Z`, fill: color, stroke: LINE, 'stroke-width': STROKE, 'stroke-linejoin': 'round' })
    : '';
  return tail + el('path', { d, fill: color, stroke: LINE, 'stroke-width': STROKE, 'stroke-linejoin': 'round' });
}

function face(person: ScenePerson, r: Rig, goggles: boolean): string {
  const { headCy: cy } = r;
  const dx = 4; // 오른쪽을 바라보도록 이목구비를 조금 오른쪽으로
  const eyeY = cy + 2;
  const parts: string[] = [];
  // 귀(먼 쪽은 가려지므로 왼쪽 귀만)
  parts.push(el('path', { d: `M${-r.headRx + 1} ${cy - 2}C${-r.headRx - 8} ${cy - 5} ${-r.headRx - 8} ${cy + 12} ${-r.headRx + 1} ${cy + 10}`, fill: SKIN, stroke: LINE, 'stroke-width': STROKE }));
  if (!goggles) {
    parts.push(el('ellipse', { cx: -8 + dx, cy: eyeY, rx: 2.3, ry: 2.9, fill: LINE }));
    parts.push(el('ellipse', { cx: 9 + dx, cy: eyeY, rx: 2.3, ry: 2.9, fill: LINE }));
    const brow = person.age === 'senior' ? '#8a8a8a' : LINE;
    parts.push(el('path', { d: `M${-13 + dx} ${eyeY - 8}Q${-8 + dx} ${eyeY - 11} ${-3 + dx} ${eyeY - 8.5}`, fill: 'none', stroke: brow, 'stroke-width': 1.8, 'stroke-linecap': 'round' }));
    parts.push(el('path', { d: `M${4 + dx} ${eyeY - 8.5}Q${9 + dx} ${eyeY - 11} ${14 + dx} ${eyeY - 8}`, fill: 'none', stroke: brow, 'stroke-width': 1.8, 'stroke-linecap': 'round' }));
    if (person.gender === 'female' && person.age !== 'child') {
      parts.push(el('path', { d: `M${11.2 + dx} ${eyeY - 2.4}l2.6 -1.6`, stroke: LINE, 'stroke-width': 1.2, 'stroke-linecap': 'round' }));
    }
  }
  // 코·입
  parts.push(el('path', { d: `M${2 + dx} ${eyeY + 5}Q${5.5 + dx} ${eyeY + 12} ${1 + dx} ${eyeY + 13}`, fill: 'none', stroke: LINE, 'stroke-width': 1.4, 'stroke-linecap': 'round' }));
  parts.push(el('path', { d: `M${-6 + dx} ${eyeY + 19}Q${0.5 + dx} ${eyeY + 24.5} ${7 + dx} ${eyeY + 19}`, fill: 'none', stroke: LINE, 'stroke-width': 1.7, 'stroke-linecap': 'round' }));
  if (person.age === 'senior') {
    // 노년: 안경과 눈가 주름
    parts.push(el('rect', { x: -15 + dx, y: eyeY - 6, width: 13, height: 11, rx: 3.5, fill: 'none', stroke: LINE, 'stroke-width': 1.4 }));
    parts.push(el('rect', { x: 2 + dx, y: eyeY - 6, width: 13, height: 11, rx: 3.5, fill: 'none', stroke: LINE, 'stroke-width': 1.4 }));
    parts.push(el('path', { d: `M${-2 + dx} ${eyeY - 2}h4M${-15 + dx} ${eyeY - 2}L${-r.headRx + 2} ${eyeY - 4}`, stroke: LINE, 'stroke-width': 1.4 }));
  }
  if (goggles) {
    parts.push(el('rect', { x: -r.headRx + 1, y: eyeY - 5, width: r.headRx * 2 - 1, height: 3.5, fill: '#666', stroke: 'none' }));
    parts.push(el('rect', { x: -17 + dx, y: eyeY - 8, width: 34, height: 15, rx: 6, fill: '#e9e9e9', stroke: LINE, 'stroke-width': 1.6 }));
    parts.push(el('line', { x1: dx, y1: eyeY - 7, x2: dx, y2: eyeY + 6, stroke: LINE, 'stroke-width': 1.1 }));
    parts.push(el('ellipse', { cx: -8 + dx, cy: eyeY, rx: 2, ry: 2.5, fill: LINE }));
    parts.push(el('ellipse', { cx: 9 + dx, cy: eyeY, rx: 2, ry: 2.5, fill: LINE }));
  }
  return parts.join('');
}

/** 옷 무늬(깃·넥타이·조끼 띠 등): 몸통 위에 그린다. */
function clothing(person: ScenePerson, r: Rig): string {
  const top = r.neckBottom - 3;
  const s = r.shoulder;
  const male = person.gender === 'male';
  const parts: string[] = [];
  const collar = (fill: string) => [
    el('path', { d: `M-13 ${top}L-2 ${top + 17}L-15 ${top + 13}L-17 ${top + 2}Z`, fill, stroke: LINE, 'stroke-width': 1.4, 'stroke-linejoin': 'round' }),
    el('path', { d: `M13 ${top}L2 ${top + 17}L15 ${top + 13}L17 ${top + 2}Z`, fill, stroke: LINE, 'stroke-width': 1.4, 'stroke-linejoin': 'round' }),
  ].join('');
  const tie = (fill: string) => el('path', { d: `M-3.5 ${top + 9}L3.5 ${top + 9}L5.5 ${top + 52}L0 ${top + 60}L-5.5 ${top + 52}Z`, fill, stroke: LINE, 'stroke-width': 1.3, 'stroke-linejoin': 'round' });
  const vNeck = (fill: string, depth: number, width: number) =>
    el('path', { d: `M-${width} ${top - 1}L0 ${top + depth}L${width} ${top - 1}Z`, fill, stroke: LINE, 'stroke-width': 1.4, 'stroke-linejoin': 'round' });
  const lapels = (fill: string, depth: number) => [
    el('path', { d: `M-15 ${top}L-2 ${top + depth}L-12 ${top + depth - 8}L-24 ${top + 18}L-20 ${top + 6}Z`, fill, stroke: LINE, 'stroke-width': 1.4, 'stroke-linejoin': 'round' }),
    el('path', { d: `M15 ${top}L2 ${top + depth}L12 ${top + depth - 8}L24 ${top + 18}L20 ${top + 6}Z`, fill, stroke: LINE, 'stroke-width': 1.4, 'stroke-linejoin': 'round' }),
  ].join('');
  const centerLine = (from: number) => el('line', { x1: 0, y1: from, x2: 0, y2: FRAME_BOTTOM + 4, stroke: LINE, 'stroke-width': 1.3 });
  switch (person.role) {
    case 'office':
      parts.push(collar('#fff'), tie('#4a4a4a'), centerLine(top + 60));
      // 사원증 목줄
      parts.push(el('path', { d: `M-15 ${top + 3}L-9 ${top + 58}M15 ${top + 3}L9 ${top + 58}`, fill: 'none', stroke: '#555', 'stroke-width': 1.6 }));
      parts.push(el('rect', { x: -12, y: top + 56, width: 24, height: 30, rx: 2, fill: '#fff', stroke: LINE, 'stroke-width': 1.3 }));
      parts.push(el('rect', { x: -7, y: top + 61, width: 14, height: 11, fill: '#bdbdbd' }));
      break;
    case 'executive':
      parts.push(vNeck('#fff', 62, 18), tie('#2c2c2c'), lapels('#4a4a4a', 66), centerLine(top + 66));
      parts.push(el('circle', { cx: 4.5, cy: top + 84, r: 2, fill: '#2a2a2a' }), el('circle', { cx: 4.5, cy: top + 104, r: 2, fill: '#2a2a2a' }));
      break;
    case 'presenter':
      parts.push(vNeck(male ? '#fff' : '#e2e2e2', male ? 54 : 36, male ? 16 : 18));
      if (male) parts.push(tie('#3c3c3c'));
      parts.push(lapels('#7a7a7a', male ? 58 : 44), centerLine(top + (male ? 58 : 44)));
      break;
    case 'reporter':
      parts.push(vNeck('#ececec', 34, 17), lapels('#adadad', 44));
      break;
    case 'teacher':
      parts.push(vNeck('#fff', 30, 16), collar('#fff'));
      parts.push(el('path', { d: `M-17 ${top + 1}L-4 ${top + 44}L-4 ${FRAME_BOTTOM + 4}M17 ${top + 1}L4 ${top + 44}L4 ${FRAME_BOTTOM + 4}`, fill: 'none', stroke: LINE, 'stroke-width': 1.3 }));
      break;
    case 'student':
      parts.push(vNeck('#fff', 46, 16), collar('#fff'));
      parts.push(male ? tie('#3a3a3a') : el('path', { d: `M-11 ${top + 18}L0 ${top + 24}L11 ${top + 18}L9 ${top + 32}L0 ${top + 27}L-9 ${top + 32}Z`, fill: '#3a3a3a', stroke: LINE, 'stroke-width': 1.2 }));
      parts.push(lapels('#5d5d5d', 50), centerLine(top + 50));
      // 이름표
      parts.push(el('rect', { x: -s * 0.62, y: top + 46, width: 18, height: 6, fill: '#fff', stroke: LINE, 'stroke-width': 1 }));
      break;
    case 'worker': {
      parts.push(collar('#9a9a9a'));
      // 안전 조끼: 앞판 두 장 + 반사띠
      const vest = (sign: 1 | -1) => el('path', { d: `M${sign * 13} ${top + 1}C${sign * 26} ${top + 4} ${sign * (s - 10)} ${r.shoulderY - 6} ${sign * (s - 6)} ${r.shoulderY + 10}L${sign * (s - 4)} ${FRAME_BOTTOM + 6}L${sign * 3} ${FRAME_BOTTOM + 6}L${sign * 3} ${top + 30}Z`, fill: '#d9d9d9', stroke: LINE, 'stroke-width': 1.4, 'stroke-linejoin': 'round' });
      parts.push(vest(-1), vest(1));
      for (const y of [top + 62, top + 84]) {
        parts.push(el('rect', { x: -s + 6, y, width: s - 9, height: 8, fill: '#fff', stroke: LINE, 'stroke-width': 1.1 }));
        parts.push(el('rect', { x: 3, y, width: s - 9, height: 8, fill: '#fff', stroke: LINE, 'stroke-width': 1.1 }));
      }
      break;
    }
    case 'engineer':
      parts.push(collar('#bdbdbd'), centerLine(top + 12));
      parts.push(el('rect', { x: 10, y: top + 38, width: 20, height: 16, fill: 'none', stroke: LINE, 'stroke-width': 1.2 }));
      parts.push(el('line', { x1: 10, y1: top + 43, x2: 30, y2: top + 43, stroke: LINE, 'stroke-width': 1.1 }));
      break;
    case 'doctor':
    case 'researcher':
      parts.push(vNeck('#b9b9b9', 40, 17), collar('#fff'), lapels('#fff', 52), centerLine(top + 52));
      parts.push(el('rect', { x: s * 0.38, y: top + 46, width: 18, height: 15, fill: 'none', stroke: LINE, 'stroke-width': 1.2 }));
      parts.push(el('path', { d: `M${s * 0.38 + 5} ${top + 46}v-6`, stroke: '#555', 'stroke-width': 2.2, 'stroke-linecap': 'round' }));
      if (person.role === 'doctor') {
        parts.push(el('path', { d: `M-19 ${top + 4}C-26 ${top + 30} -24 ${top + 52} -10 ${top + 58}M19 ${top + 4}C24 ${top + 26} 20 ${top + 44} 12 ${top + 50}`, fill: 'none', stroke: '#3d3d3d', 'stroke-width': 2.6, 'stroke-linecap': 'round' }));
        parts.push(el('circle', { cx: -8, cy: top + 60, r: 5.5, fill: '#cfcfcf', stroke: LINE, 'stroke-width': 1.4 }));
      }
      break;
    case 'counselor':
      parts.push(vNeck('#fff', 36, 17));
      parts.push(el('path', { d: `M-17 ${top + 1}L-3 ${top + 38}L-3 ${FRAME_BOTTOM + 4}`, fill: 'none', stroke: LINE, 'stroke-width': 1.3 }));
      parts.push(el('path', { d: `M17 ${top + 1}L3 ${top + 38}`, fill: 'none', stroke: LINE, 'stroke-width': 1.3 }));
      for (const y of [top + 52, top + 72, top + 92]) parts.push(el('circle', { cx: 0, cy: y, r: 2, fill: '#555' }));
      break;
    case 'chef':
      parts.push(el('path', { d: `M-16 ${top}C-8 ${top + 10} 8 ${top + 10} 16 ${top}L13 ${top + 12}C6 ${top + 18} -6 ${top + 18} -13 ${top + 12}Z`, fill: '#8f8f8f', stroke: LINE, 'stroke-width': 1.3 }));
      parts.push(el('path', { d: `M-12 ${top + 18}L14 ${top + 46}L14 ${FRAME_BOTTOM + 4}`, fill: 'none', stroke: LINE, 'stroke-width': 1.3 }));
      for (const y of [top + 40, top + 62, top + 84]) {
        parts.push(el('circle', { cx: 6, cy: y, r: 2.2, fill: '#555' }), el('circle', { cx: 24, cy: y, r: 2.2, fill: '#555' }));
      }
      break;
    case 'farmer': {
      // 셔츠 깃 + 멜빵 작업복
      parts.push(collar('#e6e6e6'));
      parts.push(el('path', { d: `M-${s - 14} ${top + 60}L${s - 14} ${top + 60}L${s - 12} ${FRAME_BOTTOM + 6}L-${s - 12} ${FRAME_BOTTOM + 6}Z`, fill: '#7c7c7c', stroke: LINE, 'stroke-width': 1.4 }));
      parts.push(el('rect', { x: -12, y: top + 72, width: 24, height: 18, fill: 'none', stroke: '#2f2f2f', 'stroke-width': 1.2 }));
      parts.push(el('path', { d: `M-${s - 18} ${top + 62}L-${s - 24} ${r.shoulderY - 6}M${s - 18} ${top + 62}L${s - 24} ${r.shoulderY - 6}`, stroke: '#7c7c7c', 'stroke-width': 7, 'stroke-linecap': 'round' }));
      parts.push(el('circle', { cx: -(s - 18), cy: top + 64, r: 2.4, fill: '#eee', stroke: LINE, 'stroke-width': 1 }), el('circle', { cx: s - 18, cy: top + 64, r: 2.4, fill: '#eee', stroke: LINE, 'stroke-width': 1 }));
      break;
    }
    case 'citizen':
      parts.push(el('path', { d: `M-16 ${top}C-10 ${top + 14} 10 ${top + 14} 16 ${top}`, fill: 'none', stroke: LINE, 'stroke-width': 1.4 }));
      parts.push(el('path', { d: `M-13 ${top + 1}C-8 ${top + 9} 8 ${top + 9} 13 ${top + 1}`, fill: 'none', stroke: '#777', 'stroke-width': 1.1 }));
      break;
  }
  return parts.join('');
}

function hat(person: ScenePerson, r: Rig): string {
  const { headRx: rx, headRy: ry, headCy: cy } = r;
  const top = cy - ry;
  switch (person.role) {
    case 'worker':
    case 'engineer':
      return [
        el('path', { d: `M${-rx - 4} ${cy - 12}C${-rx - 4} ${top - 16} ${rx + 4} ${top - 16} ${rx + 4} ${cy - 12}Z`, fill: person.role === 'worker' ? '#f3f3f3' : '#d4d4d4', stroke: LINE, 'stroke-width': STROKE, 'stroke-linejoin': 'round' }),
        el('path', { d: `M-4 ${top - 9}L-3 ${cy - 13}M4 ${top - 9}L3 ${cy - 13}`, stroke: LINE, 'stroke-width': 1.2 }),
        el('path', { d: `M${-rx - 8} ${cy - 12}L${rx + 14} ${cy - 12}Q${rx + 16} ${cy - 7} ${rx + 8} ${cy - 7}L${-rx - 6} ${cy - 7}Q${-rx - 10} ${cy - 9} ${-rx - 8} ${cy - 12}Z`, fill: person.role === 'worker' ? '#f3f3f3' : '#d4d4d4', stroke: LINE, 'stroke-width': STROKE, 'stroke-linejoin': 'round' }),
      ].join('');
    case 'chef':
      return [
        el('path', { d: `M${-rx + 3} ${cy - 14}L${-rx + 1} ${top - 4}C${-rx - 12} ${top - 10} ${-rx - 6} ${top - 32} ${-10} ${top - 26}C${-6} ${top - 38} ${14} ${top - 37} ${13} ${top - 26}C${rx + 6} ${top - 33} ${rx + 14} ${top - 10} ${rx - 1} ${top - 4}L${rx - 3} ${cy - 14}Z`, fill: '#fff', stroke: LINE, 'stroke-width': STROKE, 'stroke-linejoin': 'round' }),
        el('line', { x1: -rx + 1, y1: top, x2: rx - 1, y2: top, stroke: LINE, 'stroke-width': 1.3 }),
      ].join('');
    case 'farmer':
      return [
        el('path', { d: `M${-rx - 26} ${cy - 13}Q0 ${cy - 26} ${rx + 26} ${cy - 13}Q${rx + 20} ${cy - 6} ${rx + 8} ${cy - 9}L${-rx - 8} ${cy - 9}Q${-rx - 20} ${cy - 6} ${-rx - 26} ${cy - 13}Z`, fill: '#e3e3e3', stroke: LINE, 'stroke-width': STROKE, 'stroke-linejoin': 'round' }),
        el('path', { d: `M${-rx + 1} ${cy - 17}C${-rx + 1} ${top - 14} ${rx - 1} ${top - 14} ${rx - 1} ${cy - 17}Z`, fill: '#e3e3e3', stroke: LINE, 'stroke-width': STROKE }),
        el('path', { d: `M${-rx + 1} ${cy - 17}L${rx - 1} ${cy - 17}L${rx - 2} ${cy - 24}L${-rx + 2} ${cy - 24}Z`, fill: '#8c8c8c', stroke: LINE, 'stroke-width': 1.2 }),
      ].join('');
    default:
      return '';
  }
}

/** 팔과 소품. 오른쪽(바라보는 쪽) 팔이 자세를 만든다. 먼 쪽 팔은 몸통 실루엣에 포함되어 있다. */
function arms(person: ScenePerson, r: Rig, style: Outfit, pose: Pose): string {
  const s = r.shoulder;
  const sy = r.shoulderY;
  const width = person.age === 'child' ? 16 : 19;
  const parts: string[] = [armCrease(r, -1)];
  const shoulder = `M${s - 9} ${sy + 4}`;
  const elbowX = s + 1;
  const elbowY = sy + 52;
  switch (pose) {
    case 'down':
      parts.push(armCrease(r, 1));
      break;
    case 'mic': {
      // 마이크를 상대 쪽(앞)으로 내민다.
      const hx = s + 20;
      const hy = sy + 14;
      parts.push(limb(`${shoulder}L${elbowX} ${elbowY}L${hx} ${hy}`, style.sleeve, width));
      parts.push(el('path', { d: `M${hx + 1} ${hy + 2}L${hx + 13} ${hy - 17}`, stroke: '#3a3a3a', 'stroke-width': 5.5, 'stroke-linecap': 'round' }));
      parts.push(el('circle', { cx: hx + 16.5, cy: hy - 23, r: 7.5, fill: '#5a5a5a', stroke: LINE, 'stroke-width': 1.4 }));
      parts.push(el('path', { d: `M${hx + 10} ${hy - 25}h13M${hx + 10.5} ${hy - 20.5}h12`, stroke: '#9a9a9a', 'stroke-width': 1 }));
      parts.push(hand(hx, hy));
      break;
    }
    case 'hold': {
      // 책·서류를 가슴 앞에 든다.
      const isBook = person.role === 'teacher';
      const bx = -4;
      const by = sy + 18;
      const rotate = `rotate(-8 ${bx + 22} ${by + 27})`;
      parts.push(el('rect', { x: bx, y: by, width: 44, height: 54, rx: 2, fill: isBook ? '#7a7a7a' : '#f2f2f2', stroke: LINE, 'stroke-width': 1.5, transform: rotate }));
      if (isBook) {
        parts.push(el('rect', { x: bx + 4, y: by + 4, width: 36, height: 46, fill: 'none', stroke: '#c4c4c4', 'stroke-width': 1, transform: rotate }));
      } else {
        parts.push(el('rect', { x: bx + 14, y: by - 3, width: 16, height: 7, rx: 1.5, fill: '#888', stroke: LINE, 'stroke-width': 1.1, transform: rotate }));
        parts.push(el('path', { d: `M${bx + 8} ${by + 16}h28M${bx + 8} ${by + 26}h28M${bx + 8} ${by + 36}h18`, stroke: '#9a9a9a', 'stroke-width': 1.3, transform: rotate }));
      }
      parts.push(limb(`${shoulder}L${elbowX} ${elbowY + 4}L${bx + 30} ${by + 50}`, style.sleeve, width));
      parts.push(hand(bx + 30, by + 50));
      break;
    }
    case 'tablet': {
      const tx = -2;
      const ty = sy + 28;
      const rotate = `rotate(-12 ${tx + 24} ${ty + 17})`;
      parts.push(limb(`${shoulder}L${elbowX} ${elbowY + 6}L${tx + 40} ${ty + 30}`, style.sleeve, width));
      parts.push(el('rect', { x: tx, y: ty, width: 48, height: 34, rx: 4, fill: '#3d3d3d', stroke: LINE, 'stroke-width': 1.4, transform: rotate }));
      parts.push(el('rect', { x: tx + 5, y: ty + 4, width: 38, height: 26, rx: 1.5, fill: '#dcdcdc', transform: rotate }));
      parts.push(hand(tx + 42, ty + 31));
      break;
    }
    case 'gesture': {
      // 손바닥을 펴 앞으로(설명하는 자세)
      const hx = s + 20;
      const hy = sy + 36;
      parts.push(limb(`${shoulder}L${elbowX} ${elbowY + 2}L${hx} ${hy}`, style.sleeve, width));
      parts.push(openHand(hx, hy));
      break;
    }
    case 'point': {
      // 보드를 가리키는 팔(발표자 배치)
      const hx = s + 46;
      const hy = sy - 6;
      parts.push(limb(`${shoulder}L${s + 18} ${sy + 34}L${hx} ${hy}`, style.sleeve, width));
      parts.push(openHand(hx, hy));
      break;
    }
  }
  return parts.join('');
}

/** 앞으로 편 손(손바닥 위, 엄지 위로) */
function openHand(x: number, y: number): string {
  return el('path', {
    d: `M${x - 6} ${y + 6}C${x - 8} ${y - 3} ${x - 1} ${y - 9} ${x + 8} ${y - 9}C${x + 14} ${y - 9} ${x + 15} ${y - 5} ${x + 11} ${y - 4}L${x + 5} ${y - 3}C${x + 10} ${y} ${x + 9} ${y + 6} ${x + 2} ${y + 8}Z`,
    fill: SKIN,
    stroke: LINE,
    'stroke-width': STROKE,
    'stroke-linejoin': 'round',
  });
}

/** 인물 한 명(원점 기준, 오른쪽을 바라봄) */
export function personSvg(person: ScenePerson, poseOverride?: Pose): string {
  const r = rig(person);
  const style = outfit(person.role);
  const pose = poseOverride ?? style.pose;
  const hatted = person.role === 'worker' || person.role === 'engineer' || person.role === 'chef' || person.role === 'farmer';
  const parts: string[] = [];
  parts.push(backHair(person, r));
  parts.push(el('rect', { x: -9.5, y: r.neckTop, width: 19, height: r.neckBottom - r.neckTop + 6, fill: SKIN, stroke: LINE, 'stroke-width': STROKE }));
  parts.push(el('path', { d: torsoPath(r, pose === 'down'), fill: style.body, stroke: LINE, 'stroke-width': STROKE, 'stroke-linejoin': 'round' }));
  parts.push(clothing(person, r));
  parts.push(el('ellipse', { cx: 0, cy: r.headCy, rx: r.headRx, ry: r.headRy, fill: SKIN, stroke: LINE, 'stroke-width': STROKE }));
  parts.push(face(person, r, person.role === 'researcher'));
  parts.push(frontHair(person, r, hatted));
  parts.push(hat(person, r));
  parts.push(arms(person, r, style, pose));
  return parts.join('');
}

const SCENE_SIZES = {
  single: { width: 240, height: 224 },
  pair: { width: 480, height: 224 },
  presenter: { width: 520, height: 240 },
} as const;

export function renderSceneSvg(spec: SceneFigureSpec, prefix: string): string {
  const size = SCENE_SIZES[spec.layout];
  const clipId = `${prefix}-clip`;
  const clip = el('defs', {}, el('clipPath', { id: clipId }, el('rect', { x: 0, y: 0, width: size.width, height: size.height })));
  const body: string[] = [];
  const [first, second] = spec.people;
  if (spec.layout === 'pair' && first !== undefined && second !== undefined) {
    // 왼쪽 사람은 오른쪽을, 오른쪽 사람은 왼쪽을 바라본다(좌우 반전).
    body.push(el('g', { transform: 'translate(140 8)' }, personSvg(first)));
    body.push(el('g', { transform: 'translate(340 8) scale(-1 1)' }, personSvg(second)));
  } else if (spec.layout === 'presenter' && first !== undefined) {
    body.push(board());
    body.push(el('g', { transform: 'translate(118 6)' }, personSvg(first, 'point')));
    body.push(podium());
  } else if (first !== undefined) {
    body.push(el('g', { transform: `translate(${size.width / 2 - 8} 8)` }, personSvg(first)));
  }
  return svgRoot(size.width, size.height, [clip, el('g', { 'clip-path': `url(#${clipId})` }, body)]);
}

/** 발표 연단: 인물 허리 아래를 가린다. */
function podium(): string {
  return [
    el('path', { d: 'M54 186L186 186L176 250L64 250Z', fill: '#bdbdbd', stroke: LINE, 'stroke-width': STROKE, 'stroke-linejoin': 'round' }),
    el('rect', { x: 46, y: 178, width: 148, height: 12, rx: 2, fill: '#8e8e8e', stroke: LINE, 'stroke-width': STROKE }),
    el('rect', { x: 94, y: 202, width: 52, height: 22, rx: 2, fill: 'none', stroke: '#6a6a6a', 'stroke-width': 1.3 }),
  ].join('');
}

/** 글자 없는 빈 보드(화이트보드) */
function board(): string {
  return [
    el('rect', { x: 272, y: 14, width: 232, height: 172, rx: 4, fill: '#5f5f5f', stroke: LINE, 'stroke-width': STROKE }),
    el('rect', { x: 281, y: 23, width: 214, height: 154, rx: 2, fill: '#fafafa', stroke: LINE, 'stroke-width': 1.1 }),
    el('rect', { x: 352, y: 186, width: 72, height: 7, rx: 2, fill: '#9a9a9a', stroke: LINE, 'stroke-width': 1.2 }),
    el('path', { d: 'M304 186L294 246M472 186L482 246', stroke: '#5f5f5f', 'stroke-width': 5, 'stroke-linecap': 'round' }),
  ].join('');
}
