/**
 * 그래프 SVG 렌더러(기출 회색조 양식).
 * 축·눈금·점선 보조선·축 제목(단위)·범례 상자·값 라벨을 그린다. 계열 구분은 기출처럼
 * 흰 막대(검은 테두리) → 회색 → 빗금 → 점무늬 → 진한 회색 순이다.
 */
import { num } from '../calculation/calculation-kit';
import { axisStep, axisTitle, type ChartAxis, type ChartFigureSpec, type ChartSeries } from './figure-spec';
import { el, multilineText, svgRoot, textEl, textWidth, wrapText } from './svg-builder';

const INK = '#000';
const GRID = '#8c8c8c';
const FONT = 15;
const SMALL = 13;
const PLOT_HEIGHT = 190;
const WIDTH = 480;

type Fill = Readonly<{ fill: string; key: string }>;

/** 계열 채우기(패턴 id는 그림마다 접두를 붙여 문서 안에서 겹치지 않게 한다) */
function fills(prefix: string): Fill[] {
  return [
    { key: 'white', fill: '#fff' },
    { key: 'gray', fill: '#b4b4b4' },
    { key: 'hatch', fill: `url(#${prefix}-hatch)` },
    { key: 'dots', fill: `url(#${prefix}-dots)` },
    { key: 'dark', fill: '#5a5a5a' },
    { key: 'cross', fill: `url(#${prefix}-cross)` },
  ];
}

function patternDefs(prefix: string): string {
  return el('defs', {}, [
    el('pattern', { id: `${prefix}-hatch`, patternUnits: 'userSpaceOnUse', width: 5, height: 5, patternTransform: 'rotate(45)' }, [
      el('rect', { width: 5, height: 5, fill: '#fff' }),
      el('line', { x1: 0, y1: 0, x2: 0, y2: 5, stroke: INK, 'stroke-width': 1.1 }),
    ]),
    el('pattern', { id: `${prefix}-dots`, patternUnits: 'userSpaceOnUse', width: 4.5, height: 4.5 }, [
      el('rect', { width: 4.5, height: 4.5, fill: '#fff' }),
      el('circle', { cx: 2.25, cy: 2.25, r: 0.95, fill: INK }),
    ]),
    el('pattern', { id: `${prefix}-cross`, patternUnits: 'userSpaceOnUse', width: 6, height: 6 }, [
      el('rect', { width: 6, height: 6, fill: '#fff' }),
      el('path', { d: 'M0 0L6 6M6 0L0 6', stroke: INK, 'stroke-width': 0.8 }),
    ]),
  ]);
}

/** 막대 계열 채우기: 계열이 하나면 기출 파레토처럼 회색 막대 */
function barFill(prefix: string, index: number, barCount: number): string {
  if (barCount === 1) return fills(prefix)[1].fill;
  return fills(prefix)[index % 6].fill;
}

const MARKERS = ['circle', 'square', 'diamond', 'triangle'] as const;

function marker(kind: (typeof MARKERS)[number], x: number, y: number): string {
  const common = { stroke: INK, 'stroke-width': 1.2 };
  switch (kind) {
    case 'circle':
      return el('circle', { cx: x, cy: y, r: 3.6, fill: INK, ...common });
    case 'square':
      return el('rect', { x: x - 3.4, y: y - 3.4, width: 6.8, height: 6.8, fill: '#fff', ...common });
    case 'diamond':
      return el('polygon', { points: pts([[x, y - 4.6], [x + 4.6, y], [x, y + 4.6], [x - 4.6, y]]), fill: '#fff', ...common });
    case 'triangle':
      return el('polygon', { points: pts([[x, y - 4.6], [x + 4.4, y + 3.4], [x - 4.4, y + 3.4]]), fill: INK, ...common });
  }
}

const LINE_DASHES = [undefined, undefined, '6 3', '2 2'] as const;

function pts(points: readonly (readonly [number, number])[]): string {
  return points.map(([x, y]) => `${Math.round(x * 100) / 100},${Math.round(y * 100) / 100}`).join(' ');
}

