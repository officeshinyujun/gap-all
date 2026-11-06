/**
 * 도식 SVG(기출 회색조 양식): 흐름도·순서도, 작업 네트워크, 특성 요인도, 계층도, 순환도,
 * 벤 다이어그램·포함 도식, 관계도, 2×2 매트릭스, 가공 형태. 화살촉은 polygon으로 그린다(<marker> 없음).
 */
import {
  networkSchedule,
  treeDepths,
  type CycleDiagramSpec,
  type DiagramSpec,
  type FishboneDiagramSpec,
  type FlowDiagramSpec,
  type MatrixDiagramSpec,
  type NestingDiagramSpec,
  type NetworkDiagramSpec,
  type RelationDiagramSpec,
  type TreeDiagramSpec,
  type VennDiagramSpec,
} from './figure-diagram';
import { fmtNum } from './figure-parse';
import { arrowHead, arrowLine, arrowPath, centeredLines, el, multilineText, svgRoot, textEl, textWidth, wrapText } from './svg-builder';

const INK = '#000';
const FONT = 15;
const SMALL = 13;
const WIDTH = 480;
const BOX_FILL = '#fff';
const SHADE = '#e9e9e9';

/** prefix는 그림 안 id 접두(현재 도식은 패턴·클립 id를 쓰지 않는다). */
export function renderDiagramSvg(spec: DiagramSpec, _prefix: string): string {
  switch (spec.diagramType) {
    case 'flow':
      return renderFlow(spec);
    case 'network':
      return renderNetwork(spec);
    case 'fishbone':
      return renderFishbone(spec);
    case 'tree':
      return renderTree(spec);
    case 'cycle':
      return renderCycle(spec);
    case 'venn':
      return renderVenn(spec);
    case 'relation':
      return renderRelation(spec);
    case 'matrix':
      return renderMatrix(spec);
    case 'nesting':
      return renderNesting(spec);
  }
}

function title(text: string | undefined, parts: string[], top = 6, width = WIDTH): number {
  if (text === undefined) return top;
  parts.push(textEl(width / 2, top + 16, text, { 'text-anchor': 'middle', 'font-size': 16, 'font-weight': 700 }));
  return top + 30;
}

function r(value: number): number {
  return Math.round(value * 100) / 100;
}

// ------------------------------------------------------------
// 흐름도·순서도
// ------------------------------------------------------------

type Box = { cx: number; cy: number; w: number; h: number };

function stepShape(shape: 'box' | 'decision' | 'terminal', box: Box): string {
  const { cx, cy, w, h } = box;
  if (shape === 'decision') {
    return el('polygon', { points: `${r(cx)},${r(cy - h / 2)} ${r(cx + w / 2)},${r(cy)} ${r(cx)},${r(cy + h / 2)} ${r(cx - w / 2)},${r(cy)}`, fill: BOX_FILL, stroke: INK, 'stroke-width': 1.3 });
  }
  return el('rect', { x: cx - w / 2, y: cy - h / 2, width: w, height: h, rx: shape === 'terminal' ? h / 2 : 2, fill: BOX_FILL, stroke: INK, 'stroke-width': 1.3 });
}

