/** 간트 차트·관리도·산점도·곡선 SVG(기출 회색조 양식). */
import {
  curveLines,
  scatterPoints,
  type ControlFigureSpec,
  type CurveFigureSpec,
  type ExtChartSpec,
  type GanttFigureSpec,
  type ScatterFigureSpec,
} from './figure-chart-ext';
import { fmtNum } from './figure-parse';
import { arrowHead, el, multilineText, svgRoot, textEl, textWidth, wrapText } from './svg-builder';

const INK = '#000';
const GRID = '#8c8c8c';
const FONT = 15;
const SMALL = 13;
const WIDTH = 480;

export function renderExtChartSvg(spec: ExtChartSpec, prefix: string): string {
  switch (spec.chartType) {
    case 'gantt':
      return renderGantt(spec, prefix);
    case 'control':
      return renderControl(spec);
    case 'scatter':
      return renderScatter(spec);
    case 'curve':
      return renderCurve(spec);
  }
}

function titleBlock(title: string | undefined, parts: string[], top: number): number {
  if (title === undefined) return top;
  parts.push(textEl(WIDTH / 2, top + 16, title, { 'text-anchor': 'middle', 'font-size': 16, 'font-weight': 700 }));
  return top + 28;
}

// ------------------------------------------------------------
// 간트 차트: 머리행(기간·날짜), 작업 행, ┌ ┐ 계획선, 빗금 완료 막대, 기준일 점선
// ------------------------------------------------------------