function ticks(axis: ChartAxis): number[] {
  const step = axisStep(axis);
  const count = Math.round((axis.max - axis.min) / step);
  return Array.from({ length: count + 1 }, (_, index) => Math.round((axis.min + step * index) * 1e6) / 1e6);
}

type LegendItem = Readonly<{ name: string; swatch: 'bar' | 'line'; fill?: string; marker?: (typeof MARKERS)[number]; dash?: string }>;

/** 범례 상자: 오른쪽 정렬, 한 줄(넘치면 두 줄). 높이를 돌려준다. */
function legend(items: readonly LegendItem[], right: number, top: number, maxWidth: number): { svg: string; height: number } {
  if (items.length === 0) return { svg: '', height: 0 };
  const itemWidth = (item: LegendItem) => 26 + textWidth(item.name, SMALL);
  const rows: LegendItem[][] = [[]];
  let rowWidth = 0;
  for (const item of items) {
    const width = itemWidth(item) + 12;
    if (rowWidth + width > maxWidth - 16 && rows[rows.length - 1].length > 0) {
      rows.push([]);
      rowWidth = 0;
    }
    rows[rows.length - 1].push(item);
    rowWidth += width;
  }
  const boxWidth = Math.max(...rows.map((row) => row.reduce((sum, item) => sum + itemWidth(item) + 12, 0))) + 6;
  const rowHeight = 18;
  const boxHeight = rows.length * rowHeight + 6;
  const left = right - boxWidth;
  const parts = [el('rect', { x: left, y: top, width: boxWidth, height: boxHeight, fill: '#fff', stroke: INK, 'stroke-width': 0.8 })];
  rows.forEach((row, rowIndex) => {
    let x = left + 9;
    const cy = top + 3 + rowHeight * rowIndex + rowHeight / 2;
    for (const item of row) {
      if (item.swatch === 'bar') {
        parts.push(el('rect', { x, y: cy - 5.5, width: 16, height: 11, fill: item.fill ?? '#fff', stroke: INK, 'stroke-width': 0.9 }));
      } else {
        parts.push(el('line', { x1: x - 1, y1: cy, x2: x + 17, y2: cy, stroke: INK, 'stroke-width': 1.3, 'stroke-dasharray': item.dash }));
        if (item.marker !== undefined) parts.push(marker(item.marker, x + 8, cy));
      }
      parts.push(textEl(x + 22, cy + 4, item.name, { 'font-size': SMALL }));
      x += itemWidth(item) + 12;
    }
  });
  return { svg: parts.join(''), height: boxHeight };
}

function valueLabel(value: number, percent: boolean): string {
  return `${num(value)}${percent ? '%' : ''}`;
}

/** 공용 머리(제목·범례) */
function header(spec: ChartFigureSpec, legendItems: readonly LegendItem[], plotRight: number): { parts: string[]; top: number } {
  const parts: string[] = [];
  let top = 6;
  if (spec.title !== undefined) {
    parts.push(textEl(WIDTH / 2, top + 15, spec.title, { 'text-anchor': 'middle', 'font-size': 16, 'font-weight': 700 }));
    top += 26;
  }
  if (legendItems.length > 0) {
    const box = legend(legendItems, plotRight, top + 2, WIDTH - 20);
    parts.push(box.svg);
    top += box.height + 8;
  }
  return { parts, top };
}

export function renderChartSvg(spec: ChartFigureSpec, prefix: string): string {
  switch (spec.chartType) {
    case 'pie':
      return renderPie(spec, prefix);
    case 'radar':
      return renderRadar(spec, prefix);
    case 'hbar':
    case 'stacked_hbar':
      return renderHorizontal(spec, prefix);
    default:
      return renderVertical(spec, prefix);
  }
}

// ------------------------------------------------------------
// 세로형: bar, stacked_bar, line, bar_line
// ------------------------------------------------------------