function renderFlow(spec: FlowDiagramSpec): string {
  let flowFont = SMALL + 1;
  const parts: string[] = [];
  const top = title(spec.title, parts);
  const index = new Map(spec.steps.map((step, position) => [step.id, position]));
  const boxes: Box[] = [];
  const lines: string[][] = [];
  if (spec.direction === 'horizontal') {
    const gap = 30;
    const margin = 10;
    const n = spec.steps.length;
    const boxWidth = (WIDTH - margin * 2 - gap * (n - 1)) / n;
    // 좁은 상자에서 낱말이 글자 단위로 끊기지 않게 글자 크기를 줄인다.
    const longestWord = Math.max(...spec.steps.flatMap((step) => step.label.split(/\s+/u).map((word) => textWidth(word, 1))));
    flowFont = Math.max(11.5, Math.min(SMALL + 1, (boxWidth - 12) / longestWord));
    for (const step of spec.steps) lines.push(wrapText(step.label, (step.shape === 'decision' ? boxWidth * 0.62 : boxWidth) - 10, flowFont, 4));
    const tallest = Math.max(...spec.steps.map((step, position) => (step.shape === 'decision' ? lines[position].length * 18 + 40 : lines[position].length * 18 + 18)), 46);
    const cy = top + 8 + tallest / 2;
    spec.steps.forEach((step, position) => {
      const h = step.shape === 'decision' ? tallest : Math.max(46, lines[position].length * 18 + 18);
      boxes.push({ cx: margin + boxWidth / 2 + position * (boxWidth + gap), cy, w: boxWidth, h });
    });
    spec.steps.forEach((step, position) => {
      parts.push(stepShape(step.shape, boxes[position]));
      parts.push(centeredLines(boxes[position].cx, cy, lines[position], flowFont, 18));
      if (position < spec.steps.length - 1) {
        const from = boxes[position];
        const to = boxes[position + 1];
        parts.push(arrowLine(from.cx + from.w / 2 + 3, cy, to.cx - to.w / 2 - 3, cy));
        if (step.shape === 'decision' && step.yesLabel !== undefined) parts.push(textEl((from.cx + from.w / 2 + to.cx - to.w / 2) / 2, cy - 7, step.yesLabel, { 'text-anchor': 'middle', 'font-size': SMALL - 1 }));
      }
    });
    // 되돌림: 상자 아래로 돌아간다(겹치지 않게 칸을 나눔)
    let bottom = cy + tallest / 2;
    spec.loops.forEach((loop, lane) => {
      const from = boxes[index.get(loop.from) ?? 0];
      const to = boxes[index.get(loop.to) ?? 0];
      const y = cy + tallest / 2 + 18 + lane * 18;
      const fromX = from.cx + (lane - (spec.loops.length - 1) / 2) * 8;
      const toX = to.cx + (to.cx < from.cx ? 10 : -10);
      parts.push(arrowPath([[fromX, from.cy + from.h / 2], [fromX, y], [toX, y], [toX, to.cy + to.h / 2 + 2]]));
      if (loop.label !== undefined) parts.push(textEl(fromX + (toX < fromX ? -6 : 6), y - 5, loop.label, { 'text-anchor': toX < fromX ? 'end' : 'start', 'font-size': SMALL - 1 }));
      bottom = y + 6;
    });
    return svgRoot(WIDTH, bottom + 10, parts, { 'font-size': FONT });
  }
  // 세로
  const boxWidth = 210;
  const cx = WIDTH / 2 - 20;
  let y = top + 6;
  for (const step of spec.steps) {
    const stepLines = wrapText(step.label, (step.shape === 'decision' ? boxWidth * 0.66 : boxWidth) - 14, SMALL + 1, 3);
    lines.push(stepLines);
    const h = step.shape === 'decision' ? stepLines.length * 18 + 34 : stepLines.length * 18 + 14;
    boxes.push({ cx, cy: y + h / 2, w: step.shape === 'decision' ? boxWidth * 0.9 : boxWidth, h });
    y += h + 28;
  }
  spec.steps.forEach((step, position) => {
    parts.push(stepShape(step.shape, boxes[position]));
    parts.push(centeredLines(cx, boxes[position].cy, lines[position], SMALL + 1, 18));
    if (position < spec.steps.length - 1) {
      const from = boxes[position];
      const to = boxes[position + 1];
      parts.push(arrowLine(cx, from.cy + from.h / 2 + 1, cx, to.cy - to.h / 2 - 2));
      if (step.shape === 'decision' && step.yesLabel !== undefined) parts.push(textEl(cx + 8, from.cy + from.h / 2 + 17, step.yesLabel, { 'font-size': SMALL - 1 }));
    }
  });
  // 되돌림: 첫 갈래는 왼쪽, 다음은 오른쪽(기출 순서도처럼)
  spec.loops.forEach((loop, lane) => {
    const from = boxes[index.get(loop.from) ?? 0];
    const to = boxes[index.get(loop.to) ?? 0];
    const side = lane % 2 === 0 ? -1 : 1;
    const laneX = cx + side * (boxWidth / 2 + 22 + Math.floor(lane / 2) * 18);
    const startX = cx + side * (from.w / 2);
    const endX = cx + side * (to.w / 2) + side * 2;
    parts.push(arrowPath([[startX, from.cy], [laneX, from.cy], [laneX, to.cy], [endX, to.cy]]));
    if (loop.label !== undefined) parts.push(textEl((startX + laneX) / 2, from.cy - 6, loop.label, { 'text-anchor': 'middle', 'font-size': SMALL - 1 }));
  });
  return svgRoot(WIDTH, y - 14, parts, { 'font-size': FONT });
}

// ------------------------------------------------------------
// 작업 네트워크(퍼트): 원 위 작업명(회색 바탕)·아래 작업 시간, 선후 관계 화살표
// ------------------------------------------------------------