function renderGantt(spec: GanttFigureSpec, prefix: string): string {
  const parts: string[] = [];
  let top = titleBlock(spec.title, parts, 6);
  const nameWidth = Math.max(54, ...spec.tasks.map((task) => textWidth(task.name, FONT) + 16));
  const left = 8;
  const gridLeft = left + nameWidth;
  const right = WIDTH - 8;
  const days = spec.end - spec.start + 1;
  const cell = (right - gridLeft) / days;
  const headHeight = 52;
  const rowHeight = 40;
  const tableTop = top;
  const tableBottom = tableTop + headHeight + rowHeight * spec.tasks.length;
  const x = (day: number) => gridLeft + (day - spec.start) * cell;
  const hatch = `${prefix}-hatch`;
  parts.push(el('defs', {}, el('pattern', { id: hatch, patternUnits: 'userSpaceOnUse', width: 5, height: 5, patternTransform: 'rotate(45)' }, [
    el('rect', { width: 5, height: 5, fill: '#fff' }),
    el('line', { x1: 0, y1: 0, x2: 0, y2: 5, stroke: INK, 'stroke-width': 1.1 }),
  ])));
  // 표 틀
  parts.push(el('rect', { x: left, y: tableTop, width: right - left, height: tableBottom - tableTop, fill: 'none', stroke: INK, 'stroke-width': 1.2 }));
  parts.push(el('line', { x1: gridLeft, y1: tableTop, x2: gridLeft, y2: tableBottom, stroke: INK, 'stroke-width': 1 }));
  parts.push(el('line', { x1: gridLeft, y1: tableTop + headHeight / 2, x2: right, y2: tableTop + headHeight / 2, stroke: INK, 'stroke-width': 0.8 }));
  parts.push(el('line', { x1: left, y1: tableTop + headHeight, x2: right, y2: tableTop + headHeight, stroke: INK, 'stroke-width': 1 }));
  parts.push(el('line', { x1: left, y1: tableTop, x2: gridLeft, y2: tableTop + headHeight, stroke: INK, 'stroke-width': 0.8 }));
  parts.push(textEl(gridLeft - 6, tableTop + 18, spec.unit === '일' ? '일' : spec.unit, { 'text-anchor': 'end', 'font-size': SMALL }));
  parts.push(textEl(left + 6, tableTop + headHeight - 8, '작업', { 'font-size': SMALL }));
  parts.push(textEl((gridLeft + right) / 2, tableTop + 19, spec.periodLabel, { 'text-anchor': 'middle', 'font-size': FONT }));
  const step = days <= 12 ? 1 : days <= 20 ? 2 : 5;
  for (let day = spec.start; day <= spec.end; day += 1) {
    const dx = x(day);
    if (day > spec.start) parts.push(el('line', { x1: dx, y1: tableTop + headHeight / 2, x2: dx, y2: tableBottom, stroke: day % 5 === 1 || step === 1 ? '#b4b4b4' : '#d9d9d9', 'stroke-width': 0.6 }));
    if ((day - spec.start) % step === 0 || day === spec.end) {
      parts.push(textEl(dx + cell / 2, tableTop + headHeight - 8, String(day), { 'text-anchor': 'middle', 'font-size': days > 20 ? 10.5 : SMALL - 1 }));
    }
  }
  spec.tasks.forEach((task, index) => {
    const rowTop = tableTop + headHeight + rowHeight * index;
    if (index > 0) parts.push(el('line', { x1: left, y1: rowTop, x2: right, y2: rowTop, stroke: INK, 'stroke-width': 0.8 }));
    parts.push(textEl(left + nameWidth / 2, rowTop + rowHeight / 2 + 5, task.name, { 'text-anchor': 'middle', 'font-size': FONT }));
    // 계획: ┌──┐ 괄호선
    const x0 = x(task.plannedStart) + 1.5;
    const x1 = x(task.plannedEnd + 1) - 1.5;
    const y = rowTop + 11;
    parts.push(el('path', { d: `M${r(x0)} ${y + 8}V${y}H${r(x1)}V${y + 8}`, fill: 'none', stroke: INK, 'stroke-width': 1.6 }));
    if (task.doneUntil !== undefined) {
      const d0 = x(task.plannedStart) + 1.5;
      const d1 = x(task.doneUntil + 1) - 1.5;
      parts.push(el('rect', { x: d0, y: rowTop + 22, width: Math.max(2, d1 - d0), height: 11, fill: `url(#${hatch})`, stroke: INK, 'stroke-width': 1 }));
    }
  });
  if (spec.statusDay !== undefined) {
    const sx = x(spec.statusDay + 1);
    parts.push(el('line', { x1: sx, y1: tableTop + headHeight - 2, x2: sx, y2: tableBottom + 8, stroke: INK, 'stroke-width': 1.3, 'stroke-dasharray': '4 3' }));
    parts.push(textEl(sx, tableBottom + 21, `기준일(${spec.statusDay}${spec.unit})`, { 'text-anchor': 'middle', 'font-size': SMALL - 1 }));
  }
  // 범례
  const legendY = tableBottom + (spec.statusDay === undefined ? 22 : 40);
  let lx = left + 4;
  parts.push(el('path', { d: `M${lx} ${legendY + 3}V${legendY - 5}H${lx + 26}V${legendY + 3}`, fill: 'none', stroke: INK, 'stroke-width': 1.6 }));
  parts.push(textEl(lx + 32, legendY + 4, '계획 작업량(예정 시작일～예정 종료일)', { 'font-size': SMALL - 1 }));
  lx += 32 + textWidth('계획 작업량(예정 시작일～예정 종료일)', SMALL - 1) + 18;
  parts.push(el('rect', { x: lx, y: legendY - 6, width: 24, height: 10, fill: `url(#${hatch})`, stroke: INK, 'stroke-width': 1 }));
  parts.push(textEl(lx + 30, legendY + 4, '완료 작업량', { 'font-size': SMALL - 1 }));
  return svgRoot(WIDTH, legendY + 12, parts, { 'font-size': FONT });
}

// ------------------------------------------------------------
// 관리도: 중심선(실선)·관리 상·하한선(점선)과 오른쪽 이름, 점을 잇는 꺾은선
// ------------------------------------------------------------