function renderVertical(spec: ChartFigureSpec, prefix: string): string {
  const stacked = spec.chartType === 'stacked_bar';
  const isLine = (entry: ChartSeries) => spec.chartType === 'line' || (spec.chartType === 'bar_line' && entry.render === 'line');
  const barSeries = spec.series.filter((entry) => !isLine(entry));
  const lineSeries = spec.series.filter(isLine);
  const showValues = spec.showValues !== false;
  const percent = spec.percent === true;
  const left = spec.valueAxis;
  const right = spec.chartType === 'bar_line' ? spec.secondaryAxis : undefined;
  const leftTicks = ticks(left);
  const rightTicks = right === undefined ? [] : ticks(right);
  const tickWidth = (values: readonly number[]) => Math.max(...values.map((value) => textWidth(num(value), FONT)));
  const plotLeft = 14 + Math.max(tickWidth(leftTicks) + 8, textWidth(axisTitle(left), FONT) / 2 - 4);
  const plotRight = WIDTH - (right === undefined ? 16 : 14 + Math.max(tickWidth(rightTicks) + 8, textWidth(axisTitle(right), FONT) / 2 - 4));

  const legendItems: LegendItem[] = [];
  if (spec.series.length > 1) {
    let barIndex = 0;
    let lineIndex = 0;
    for (const entry of spec.series) {
      if (isLine(entry)) {
        legendItems.push({ name: entry.name, swatch: 'line', marker: MARKERS[lineIndex % 4], dash: LINE_DASHES[lineIndex % 4] });
        lineIndex += 1;
      } else {
        legendItems.push({ name: entry.name, swatch: 'bar', fill: barFill(prefix, barIndex, barSeries.length) });
        barIndex += 1;
      }
    }
  }
  const head = header(spec, legendItems, plotRight);
  const parts = [...head.parts];
  // 축 제목은 축 위에(기출 관례)
  const axisTitleY = head.top + 13;
  parts.push(textEl(plotLeft, axisTitleY, axisTitle(left), { 'text-anchor': 'middle', 'font-size': FONT }));
  if (right !== undefined) parts.push(textEl(plotRight, axisTitleY, axisTitle(right), { 'text-anchor': 'middle', 'font-size': FONT }));
  const plotTop = axisTitleY + 18;
  const plotBottom = plotTop + PLOT_HEIGHT;
  const plotWidth = plotRight - plotLeft;
  const band = plotWidth / spec.categories.length;
  const yLeft = (value: number) => plotBottom - ((value - left.min) / (left.max - left.min)) * PLOT_HEIGHT;
  const yRight = right === undefined ? yLeft : (value: number) => plotBottom - ((value - right.min) / (right.max - right.min)) * PLOT_HEIGHT;

  // 보조선·눈금
  for (const value of leftTicks) {
    const y = yLeft(value);
    if (value !== left.min) parts.push(el('line', { x1: plotLeft, y1: y, x2: plotRight, y2: y, stroke: GRID, 'stroke-width': 0.8, 'stroke-dasharray': '3 3' }));
    parts.push(el('line', { x1: plotLeft - 4, y1: y, x2: plotLeft, y2: y, stroke: INK, 'stroke-width': 1 }));
    parts.push(textEl(plotLeft - 7, y + 4.5, num(value), { 'text-anchor': 'end', 'font-size': FONT }));
  }
  for (const value of rightTicks) {
    const y = yRight(value);
    parts.push(el('line', { x1: plotRight, y1: y, x2: plotRight + 4, y2: y, stroke: INK, 'stroke-width': 1 }));
    parts.push(textEl(plotRight + 7, y + 4.5, num(value), { 'text-anchor': 'start', 'font-size': FONT }));
  }

  // 막대
  const labels: string[] = [];
  const baseline = Math.min(Math.max(0, left.min), left.max);
  if (barSeries.length > 0) {
    const groupWidth = band * (stacked || barSeries.length === 1 ? 0.46 : Math.min(0.78, 0.3 + 0.16 * barSeries.length));
    const barWidth = stacked ? groupWidth : groupWidth / barSeries.length;
    spec.categories.forEach((_, categoryIndex) => {
      const center = plotLeft + band * (categoryIndex + 0.5);
      let stackBase = left.min;
      barSeries.forEach((entry, seriesIndex) => {
        const value = entry.values[categoryIndex] ?? 0;
        const axisY = entry.axis === 'right' && right !== undefined ? yRight : yLeft;
        const fill = barFill(prefix, seriesIndex, barSeries.length);
        if (stacked) {
          const y0 = axisY(stackBase);
          const y1 = axisY(stackBase + value);
          const x = center - barWidth / 2;
          parts.push(el('rect', { x, y: y1, width: barWidth, height: Math.max(0, y0 - y1), fill, stroke: INK, 'stroke-width': 1 }));
          if (showValues && value > 0) {
            labels.push(y0 - y1 >= 15
              ? boxedLabel(center, (y0 + y1) / 2 + 4.3, valueLabel(value, percent), fill)
              : textEl(center + barWidth / 2 + 4, (y0 + y1) / 2 + 4.3, valueLabel(value, percent), { 'font-size': SMALL }));
          }
          stackBase += value;
        } else {
          const x = center - groupWidth / 2 + barWidth * seriesIndex;
          const yValue = axisY(value);
          const yBase = axisY(baseline);
          parts.push(el('rect', { x, y: Math.min(yValue, yBase), width: barWidth, height: Math.abs(yBase - yValue), fill, stroke: INK, 'stroke-width': 1 }));
          if (showValues) {
            const above = value >= baseline;
            labels.push(textEl(x + barWidth / 2, above ? yValue - 4 : yValue + 13, valueLabel(value, percent), {
              'text-anchor': 'middle',
              'font-size': barSeries.length > 2 ? SMALL - 1 : SMALL,
            }));
          }
        }
      });
    });
  }

  // 꺾은선
  const linePoints = lineSeries.map((entry) => {
    const axisY = entry.axis === 'right' && right !== undefined ? yRight : yLeft;
    return entry.values.map((value, index) => [plotLeft + band * (index + 0.5), axisY(value)] as const);
  });
  lineSeries.forEach((entry, seriesIndex) => {
    const points = linePoints[seriesIndex];
    parts.push(el('polyline', {
      points: pts(points),
      fill: 'none',
      stroke: INK,
      'stroke-width': 1.4,
      'stroke-dasharray': LINE_DASHES[seriesIndex % 4],
      'stroke-linejoin': 'round',
    }));
    for (const [x, y] of points) parts.push(marker(MARKERS[seriesIndex % 4], x, y));
  });
  if (showValues) {
    spec.categories.forEach((_, categoryIndex) => {
      // 같은 범주의 점들: 가장 위는 위에, 가장 아래는 아래에, 나머지는 오른쪽에 라벨
      const order = lineSeries
        .map((entry, seriesIndex) => ({ entry, y: linePoints[seriesIndex][categoryIndex]?.[1] ?? 0, x: linePoints[seriesIndex][categoryIndex]?.[0] ?? 0 }))
        .sort((a, b) => a.y - b.y);
      order.forEach((point, rank) => {
        const value = point.entry.values[categoryIndex] ?? 0;
        const label = valueLabel(value, percent || (point.entry.axis === 'right' && right?.unit === '%'));
        const hasBar = barSeries.length > 0;
        if (rank === 0) {
          if (hasBar) {
            // 막대 위에 겹칠 수 있으므로 점 왼쪽 위에 흰 바탕을 깔고 적는다.
            const width = textWidth(label, SMALL) + 4;
            labels.push(el('rect', { x: point.x - 7 - width, y: point.y - 19.5, width, height: 15, fill: '#fff', rx: 1.5 }));
            labels.push(textEl(point.x - 9, point.y - 8, label, { 'text-anchor': 'end', 'font-size': SMALL }));
          } else {
            labels.push(textEl(point.x, point.y - 8, label, { 'text-anchor': 'middle', 'font-size': SMALL }));
          }
        } else if (rank === order.length - 1) {
          labels.push(textEl(point.x, point.y + 17, label, { 'text-anchor': 'middle', 'font-size': SMALL }));
        } else {
          labels.push(textEl(point.x + 9, point.y + 4.5, label, { 'text-anchor': 'start', 'font-size': SMALL }));
        }
      });
    });
  }
  parts.push(...labels);

  // 축선
  parts.push(el('line', { x1: plotLeft, y1: plotTop - 6, x2: plotLeft, y2: plotBottom, stroke: INK, 'stroke-width': 1.1 }));
  parts.push(el('line', { x1: plotLeft, y1: yLeft(baseline), x2: plotRight, y2: yLeft(baseline), stroke: INK, 'stroke-width': 1.1 }));
  if (baseline !== left.min) parts.push(el('line', { x1: plotLeft, y1: plotBottom, x2: plotRight, y2: plotBottom, stroke: INK, 'stroke-width': 0.8 }));
  if (right !== undefined) parts.push(el('line', { x1: plotRight, y1: plotTop - 6, x2: plotRight, y2: plotBottom, stroke: INK, 'stroke-width': 1.1 }));

  // 범주 라벨
  const categoryFont = band < 52 ? SMALL : FONT;
  let maxLines = 1;
  spec.categories.forEach((category, index) => {
    const lines = wrapText(category, band - 6, categoryFont, 2);
    maxLines = Math.max(maxLines, lines.length);
    parts.push(el('line', { x1: plotLeft + band * (index + 0.5), y1: plotBottom, x2: plotLeft + band * (index + 0.5), y2: plotBottom + 4, stroke: INK, 'stroke-width': 1 }));
    parts.push(multilineText(plotLeft + band * (index + 0.5), plotBottom + 19, lines, categoryFont + 3, { 'text-anchor': 'middle', 'font-size': categoryFont }));
  });
  let bottom = plotBottom + 19 + (maxLines - 1) * (categoryFont + 3) + 6;
  if (spec.categoryLabel !== undefined) {
    parts.push(textEl((plotLeft + plotRight) / 2, bottom + 15, spec.categoryLabel, { 'text-anchor': 'middle', 'font-size': FONT }));
    bottom += 20;
  }
  return svgRoot(WIDTH, bottom + 4, [patternDefs(prefix), ...parts], { 'font-size': FONT });
}