function renderNetwork(spec: NetworkDiagramSpec): string {
  const parts: string[] = [];
  const top = title(spec.title, parts);
  const schedule = networkSchedule(spec);
  const level = new Map((schedule?.tasks ?? []).map((task) => [task.id, task.level]));
  const levels = Math.max(0, ...level.values()) + 1;
  const columns: string[][] = Array.from({ length: levels }, () => []);
  for (const task of spec.tasks) columns[level.get(task.id) ?? 0].push(task.id);
  // 같은 열 안 순서: 선행 작업 위치의 평균(교차를 줄임)
  const row = new Map<string, number>();
  columns.forEach((column, columnIndex) => {
    if (columnIndex > 0) {
      const preds = (id: string) => spec.links.filter((link) => link.to === id).map((link) => row.get(link.from) ?? 0);
      column.sort((a, b) => average(preds(a)) - average(preds(b)));
    }
    column.forEach((id, position) => row.set(id, position - (column.length - 1) / 2));
  });
  const maxRows = Math.max(...columns.map((column) => column.length));
  // 열 간격에 맞춘 원 크기(작업명이 길면 두 줄로 줄인다)
  const radius = Math.max(27, Math.min(38, levels <= 1 ? 38 : (WIDTH - 60) / (levels - 1) / 2 - 14));
  const rowGap = 84;
  const hasSkip = spec.links.some((link) => (level.get(link.to) ?? 0) - (level.get(link.from) ?? 0) > 1);
  const centerY = top + 12 + (hasSkip ? 22 : 0) + radius + ((maxRows - 1) * rowGap) / 2;
  const colGap = levels === 1 ? 0 : (WIDTH - 2 * (radius + 16)) / (levels - 1);
  const position = new Map(spec.tasks.map((task) => [task.id, [radius + 16 + colGap * (level.get(task.id) ?? 0), centerY + (row.get(task.id) ?? 0) * rowGap] as const]));
  for (const link of spec.links) {
    const [x1, y1] = position.get(link.from)!;
    const [x2, y2] = position.get(link.to)!;
    const skip = (level.get(link.to) ?? 0) - (level.get(link.from) ?? 0) > 1;
    const blocked = skip && spec.tasks.some((task) => {
      if (task.id === link.from || task.id === link.to) return false;
      const [px, py] = position.get(task.id)!;
      const t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / ((x2 - x1) ** 2 + (y2 - y1) ** 2);
      return t > 0 && t < 1 && Math.hypot(px - (x1 + t * (x2 - x1)), py - (y1 + t * (y2 - y1))) < radius + 8;
    });
    if (!blocked) {
      const length = Math.hypot(x2 - x1, y2 - y1) || 1;
      const [ux, uy] = [(x2 - x1) / length, (y2 - y1) / length];
      parts.push(arrowLine(x1 + ux * radius, y1 + uy * radius, x2 - ux * (radius + 1), y2 - uy * (radius + 1), { width: 1.3 }));
      continue;
    }
    // 중간 작업을 지나가는 화살표는 위(또는 아래)로 휘어 돌아간다.
    // 2차 베지어의 꼭대기는 조절점까지 거리의 절반이므로, 조절점을 2배 멀리 두어 가린 작업 원 위로 지나가게 한다.
    const bend = y1 <= centerY ? -1 : 1;
    const cx = (x1 + x2) / 2;
    const cy = Math.min(y1, y2) * (bend < 0 ? 1 : 0) + Math.max(y1, y2) * (bend > 0 ? 1 : 0) + bend * 2 * (radius + 12);
    const start = towards(x1, y1, cx, cy, radius);
    const end = towards(x2, y2, cx, cy, radius + 1);
    const angle = (Math.atan2(end[1] - cy, end[0] - cx) * 180) / Math.PI;
    const tip = towards(end[0], end[1], cx, cy, -0.0001);
    const back = towards(tip[0], tip[1], cx, cy, 6.4);
    parts.push(el('path', { d: `M${r(start[0])} ${r(start[1])}Q${r(cx)} ${r(cy)} ${r(back[0])} ${r(back[1])}`, fill: 'none', stroke: INK, 'stroke-width': 1.3 }));
    parts.push(arrowHead(end[0], end[1], angle));
  }
  for (const task of spec.tasks) {
    const [x, y] = position.get(task.id)!;
    parts.push(el('path', { d: `M${r(x - radius)} ${r(y)}A${radius} ${radius} 0 0 1 ${r(x + radius)} ${r(y)}Z`, fill: SHADE }));
    parts.push(el('circle', { cx: x, cy: y, r: radius, fill: 'none', stroke: INK, 'stroke-width': 1.3 }));
    parts.push(el('line', { x1: x - radius, y1: y, x2: x + radius, y2: y, stroke: INK, 'stroke-width': 1 }));
    // 작업명이 원 위쪽 반에 한 줄로 들어가지 않으면 두 줄(글자 크기는 거의 그대로)
    const nameLines = textWidth(task.name, SMALL) <= radius * 1.7 ? [task.name] : wrapText(task.name, radius * 1.7, 12.5, 2);
    parts.push(nameLines.length === 1
      ? textEl(x, y - 9, task.name, { 'text-anchor': 'middle', 'font-size': SMALL })
      : multilineText(x, y - radius * 0.56, nameLines, 13.5, { 'text-anchor': 'middle', 'font-size': 12.5 }));
    parts.push(textEl(x, y + radius * 0.62 + 4, fmtNum(task.duration), { 'text-anchor': 'middle', 'font-size': FONT }));
  }
  const bottom = centerY + ((maxRows - 1) * rowGap) / 2 + radius + 14 + (hasSkip && maxRows === 1 ? 30 : 0);
  // 범례
  const lx = 12;
  const ly = bottom + 10;
  parts.push(el('path', { d: `M${lx} ${ly + 9}A9 9 0 0 1 ${lx + 18} ${ly + 9}Z`, fill: SHADE }));
  parts.push(el('circle', { cx: lx + 9, cy: ly + 9, r: 9, fill: 'none', stroke: INK, 'stroke-width': 1 }));
  parts.push(el('line', { x1: lx, y1: ly + 9, x2: lx + 18, y2: ly + 9, stroke: INK, 'stroke-width': 0.8 }));
  parts.push(textEl(lx + 24, ly + 14, `위: 작업명, 아래: 작업 시간(${spec.unit})`, { 'font-size': SMALL - 1 }));
  const ax = lx + 36 + textWidth(`위: 작업명, 아래: 작업 시간(${spec.unit})`, SMALL - 1);
  parts.push(arrowLine(ax, ly + 9, ax + 28, ly + 9, { size: 7 }));
  parts.push(textEl(ax + 34, ly + 14, '작업의 선후 관계', { 'font-size': SMALL - 1 }));
  return svgRoot(WIDTH, ly + 24, parts, { 'font-size': FONT });
}