function renderControl(spec: ControlFigureSpec): string {
  const parts: string[] = [];
  const top = titleBlock(spec.title, parts, 6);
  const left = 44;
  const labelRoom = textWidth('관리 상한선', SMALL) + 14;
  const right = WIDTH - labelRoom - 6;
  const plotTop = top + 10;
  const plotHeight = 180;
  const plotBottom = plotTop + plotHeight;
  const span = spec.upper - spec.lower;
  const yMin = Math.min(spec.lower - span * 0.35, ...spec.values);
  const yMax = Math.max(spec.upper + span * 0.35, ...spec.values);
  const y = (value: number) => plotBottom - ((value - yMin) / (yMax - yMin)) * plotHeight;
  const x = (index: number) => left + 14 + (index * (right - left - 28)) / Math.max(1, spec.values.length - 1);
  parts.push(el('rect', { x: left, y: plotTop - 6, width: right - left, height: plotHeight + 12, fill: 'none', stroke: INK, 'stroke-width': 1.1 }));
  const lines: [number, string, string | undefined][] = [[spec.upper, '관리 상한선', '5 4'], [spec.center, '중심선', undefined], [spec.lower, '관리 하한선', '5 4']];
  for (const [value, name, dash] of lines) {
    parts.push(el('line', { x1: left, y1: y(value), x2: right, y2: y(value), stroke: INK, 'stroke-width': dash === undefined ? 1.3 : 1.1, 'stroke-dasharray': dash }));
    parts.push(textEl(right + 6, y(value) + 5, name, { 'font-size': SMALL }));
  }
  const points = spec.values.map((value, index) => [x(index), y(value)] as const);
  parts.push(el('polyline', { points: points.map(([px, py]) => `${r(px)},${r(py)}`).join(' '), fill: 'none', stroke: INK, 'stroke-width': 1.2 }));
  for (const [px, py] of points) parts.push(el('circle', { cx: px, cy: py, r: 2.9, fill: INK }));
  // 가로축 눈금: 1, 5, 10, …
  const ticks = spec.values.map((_, index) => index + 1).filter((n) => n === 1 || n % 5 === 0);
  for (const n of ticks) {
    parts.push(el('line', { x1: x(n - 1), y1: plotBottom + 6, x2: x(n - 1), y2: plotBottom + 10, stroke: INK, 'stroke-width': 1 }));
    parts.push(textEl(x(n - 1), plotBottom + 25, String(n), { 'text-anchor': 'middle', 'font-size': SMALL }));
  }
  parts.push(textEl(right, plotBottom + 25, spec.xLabel, { 'text-anchor': 'start', 'font-size': SMALL, dx: 6 }));
  // 세로축 이름: 기출처럼 세로로 한 글자씩
  parts.push(multilineText(left - 18, plotTop + 8, [...spec.yLabel.replace(/\s+/gu, '')], 16, { 'text-anchor': 'middle', 'font-size': SMALL }));
  return svgRoot(WIDTH, plotBottom + 34, parts, { 'font-size': FONT });
}

// ------------------------------------------------------------
// 산점도: 패널 1~2개, 축 0~100, 엔진이 만든 점
// ------------------------------------------------------------

function renderScatter(spec: ScatterFigureSpec): string {
  const parts: string[] = [];
  const top = titleBlock(spec.title, parts, 6);
  const count = spec.panels.length;
  const panelWidth = (WIDTH - 12) / count;
  let bottom = top;
  spec.panels.forEach((panel, index) => {
    const ox = 6 + panelWidth * index;
    if (count > 1) parts.push(el('rect', { x: ox, y: top, width: panelWidth - (index === count - 1 ? 0 : 6), height: 214, fill: 'none', stroke: INK, 'stroke-width': 1 }));
    let py = top + 10;
    if (panel.title !== undefined) {
      parts.push(textEl(ox + panelWidth / 2, py + 12, panel.title, { 'text-anchor': 'middle', 'font-size': FONT }));
      py += 22;
    }
    const left = ox + 52;
    const right = ox + panelWidth - 22;
    const plotTop = py + 8;
    const plotBottom = top + 172;
    const size = Math.min(right - left, plotBottom - plotTop);
    const px = (value: number) => left + (value / 100) * size;
    const pyv = (value: number) => plotBottom - (value / 100) * size;
    parts.push(el('line', { x1: left, y1: plotBottom, x2: left + size + 10, y2: plotBottom, stroke: INK, 'stroke-width': 1.1 }));
    parts.push(arrowHead(left + size + 14, plotBottom, 0));
    parts.push(el('line', { x1: left, y1: plotBottom, x2: left, y2: plotBottom - size - 10, stroke: INK, 'stroke-width': 1.1 }));
    parts.push(arrowHead(left, plotBottom - size - 14, -90));
    parts.push(textEl(left - 8, plotBottom + 4, '0', { 'text-anchor': 'end', 'font-size': SMALL }));
    parts.push(textEl(left + size, plotBottom + 18, '100', { 'text-anchor': 'middle', 'font-size': SMALL }));
    parts.push(textEl(left - 6, pyv(100) + 5, '100', { 'text-anchor': 'end', 'font-size': SMALL }));
    parts.push(textEl(left + size / 2, plotBottom + 34, panel.xLabel, { 'text-anchor': 'middle', 'font-size': FONT }));
    // 세로축 이름은 기출처럼 한 글자씩 세로로
    const chars = [...panel.yLabel.replace(/\s+/gu, '')].slice(0, 9);
    parts.push(multilineText(ox + 22, pyv(100) + 22, chars, 16, { 'text-anchor': 'middle', 'font-size': FONT }));
    for (const [vx, vy] of scatterPoints(spec, index).points) parts.push(el('circle', { cx: px(vx), cy: pyv(vy), r: 1.9, fill: INK }));
    bottom = Math.max(bottom, plotBottom + 42);
  });
  return svgRoot(WIDTH, Math.max(bottom, top + 220), parts, { 'font-size': FONT });
}