/**
 * 칸 안 값 라벨: 흰·회색 칸은 그대로, 진한 회색 칸은 흰 글자, 빗금·점무늬 칸은 흰 바탕을 깔아 읽히게 한다.
 */
function boxedLabel(x: number, y: number, label: string, fill: string): string {
  const patterned = fill.startsWith('url(');
  const dark = fill === '#5a5a5a';
  const width = textWidth(label, SMALL) + 5;
  return [
    patterned ? el('rect', { x: x - width / 2, y: y - 11, width, height: 14.5, fill: '#fff', rx: 1.5 }) : '',
    textEl(x, y, label, { 'text-anchor': 'middle', 'font-size': SMALL, fill: dark ? '#fff' : undefined }),
  ].join('');
}

// ------------------------------------------------------------
// 가로형: hbar, stacked_hbar (기출 q6처럼 범주는 왼쪽, 세로 점선 눈금, 축 제목은 아래)
// ------------------------------------------------------------

function renderHorizontal(spec: ChartFigureSpec, prefix: string): string {
  const stacked = spec.chartType === 'stacked_hbar';
  const showValues = spec.showValues !== false;
  const percent = spec.percent === true;
  const axis = spec.valueAxis;
  const axisTicks = ticks(axis);
  const labelWidth = Math.min(132, Math.max(...spec.categories.map((category) => textWidth(category, FONT))) + 4);
  const plotLeft = 12 + labelWidth + 8;
  const lastTick = textWidth(num(axisTicks[axisTicks.length - 1] ?? axis.max), FONT) / 2;
  const valueRoom = showValues && !stacked ? 30 : 0;
  const plotRight = WIDTH - Math.max(14 + lastTick, valueRoom);
  const legendItems: LegendItem[] = spec.series.length > 1
    ? spec.series.map((entry, index) => ({ name: entry.name, swatch: 'bar' as const, fill: barFill(prefix, index, spec.series.length) }))
    : [];
  const head = header(spec, legendItems, plotRight);
  const parts = [...head.parts];
  const plotTop = head.top + 6;
  const seriesCount = spec.series.length;
  const rowHeight = stacked ? 44 : Math.max(26, 12 + 13 * seriesCount);
  const plotHeight = rowHeight * spec.categories.length;
  const plotBottom = plotTop + plotHeight;
  const x = (value: number) => plotLeft + ((value - axis.min) / (axis.max - axis.min)) * (plotRight - plotLeft);
  for (const value of axisTicks) {
    const px = x(value);
    if (value !== axis.min) parts.push(el('line', { x1: px, y1: plotTop, x2: px, y2: plotBottom, stroke: GRID, 'stroke-width': 0.8, 'stroke-dasharray': '3 3' }));
    parts.push(el('line', { x1: px, y1: plotBottom, x2: px, y2: plotBottom + 4, stroke: INK, 'stroke-width': 1 }));
    parts.push(textEl(px, plotBottom + 18, num(value), { 'text-anchor': 'middle', 'font-size': FONT }));
  }
  const labels: string[] = [];
  spec.categories.forEach((category, categoryIndex) => {
    const rowTop = plotTop + rowHeight * categoryIndex;
    const center = rowTop + rowHeight / 2;
    const lines = wrapText(category, labelWidth, FONT, 2);
    parts.push(multilineText(plotLeft - 8, center + 4.5 - ((lines.length - 1) * 15) / 2, lines, 15, { 'text-anchor': 'end', 'font-size': FONT }));
    parts.push(el('line', { x1: plotLeft - 4, y1: center, x2: plotLeft, y2: center, stroke: INK, 'stroke-width': 1 }));
    if (stacked) {
      let base = axis.min;
      spec.series.forEach((entry, seriesIndex) => {
        const value = entry.values[categoryIndex] ?? 0;
        const x0 = x(base);
        const x1 = x(base + value);
        const fill = barFill(prefix, seriesIndex, seriesCount);
        parts.push(el('rect', { x: x0, y: center - 8, width: Math.max(0, x1 - x0), height: 22, fill, stroke: INK, 'stroke-width': 1 }));
        const label = valueLabel(value, percent);
        if (showValues && value > 0) {
          // 칸이 좁으면 막대 위에 적는다.
          labels.push(x1 - x0 >= textWidth(label, SMALL) + 6
            ? boxedLabel((x0 + x1) / 2, center + 7.3, label, fill)
            : textEl((x0 + x1) / 2, center - 14, label, { 'text-anchor': 'middle', 'font-size': SMALL }));
        }
        base += value;
      });
    } else {
      const barHeight = Math.min(16, (rowHeight - 8) / seriesCount);
      const groupTop = center - (barHeight * seriesCount) / 2;
      spec.series.forEach((entry, seriesIndex) => {
        const value = entry.values[categoryIndex] ?? 0;
        const y = groupTop + barHeight * seriesIndex;
        const x0 = x(Math.min(Math.max(0, axis.min), axis.max));
        const x1 = x(value);
        parts.push(el('rect', { x: Math.min(x0, x1), y, width: Math.abs(x1 - x0), height: barHeight, fill: barFill(prefix, seriesIndex, seriesCount), stroke: INK, 'stroke-width': 1 }));
        if (showValues) labels.push(textEl(Math.max(x0, x1) + 3, y + barHeight / 2 + 4.2, valueLabel(value, percent), { 'font-size': SMALL }));
      });
    }
  });
  parts.push(...labels);
  parts.push(el('line', { x1: plotLeft, y1: plotTop, x2: plotLeft, y2: plotBottom, stroke: INK, 'stroke-width': 1.1 }));
  parts.push(el('line', { x1: plotLeft, y1: plotBottom, x2: plotRight, y2: plotBottom, stroke: INK, 'stroke-width': 1.1 }));
  let bottom = plotBottom + 18;
  parts.push(textEl((plotLeft + plotRight) / 2, bottom + 19, axisTitle(axis), { 'text-anchor': 'middle', 'font-size': FONT }));
  bottom += 24;
  if (spec.categoryLabel !== undefined) {
    parts.push(textEl(plotLeft - 8, plotTop - 6, spec.categoryLabel, { 'text-anchor': 'end', 'font-size': FONT }));
  }
  return svgRoot(WIDTH, bottom + 4, [patternDefs(prefix), ...parts], { 'font-size': FONT });
}