/** (x, y)에서 (tx, ty) 쪽으로 distance만큼 간 점 */
function towards(x: number, y: number, tx: number, ty: number, distance: number): [number, number] {
  const length = Math.hypot(tx - x, ty - y) || 1;
  return [x + ((tx - x) / length) * distance, y + ((ty - y) / length) * distance];
}

function average(values: readonly number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

// ------------------------------------------------------------
// 특성 요인도: 등뼈, 오른쪽 머리(결과), 위·아래 큰 가지(상자)와 세부 원인
// ------------------------------------------------------------

function renderFishbone(spec: FishboneDiagramSpec): string {
  const parts: string[] = [];
  const top = title(spec.title, parts);
  const effectLines = wrapText(spec.effect, 62, FONT, 3);
  const headWidth = 84;
  const spineY = top + 118;
  const spineLeft = 34;
  const spineRight = WIDTH - headWidth - 6;
  // 머리(결과)
  const hx = spineRight;
  const headHeight = Math.max(56, effectLines.length * 19 + 18);
  parts.push(el('path', { d: `M${hx} ${spineY - headHeight / 2}H${hx + headWidth - 22}Q${hx + headWidth} ${spineY} ${hx + headWidth - 22} ${spineY + headHeight / 2}H${hx}Z`, fill: SHADE, stroke: INK, 'stroke-width': 1.3 }));
  parts.push(centeredLines(hx + headWidth / 2 - 8, spineY, effectLines, FONT, 19));
  // 꼬리
  parts.push(el('path', { d: `M${spineLeft} ${spineY}L${spineLeft - 22} ${spineY - 18}Q${spineLeft - 12} ${spineY} ${spineLeft - 22} ${spineY + 18}Z`, fill: '#fff', stroke: INK, 'stroke-width': 1.3, 'stroke-linejoin': 'round' }));
  parts.push(el('line', { x1: spineLeft, y1: spineY, x2: spineRight, y2: spineY, stroke: INK, 'stroke-width': 2.2 }));
  const upper = spec.categories.filter((_, index) => index % 2 === 0);
  const lower = spec.categories.filter((_, index) => index % 2 === 1);
  const slots = Math.max(upper.length, lower.length);
  const slotWidth = (spineRight - spineLeft - 20) / slots;
  const drawSide = (categories: typeof spec.categories, sign: -1 | 1) => {
    categories.forEach((category, index) => {
      const baseX = spineLeft + 20 + slotWidth * (index + 1) - 14;
      const tipX = baseX - 46;
      const tipY = spineY + sign * 86;
      parts.push(el('line', { x1: baseX, y1: spineY, x2: tipX, y2: tipY, stroke: INK, 'stroke-width': 1.5 }));
      const boxWidth = Math.max(54, textWidth(category.name, FONT) + 18);
      const boxY = sign < 0 ? tipY - 28 : tipY;
      parts.push(el('rect', { x: tipX - boxWidth / 2, y: boxY, width: boxWidth, height: 28, fill: '#fff', stroke: INK, 'stroke-width': 1.2 }));
      parts.push(textEl(tipX, boxY + 19, category.name, { 'text-anchor': 'middle', 'font-size': FONT }));
      category.causes.forEach((cause, causeIndex) => {
        const t = (causeIndex + 1) / (category.causes.length + 1);
        const px = baseX + (tipX - baseX) * t;
        const py = spineY + (tipY - spineY) * t;
        const textW = Math.min(slotWidth - 10, textWidth(cause, SMALL) + 6);
        const linesOf = wrapText(cause, slotWidth - 14, SMALL, 2);
        parts.push(el('line', { x1: px, y1: py, x2: px + textW, y2: py, stroke: INK, 'stroke-width': 1 }));
        // 위 가지는 선 위에, 아래 가지는 선 아래에 적어 사선 가지와 겹치지 않게 한다.
        const textY = sign < 0 ? py - 4 - (linesOf.length - 1) * 15 : py + 15;
        parts.push(multilineText(px + 4, textY, linesOf, 15, { 'font-size': SMALL }));
      });
    });
  };
  drawSide(upper, -1);
  drawSide(lower, 1);
  return svgRoot(WIDTH, spineY + 126, parts, { 'font-size': FONT });
}

// ------------------------------------------------------------
// 계층도(조직도·분류 트리): 회색 상자, 직각 연결선
// ------------------------------------------------------------

function renderTree(spec: TreeDiagramSpec): string {
  const parts: string[] = [];
  const top = title(spec.title, parts);
  const depths = treeDepths(spec) ?? new Map<string, number>();
  const children = (id: string) => spec.nodes.filter((node) => node.parent === id);
  const root = spec.nodes.find((node) => node.parent === undefined)!;
  const leaves: string[] = [];
  const collect = (id: string) => {
    const kids = children(id);
    if (kids.length === 0) leaves.push(id);
    for (const kid of kids) collect(kid.id);
  };
  collect(root.id);
  const depth = Math.max(...depths.values());
  const slot = new Map<string, number>();
  const place = (id: string): number => {
    const kids = children(id);
    const value = kids.length === 0 ? leaves.indexOf(id) : average(kids.map((kid) => place(kid.id)));
    slot.set(id, value);
    return value;
  };
  place(root.id);
  if (spec.direction === 'down') {
    const slotWidth = (WIDTH - 16) / leaves.length;
    const levelGap = 66;
    const boxHeight = 30;
    const x = (id: string) => 8 + slotWidth * ((slot.get(id) ?? 0) + 0.5);
    const y = (id: string) => top + 8 + (depths.get(id) ?? 0) * levelGap;
    // 상자 폭: 그 노드 아래 잎 노드가 차지하는 폭까지 쓸 수 있다(부모 상자가 글자 단위로 끊기지 않게).
    const leafCount = (id: string): number => {
      const kids = children(id);
      return kids.length === 0 ? 1 : kids.reduce((sum, kid) => sum + leafCount(kid.id), 0);
    };
    const widthOf = (node: (typeof spec.nodes)[number]) => Math.min(slotWidth * leafCount(node.id) - 8, Math.max(52, textWidth(node.label, SMALL + 1) + 16));
    for (const node of spec.nodes) {
      const kids = children(node.id);
      if (kids.length === 0) continue;
      const midY = y(node.id) + boxHeight + (levelGap - boxHeight) / 2;
      parts.push(el('line', { x1: x(node.id), y1: y(node.id) + boxHeight, x2: x(node.id), y2: midY, stroke: INK, 'stroke-width': 1.1 }));
      parts.push(el('line', { x1: Math.min(...kids.map((kid) => x(kid.id))), y1: midY, x2: Math.max(...kids.map((kid) => x(kid.id))), y2: midY, stroke: INK, 'stroke-width': 1.1 }));
      for (const kid of kids) parts.push(el('line', { x1: x(kid.id), y1: midY, x2: x(kid.id), y2: y(kid.id), stroke: INK, 'stroke-width': 1.1 }));
    }
    for (const node of spec.nodes) {
      const w = widthOf(node);
      const linesOf = wrapText(node.label, w - 8, SMALL + 1, 2);
      const h = linesOf.length > 1 ? 40 : boxHeight;
      parts.push(el('rect', { x: x(node.id) - w / 2, y: y(node.id), width: w, height: h, rx: 2, fill: node.parent === undefined ? '#d6d6d6' : SHADE, stroke: INK, 'stroke-width': 1.1 }));
      parts.push(centeredLines(x(node.id), y(node.id) + h / 2, linesOf, SMALL + 1, 16));
    }
    return svgRoot(WIDTH, top + 8 + depth * levelGap + 48, parts, { 'font-size': FONT });
  }
  // 오른쪽으로 갈라지는 트리
  const rowHeight = 38;
  const levelWidth = (WIDTH - 16) / (depth + 1);
  const x = (id: string) => 8 + (depths.get(id) ?? 0) * levelWidth;
  const y = (id: string) => top + 6 + rowHeight * ((slot.get(id) ?? 0) + 0.5);
  const boxWidth = Math.min(levelWidth - 22, 130);
  for (const node of spec.nodes) {
    const kids = children(node.id);
    if (kids.length === 0) continue;
    const midX = x(node.id) + boxWidth + (levelWidth - boxWidth) / 2;
    parts.push(el('line', { x1: x(node.id) + boxWidth, y1: y(node.id), x2: midX, y2: y(node.id), stroke: INK, 'stroke-width': 1.1 }));
    parts.push(el('line', { x1: midX, y1: Math.min(...kids.map((kid) => y(kid.id))), x2: midX, y2: Math.max(...kids.map((kid) => y(kid.id))), stroke: INK, 'stroke-width': 1.1 }));
    for (const kid of kids) parts.push(el('line', { x1: midX, y1: y(kid.id), x2: x(kid.id), y2: y(kid.id), stroke: INK, 'stroke-width': 1.1 }));
  }
  for (const node of spec.nodes) {
    parts.push(el('rect', { x: x(node.id), y: y(node.id) - 14, width: boxWidth, height: 28, rx: 2, fill: node.parent === undefined ? '#d6d6d6' : SHADE, stroke: INK, 'stroke-width': 1.1 }));
    parts.push(textEl(x(node.id) + boxWidth / 2, y(node.id) + 5, wrapText(node.label, boxWidth - 6, SMALL + 1, 1)[0] ?? '', { 'text-anchor': 'middle', 'font-size': SMALL + 1 }));
  }
  return svgRoot(WIDTH, top + 12 + rowHeight * leaves.length, parts, { 'font-size': FONT });
}

// ------------------------------------------------------------
// 순환도: 원 둘레 단계 상자와 시계 방향 곡선 화살표, 가운데 글
// ------------------------------------------------------------

function renderCycle(spec: CycleDiagramSpec): string {
  const parts: string[] = [];
  const top = title(spec.title, parts);
  const n = spec.steps.length;
  const radius = n > 5 ? 108 : 96;
  const cx = WIDTH / 2;
  const cy = top + radius + 34;
  const angle = (index: number) => -Math.PI / 2 + (index * Math.PI * 2) / n;
  if (spec.center !== undefined) {
    parts.push(el('circle', { cx, cy, r: 44, fill: SHADE, stroke: INK, 'stroke-width': 1.2 }));
    parts.push(centeredLines(cx, cy, wrapText(spec.center, 76, SMALL + 1, 3), SMALL + 1, 17));
  }
  const boxWidth = n > 5 ? 96 : 108;
  const boxHeight = 40;
  // 단계 사이 호 화살표
  const halfGap = Math.min(0.42, (Math.PI * 2) / n / 2 - 0.08) * (n > 5 ? 0.9 : 1);
  for (let index = 0; index < n; index += 1) {
    const a0 = angle(index) + halfGap;
    const a1 = angle(index + 1) - halfGap;
    const [x0, y0] = [cx + radius * Math.cos(a0), cy + radius * Math.sin(a0)];
    const [x1, y1] = [cx + radius * Math.cos(a1), cy + radius * Math.sin(a1)];
    parts.push(el('path', { d: `M${r(x0)} ${r(y0)}A${radius} ${radius} 0 0 1 ${r(x1)} ${r(y1)}`, fill: 'none', stroke: INK, 'stroke-width': 1.4 }));
    parts.push(arrowHead(x1, y1, ((a1 + Math.PI / 2) * 180) / Math.PI, 9));
  }
  spec.steps.forEach((step, index) => {
    const [x, y] = [cx + radius * Math.cos(angle(index)), cy + radius * Math.sin(angle(index))];
    const linesOf = wrapText(step, boxWidth - 10, SMALL + 1, 2);
    const h = linesOf.length > 1 ? 46 : boxHeight;
    parts.push(el('rect', { x: x - boxWidth / 2, y: y - h / 2, width: boxWidth, height: h, rx: h / 2, fill: '#fff', stroke: INK, 'stroke-width': 1.3 }));
    parts.push(centeredLines(x, y, linesOf, SMALL + 1, 17));
  });
  return svgRoot(WIDTH, cy + radius + 34, parts, { 'font-size': FONT });
}

// ------------------------------------------------------------
// 벤 다이어그램(겹침)·포함 도식
// ------------------------------------------------------------

function renderVenn(spec: VennDiagramSpec): string {
  const parts: string[] = [];
  const top = title(spec.title, parts);
  if (spec.mode === 'nested') {
    const n = spec.labels.length;
    const cx = WIDTH / 2;
    const outerRx = 220;
    const outerRy = 118;
    const cy = top + outerRy + 6;
    const shades = ['#c9c9c9', '#ffffff', '#9f9f9f', '#e6e6e6'];
    spec.labels.forEach((label, index) => {
      const scale = 1 - index * (0.72 / n);
      const rx = outerRx * scale;
      const ry = outerRy * scale;
      const ey = cy + (outerRy - ry) * 0.55;
      parts.push(el('ellipse', { cx, cy: ey, rx, ry, fill: shades[index % shades.length], stroke: INK, 'stroke-width': 1.2 }));
      const labelY = index === n - 1 ? ey + 5 : ey - ry + 24;
      parts.push(textEl(cx, labelY, label, { 'text-anchor': 'middle', 'font-size': FONT, fill: shades[index % shades.length] === '#9f9f9f' ? '#000' : undefined }));
    });
    return svgRoot(WIDTH, cy + outerRy + 10, parts, { 'font-size': FONT });
  }
  const rx = 150;
  const ry = 112;
  const cy = top + ry + 24;
  const leftX = WIDTH / 2 - 84;
  const rightX = WIDTH / 2 + 84;
  parts.push(el('ellipse', { cx: leftX, cy, rx, ry, fill: 'none', stroke: INK, 'stroke-width': 1.3 }));
  parts.push(el('ellipse', { cx: rightX, cy, rx, ry, fill: 'none', stroke: INK, 'stroke-width': 1.3 }));
  for (const [x, label] of [[leftX - 30, spec.labels[0] ?? ''], [rightX + 30, spec.labels[1] ?? '']] as const) {
    const w = Math.max(54, textWidth(label, FONT) + 18);
    parts.push(el('rect', { x: x - w / 2, y: cy - ry - 13, width: w, height: 26, fill: '#fff', stroke: INK, 'stroke-width': 1.1 }));
    parts.push(textEl(x, cy - ry + 5, label, { 'text-anchor': 'middle', 'font-size': FONT }));
  }
  const bullets = (items: readonly string[], x: number, width: number, center: boolean) => {
    const linesOf = items.flatMap((item) => wrapText(item, width, SMALL, 3).map((line, index) => (center ? line : index === 0 ? `• ${line}` : `  ${line}`)));
    if (linesOf.length > 0) {
      parts.push(multilineText(x, cy - ((linesOf.length - 1) * 17) / 2 + 5, linesOf, 17, { 'font-size': SMALL, 'text-anchor': center ? 'middle' : 'start' }));
    }
  };
  bullets(spec.onlyFirst, leftX - rx + 22, 112, false);
  bullets(spec.onlySecond, rightX - 50, 112, false);
  bullets(spec.both, WIDTH / 2, 70, true);
  return svgRoot(WIDTH, cy + ry + 8, parts, { 'font-size': FONT });
}

// ------------------------------------------------------------
// 관계도: 원형 배치(삼각·사각…) 또는 가운데 중심(hub), 글이 달린 화살표
// ------------------------------------------------------------

function renderRelation(spec: RelationDiagramSpec): string {
  const parts: string[] = [];
  const top = title(spec.title, parts);
  const n = spec.nodes.length;
  const hub = spec.layout === 'hub';
  const shortLabels = spec.nodes.every((node) => node.label.length <= 5);
  const nodeSize = (label: string, center: boolean) => {
    if (shortLabels && !hub) return { w: 64, h: 64, circle: true, lines: [label] };
    const width = center ? 130 : hub ? 150 : 110;
    const linesOf = wrapText(label, width - 14, SMALL, 4);
    return { w: width, h: linesOf.length * 17 + 16, circle: false, lines: linesOf };
  };
  const cx = WIDTH / 2;
  const radiusX = hub ? 160 : n === 2 ? 150 : 158;
  const radiusY = hub ? 104 : n === 2 ? 0 : 112;
  const cy = top + (n === 2 ? 60 : radiusY + 58);
  const positions = spec.nodes.map((_, index) => {
    if (hub && index === 0) return [cx, cy] as const;
    const count = hub ? n - 1 : n;
    const k = hub ? index - 1 : index;
    const start = n === 2 && !hub ? Math.PI : -Math.PI / 2;
    const a = start + (k * Math.PI * 2) / count;
    return [cx + radiusX * Math.cos(a), cy + radiusY * Math.sin(a) + (n === 3 && !hub ? 14 : 0)] as const;
  });
  const sizes = spec.nodes.map((node, index) => nodeSize(node.label, hub && index === 0));
  const boundary = (index: number, toward: readonly [number, number]) => {
    const [x, y] = positions[index];
    const size = sizes[index];
    const dx = toward[0] - x;
    const dy = toward[1] - y;
    const length = Math.hypot(dx, dy) || 1;
    if (size.circle) return [x + (dx / length) * (size.w / 2 + 3), y + (dy / length) * (size.w / 2 + 3)] as const;
    const scale = Math.min(Math.abs((size.w / 2 + 4) / (dx || 1e-9)), Math.abs((size.h / 2 + 4) / (dy || 1e-9)));
    return [x + dx * scale, y + dy * scale] as const;
  };
  const indexOf = new Map(spec.nodes.map((node, index) => [node.id, index]));
  for (const link of spec.links) {
    const a = indexOf.get(link.from) ?? 0;
    const b = indexOf.get(link.to) ?? 0;
    const reverse = spec.links.some((other) => other.from === link.to && other.to === link.from);
    const [x0, y0] = positions[a];
    const [x1, y1] = positions[b];
    const length = Math.hypot(x1 - x0, y1 - y0) || 1;
    // 오른쪽 법선(진행 방향 기준). 맞방향 연결은 서로 다른 쪽으로 벌린다.
    const [nx, ny] = [-(y1 - y0) / length, (x1 - x0) / length];
    const offset = reverse ? 7 : 0;
    const start = boundary(a, [x1 + nx * offset, y1 + ny * offset]);
    const end = boundary(b, [x0 + nx * offset, y0 + ny * offset]);
    const sx = start[0] + nx * offset;
    const sy = start[1] + ny * offset;
    const ex = end[0] + nx * offset;
    const ey = end[1] + ny * offset;
    parts.push(link.arrow === 'none'
      ? el('line', { x1: sx, y1: sy, x2: ex, y2: ey, stroke: INK, 'stroke-width': 1.3 })
      : arrowLine(sx, sy, ex, ey, { both: link.arrow === 'both' }));
    if (link.label !== undefined) {
      // 글은 화살표 바깥쪽(맞방향이면 각자 자기 쪽)으로
      const side = reverse ? 1 : (nx * (cx - (sx + ex) / 2) + ny * (cy - (sy + ey) / 2) > 0 ? -1 : 1);
      const linesOf = wrapText(link.label, 76, SMALL, 2);
      // 글 덩어리 크기만큼 화살표에서 떨어뜨린다(세로 화살표 옆이면 폭, 가로 화살표 위아래면 높이 기준).
      const halfW = Math.max(...linesOf.map((line) => textWidth(line, SMALL))) / 2;
      const halfH = (linesOf.length * 15) / 2;
      const distance = 6 + Math.abs(nx) * halfW + Math.abs(ny) * halfH;
      const mx = (sx + ex) / 2 + nx * distance * side;
      const my = (sy + ey) / 2 + ny * distance * side;
      parts.push(centeredLines(mx, my, linesOf, SMALL, 15));
    }
  }
  spec.nodes.forEach((_, index) => {
    const [x, y] = positions[index];
    const size = sizes[index];
    parts.push(size.circle
      ? el('circle', { cx: x, cy: y, r: size.w / 2, fill: '#fff', stroke: INK, 'stroke-width': 1.3 })
      : el('rect', { x: x - size.w / 2, y: y - size.h / 2, width: size.w, height: size.h, rx: 8, fill: hub && index === 0 ? SHADE : '#fff', stroke: INK, 'stroke-width': 1.3 }));
    parts.push(centeredLines(x, y, size.lines, size.circle ? FONT : SMALL, 17));
  });
  const bottom = Math.max(...positions.map(([, y], index) => y + sizes[index].h / 2)) + 14;
  return svgRoot(WIDTH, bottom, parts, { 'font-size': FONT });
}

// ------------------------------------------------------------
// 2×2 매트릭스(포지셔닝 맵)
// ------------------------------------------------------------

function renderMatrix(spec: MatrixDiagramSpec): string {
  const parts: string[] = [];
  const top = title(spec.title, parts);
  const size = 250;
  const left = (WIDTH - size) / 2 + 20;
  const plotTop = top + 30;
  const x = (value: number) => left + (value / 10) * size;
  const y = (value: number) => plotTop + size - (value / 10) * size;
  parts.push(el('rect', { x: left, y: plotTop, width: size, height: size, fill: '#fff', stroke: INK, 'stroke-width': 1.2 }));
  parts.push(el('line', { x1: x(5), y1: plotTop, x2: x(5), y2: plotTop + size, stroke: INK, 'stroke-width': 1, 'stroke-dasharray': '5 4' }));
  parts.push(el('line', { x1: left, y1: y(5), x2: left + size, y2: y(5), stroke: INK, 'stroke-width': 1, 'stroke-dasharray': '5 4' }));
  const quadrants = spec.quadrants ?? [];
  const centers = [[2.5, 7.5], [7.5, 7.5], [2.5, 2.5], [7.5, 2.5]] as const;
  quadrants.forEach((label, index) => {
    const [qx, qy] = centers[index];
    parts.push(centeredLines(x(qx), y(qy) + (spec.points.length > 0 ? -34 : 0), wrapText(label, size / 2 - 16, SMALL, 2), SMALL, 16, { fill: '#333' }));
  });
  for (const point of spec.points) {
    parts.push(el('circle', { cx: x(point.x), cy: y(point.y), r: 4.5, fill: INK }));
    parts.push(textEl(x(point.x) + 8, y(point.y) - 6, point.label, { 'font-size': SMALL }));
  }
  // 축(바깥 화살표)과 양 끝 글
  const axisY = plotTop + size + 12;
  parts.push(arrowLine(left, axisY, left + size, axisY));
  parts.push(textEl(left, axisY + 18, spec.xAxis.low, { 'font-size': SMALL }));
  parts.push(textEl(left + size, axisY + 18, spec.xAxis.high, { 'text-anchor': 'end', 'font-size': SMALL }));
  parts.push(textEl(left + size / 2, axisY + 36, spec.xAxis.label, { 'text-anchor': 'middle', 'font-size': FONT }));
  const axisX = left - 12;
  parts.push(arrowLine(axisX, plotTop + size, axisX, plotTop));
  parts.push(textEl(axisX - 6, plotTop + size, spec.yAxis.low, { 'text-anchor': 'end', 'font-size': SMALL }));
  parts.push(textEl(axisX - 6, plotTop + 12, spec.yAxis.high, { 'text-anchor': 'end', 'font-size': SMALL }));
  parts.push(multilineText(axisX - 24, plotTop + size / 2 - ((wrapText(spec.yAxis.label, 52, FONT, 4).length - 1) * 17) / 2, wrapText(spec.yAxis.label, 52, FONT, 4), 17, { 'text-anchor': 'end', 'font-size': FONT }));
  return svgRoot(WIDTH, axisY + 44, parts, { 'font-size': FONT });
}

// ------------------------------------------------------------
// 가공 형태: 직사각형 판 안 원판 배치(가지런히/엇갈리게)
// ------------------------------------------------------------

function renderNesting(spec: NestingDiagramSpec): string {
  const parts: string[] = [];
  const top = title(spec.title, parts);
  const count = spec.plans.length;
  const panelWidth = (WIDTH - 12) / count;
  const maxWidth = Math.max(...spec.plans.map((plan) => plan.sheetWidth));
  const maxHeight = Math.max(...spec.plans.map((plan) => plan.sheetHeight));
  const scale = Math.min((panelWidth - 30) / maxWidth, 170 / maxHeight);
  let bottom = top;
  spec.plans.forEach((plan, index) => {
    const w = plan.sheetWidth * scale;
    const h = plan.sheetHeight * scale;
    const ox = 6 + panelWidth * index + (panelWidth - w) / 2;
    const oy = top + 30;
    parts.push(textEl(ox + w / 2, top + 18, plan.label, { 'text-anchor': 'middle', 'font-size': FONT }));
    parts.push(el('rect', { x: ox, y: oy, width: w, height: h, fill: '#dcdcdc', stroke: INK, 'stroke-width': 1.3 }));
    const d = plan.diameter * scale;
    const pitch = plan.stagger ? (d * Math.sqrt(3)) / 2 : d;
    const used = d + pitch * (plan.rows.length - 1);
    const startY = oy + (h - used) / 2 + d / 2;
    plan.rows.forEach((rowCount, rowIndex) => {
      const offset = plan.stagger && rowIndex % 2 === 1 ? d / 2 : 0;
      const rowWidth = rowCount * d + (plan.stagger ? d / 2 : 0);
      const startX = ox + (w - rowWidth) / 2 + d / 2 + offset;
      for (let k = 0; k < rowCount; k += 1) {
        parts.push(el('circle', { cx: startX + k * d, cy: startY + rowIndex * pitch, r: d / 2 - 0.6, fill: '#fff', stroke: INK, 'stroke-width': 1.1 }));
      }
    });
    // 치수는 판 아래에 적는다(이용률 계산에 필요).
    const dims = `가로 ${fmtNum(plan.sheetWidth)}${spec.unit} × 세로 ${fmtNum(plan.sheetHeight)}${spec.unit}, 지름 ${fmtNum(plan.diameter)}${spec.unit}`;
    const dimLines = wrapText(dims, panelWidth - 10, SMALL - 1, 2);
    parts.push(multilineText(ox + w / 2, oy + h + 18, dimLines, 15, { 'text-anchor': 'middle', 'font-size': SMALL - 1 }));
    bottom = Math.max(bottom, oy + h + 18 + (dimLines.length - 1) * 15 + 8);
  });
  return svgRoot(WIDTH, bottom, parts, { 'font-size': FONT });
}