// ------------------------------------------------------------
// 곡선: 매끄러운 곡선, 점선 구간 경계와 구간 이름, 눈금 없는 축(기출 수명 주기처럼)
// ------------------------------------------------------------

const CURVE_DASHES = [undefined, '7 4', '2 3'] as const;

function renderCurve(spec: CurveFigureSpec): string {
  const parts: string[] = [];
  const top = titleBlock(spec.title, parts, 6);
  const lines = curveLines(spec);
  const legendRoom = lines.length > 1 ? 0 : 0;
  const left = 54;
  const right = WIDTH - 86;
  const plotTop = top + 16 + legendRoom;
  const plotBottom = plotTop + 170;
  const x = (value: number) => left + (value / spec.xMax) * (right - left);
  const y = (value: number) => plotBottom - (value / spec.yMax) * (plotBottom - plotTop);
  const segments = spec.segments ?? [];
  segments.forEach((segment, index) => {
    const sx = left + ((right - left) * index) / segments.length;
    if (index > 0) parts.push(el('line', { x1: sx, y1: plotTop - 4, x2: sx, y2: plotBottom, stroke: GRID, 'stroke-width': 1, 'stroke-dasharray': '4 4' }));
    parts.push(textEl(sx + (right - left) / segments.length / 2, plotBottom + 20, segment, { 'text-anchor': 'middle', 'font-size': FONT }));
  });
  lines.forEach((line, index) => {
    parts.push(el('path', { d: smoothPath(line.points.map(([px, py]) => [x(px), y(py)] as const)), fill: 'none', stroke: INK, 'stroke-width': 1.8, 'stroke-dasharray': CURVE_DASHES[index % 3], 'stroke-linecap': 'round' }));
  });
  if (lines.length > 1) {
    // 곡선 끝 이름: 세로로 겹치지 않게 16px 이상 벌린다.
    const ends = lines.map((line) => ({ name: line.name, x: x(line.points[line.points.length - 1][0]), y: y(line.points[line.points.length - 1][1]) }))
      .sort((a, b) => a.y - b.y);
    for (let index = 1; index < ends.length; index += 1) ends[index].y = Math.max(ends[index].y, ends[index - 1].y + 17);
    for (const end of ends) parts.push(textEl(end.x + 6, end.y + 5, end.name, { 'font-size': SMALL }));
  }
  parts.push(el('line', { x1: left, y1: plotBottom, x2: right + 14, y2: plotBottom, stroke: INK, 'stroke-width': 1.2 }));
  parts.push(arrowHead(right + 18, plotBottom, 0));
  parts.push(el('line', { x1: left, y1: plotBottom, x2: left, y2: plotTop - 10, stroke: INK, 'stroke-width': 1.2 }));
  parts.push(arrowHead(left, plotTop - 14, -90));
  parts.push(textEl(left - 8, plotBottom + 5, '0', { 'text-anchor': 'end', 'font-size': SMALL }));
  parts.push(textEl(right + 18, plotBottom + (segments.length > 0 ? 40 : 22), spec.xLabel, { 'text-anchor': 'end', 'font-size': FONT }));
  parts.push(multilineText(left - 26, plotTop + 14, [...spec.yLabel.replace(/\s+/gu, '')].slice(0, 8), 17, { 'text-anchor': 'middle', 'font-size': FONT }));
  return svgRoot(WIDTH, plotBottom + (segments.length > 0 ? 48 : 30), parts, { 'font-size': FONT });
}

/** 점을 지나는 매끄러운 곡선(Catmull-Rom → 3차 베지어) */
export function smoothPath(points: readonly (readonly [number, number])[]): string {
  if (points.length === 0) return '';
  const commands = [`M${r(points[0][0])} ${r(points[0][1])}`];
  for (let index = 0; index < points.length - 1; index += 1) {
    const p0 = points[Math.max(0, index - 1)];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[Math.min(points.length - 1, index + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    commands.push(`C${r(c1[0])} ${r(c1[1])} ${r(c2[0])} ${r(c2[1])} ${r(p2[0])} ${r(p2[1])}`);
  }
  return commands.join('');
}

function r(value: number): number {
  return Math.round(value * 100) / 100;
}

export { fmtNum };