// ------------------------------------------------------------
// 원그래프: 12시 방향부터 시계 방향, 오른쪽 범례, 조각 안 "nn%"
// ------------------------------------------------------------

function renderPie(spec: ChartFigureSpec, prefix: string): string {
  const values = spec.series[0]?.values ?? [];
  const total = values.reduce((sum, value) => sum + value, 0) || 1;
  const parts: string[] = [];
  let top = 8;
  if (spec.title !== undefined) {
    parts.push(textEl(WIDTH / 2, top + 15, spec.title, { 'text-anchor': 'middle', 'font-size': 16, 'font-weight': 700 }));
    top += 28;
  }
  const radius = 92;
  const legendWidth = Math.max(...spec.categories.map((category) => textWidth(category, FONT))) + 30;
  const gap = 34;
  const blockWidth = radius * 2 + gap + legendWidth;
  const cx = (WIDTH - blockWidth) / 2 + radius;
  const cy = top + radius + 14;
  const palette = fills(prefix);
  let angle = -Math.PI / 2;
  const labels: string[] = [];
  values.forEach((value, index) => {
    const sweep = (value / total) * Math.PI * 2;
    const end = angle + sweep;
    const fill = palette[index % palette.length].fill;
    const [x0, y0] = [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
    const [x1, y1] = [cx + radius * Math.cos(end), cy + radius * Math.sin(end)];
    const large = sweep > Math.PI ? 1 : 0;
    const d = values.length === 1
      ? `M${cx - radius} ${cy}A${radius} ${radius} 0 1 1 ${cx + radius} ${cy}A${radius} ${radius} 0 1 1 ${cx - radius} ${cy}Z`
      : `M${r2(cx)} ${r2(cy)}L${r2(x0)} ${r2(y0)}A${radius} ${radius} 0 ${large} 1 ${r2(x1)} ${r2(y1)}Z`;
    parts.push(el('path', { d, fill, stroke: INK, 'stroke-width': 1.1, 'stroke-linejoin': 'round' }));
    const middle = angle + sweep / 2;
    const label = `${num(value)}%`;
    if (value / total >= 0.07) {
      const lx = cx + radius * 0.62 * Math.cos(middle);
      const ly = cy + radius * 0.62 * Math.sin(middle) + 4.5;
      labels.push(boxedLabel(lx, ly, label, fill));
    } else {
      const [ex, ey] = [cx + radius * Math.cos(middle), cy + radius * Math.sin(middle)];
      const [ox, oy] = [cx + (radius + 14) * Math.cos(middle), cy + (radius + 14) * Math.sin(middle)];
      parts.push(el('line', { x1: ex, y1: ey, x2: ox, y2: oy, stroke: INK, 'stroke-width': 0.8 }));
      labels.push(textEl(ox + (Math.cos(middle) >= 0 ? 2 : -2), oy + 4, label, { 'text-anchor': Math.cos(middle) >= 0 ? 'start' : 'end', 'font-size': SMALL }));
    }
    angle = end;
  });
  parts.push(...labels);
  // 범례(세로 목록)
  const legendLeft = cx + radius + gap;
  const legendTop = cy - (spec.categories.length * 22) / 2;
  spec.categories.forEach((category, index) => {
    const y = legendTop + index * 22 + 11;
    parts.push(el('rect', { x: legendLeft, y: y - 6.5, width: 15, height: 13, fill: palette[index % palette.length].fill, stroke: INK, 'stroke-width': 0.9 }));
    parts.push(textEl(legendLeft + 22, y + 4.5, category, { 'font-size': FONT }));
  });
  let bottom = cy + radius + 12;
  const unitNote = spec.series[0]?.name;
  if (unitNote !== undefined && unitNote !== '') {
    parts.push(textEl(legendLeft, cy + radius - 2, `(${unitNote})`, { 'font-size': SMALL }));
  }
  bottom += 4;
  return svgRoot(WIDTH, bottom, [patternDefs(prefix), ...parts], { 'font-size': FONT });
}

function r2(value: number): number {
  return Math.round(value * 100) / 100;
}

// ------------------------------------------------------------
// 방사형: 다각형 눈금, 꼭짓점 라벨, 계열별 선 양식
// ------------------------------------------------------------

function renderRadar(spec: ChartFigureSpec, prefix: string): string {
  const axis = spec.valueAxis;
  const levels = ticks(axis);
  const count = spec.categories.length;
  const legendItems: LegendItem[] = spec.series.length > 1
    ? spec.series.map((entry, index) => ({ name: entry.name, swatch: 'line' as const, marker: MARKERS[index % 4], dash: LINE_DASHES[index % 4] }))
    : [];
  const head = header(spec, legendItems, WIDTH - 16);
  const parts = [...head.parts];
  const radius = 98;
  const cx = WIDTH / 2;
  const cy = head.top + radius + 30;
  const point = (index: number, value: number) => {
    const angle = -Math.PI / 2 + (index / count) * Math.PI * 2;
    const ratio = (value - axis.min) / (axis.max - axis.min);
    return [cx + radius * ratio * Math.cos(angle), cy + radius * ratio * Math.sin(angle)] as const;
  };
  levels.forEach((level, levelIndex) => {
    if (level === axis.min) return;
    const ring = spec.categories.map((_, index) => point(index, level));
    parts.push(el('polygon', { points: pts(ring), fill: 'none', stroke: levelIndex === levels.length - 1 ? INK : GRID, 'stroke-width': levelIndex === levels.length - 1 ? 1.1 : 0.8 }));
  });
  spec.categories.forEach((_, index) => {
    const [x, y] = point(index, axis.max);
    parts.push(el('line', { x1: cx, y1: cy, x2: x, y2: y, stroke: GRID, 'stroke-width': 0.8 }));
  });
  // 눈금 값: 맨 위 축 왼쪽(점과 겹치지 않게), 중심값은 생략
  for (const level of levels) {
    if (level === axis.min) continue;
    const [x, y] = point(0, level);
    parts.push(textEl(x - 4, y + 3.5, num(level), { 'text-anchor': 'end', 'font-size': SMALL - 1.5, fill: '#444' }));
  }
  spec.series.forEach((entry, seriesIndex) => {
    const shape = entry.values.map((value, index) => point(index, value));
    parts.push(el('polygon', { points: pts(shape), fill: 'none', stroke: INK, 'stroke-width': 1.7, 'stroke-dasharray': LINE_DASHES[seriesIndex % 4], 'stroke-linejoin': 'round' }));
    for (const [x, y] of shape) parts.push(marker(MARKERS[seriesIndex % 4], x, y));
  });
  spec.categories.forEach((category, index) => {
    const angle = -Math.PI / 2 + (index / count) * Math.PI * 2;
    const x = cx + (radius + 14) * Math.cos(angle);
    const y = cy + (radius + 14) * Math.sin(angle);
    const anchor = Math.abs(Math.cos(angle)) < 0.2 ? 'middle' : Math.cos(angle) > 0 ? 'start' : 'end';
    const lines = wrapText(category, 96, FONT, 2);
    const dy = Math.sin(angle) < -0.5 ? -((lines.length - 1) * 15) : Math.sin(angle) > 0.5 ? 10 : 4.5 - ((lines.length - 1) * 15) / 2;
    parts.push(multilineText(x, y + dy, lines, 15, { 'text-anchor': anchor, 'font-size': FONT }));
  });
  if (spec.showValues === true) {
    spec.series.forEach((entry) => entry.values.forEach((value, index) => {
      const [x, y] = point(index, value);
      parts.push(textEl(x + 6, y - 5, num(value), { 'font-size': SMALL - 1 }));
    }));
  }
  const bottom = cy + radius + 34;
  if (axis.unit !== '') parts.push(textEl(WIDTH - 16, bottom - 6, `(단위: ${axis.unit})`, { 'text-anchor': 'end', 'font-size': SMALL - 0.5 }));
  return svgRoot(WIDTH, bottom, [patternDefs(prefix), ...parts], { 'font-size': FONT });
}
