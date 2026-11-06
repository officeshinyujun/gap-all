// ============================================================
// TPL_SOURCE_BLOCKS 헬퍼 (Web·PDF 렌더러 공용)
// 계약: artifacts/reference-corpus-v3/SOURCE_BLOCKS_CONTRACT.md
// ============================================================

import type {
  SourceBlock,
  SourceChoiceTable,
  SourceFigure,
  TPL_SOURCE_BLOCKS,
} from '@/types/questionstem';

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function asString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return '';
}

function asOptionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function asStringGrid(value: unknown): string[][] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((row) => Array.isArray(row))
    .map((row: unknown[]) => row.map(asString));
}

function normalizeBlock(value: unknown): SourceBlock | null {
  const b = asRecord(value);
  switch (b.type) {
    case 'text':
      return { type: 'text', text: asString(b.text) };
    case 'table':
      return {
        type: 'table',
        title: asOptionalString(b.title),
        headers: asStringGrid(b.headers),
        rows: asStringGrid(b.rows),
        caption: asOptionalString(b.caption),
      };
    case 'dialogue':
      return {
        type: 'dialogue',
        lines: Array.isArray(b.lines)
          ? b.lines.map((line: unknown) => {
              const l = asRecord(line);
              return { speaker: asString(l.speaker), text: asString(l.text) };
            })
          : [],
      };
    case 'figure': {
      const id = asString(b.figure_id ?? b.figureId);
      return id ? { type: 'figure', figure_id: id } : null;
    }
    default:
      return null;
  }
}

function normalizeFigure(value: unknown): SourceFigure {
  const f = asRecord(value);
  const src = asOptionalString(f.src ?? f.url);
  const spec = f.spec && typeof f.spec === 'object' && !Array.isArray(f.spec) ? (f.spec as Record<string, unknown>) : null;
  return {
    src,
    alt: asString(f.alt ?? f.description),
    ...(typeof f.kind === 'string' ? { kind: f.kind } : {}),
    ...(spec ? { spec } : {}),
  };
}

function normalizeFigures(value: unknown): Record<string, SourceFigure> {
  const out: Record<string, SourceFigure> = {};
  if (Array.isArray(value)) {
    for (const item of value) {
      const id = asString(asRecord(item).id);
      if (id) out[id] = normalizeFigure(item);
    }
    return out;
  }
  for (const [id, figure] of Object.entries(asRecord(value))) {
    out[id] = normalizeFigure(figure);
  }
  return out;
}

function normalizeChoiceTable(value: unknown): SourceChoiceTable | null {
  const c = asRecord(value);
  const headers = Array.isArray(c.headers) ? c.headers.map(asString) : [];
  const rows = asStringGrid(c.rows);
  if (!headers.length || !rows.length) return null;
  return { headers, rows };
}

export function normalizeSourceBlocks(data: unknown): TPL_SOURCE_BLOCKS {
  const d = asRecord(data);
  return {
    blocks: Array.isArray(d.blocks)
      ? d.blocks.map(normalizeBlock).filter((b): b is SourceBlock => b !== null)
      : [],
    figures: normalizeFigures(d.figures),
    choice_table: normalizeChoiceTable(d.choice_table ?? d.choiceTable),
  };
}

// ------------------------------------------------------------
// 인라인 그림 토큰 `[그림 F2]`
// ------------------------------------------------------------

export type SourceTextSegment =
  | { type: 'text'; text: string }
  | { type: 'figure'; figureId: string };

const FIGURE_TOKEN = /\[그림\s*(F\d+)\]/g;

/**
 * 문자열을 텍스트/그림 조각으로 나눈다.
 * `figures`에 없는 id의 토큰은 원문 텍스트 그대로 둔다.
 */
export function splitFigureTokens(
  text: string,
  figures: Record<string, SourceFigure>,
): SourceTextSegment[] {
  const segments: SourceTextSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(FIGURE_TOKEN)) {
    const id = match[1];
    if (!Object.prototype.hasOwnProperty.call(figures, id)) continue;
    const start = match.index ?? 0;
    if (start > last) segments.push({ type: 'text', text: text.slice(last, start) });
    segments.push({ type: 'figure', figureId: id });
    last = start + match[0].length;
  }
  if (last < text.length) segments.push({ type: 'text', text: text.slice(last) });
  return segments;
}

function collectTokenIds(text: string | null | undefined, into: Set<string>) {
  if (!text) return;
  for (const match of text.matchAll(FIGURE_TOKEN)) into.add(match[1]);
}

/** figure 블록이나 토큰으로 참조되지 않은 그림 id (figures 순서대로) */
export function getUnreferencedFigureIds(data: TPL_SOURCE_BLOCKS): string[] {
  const referenced = new Set<string>();
  for (const block of data.blocks) {
    switch (block.type) {
      case 'figure':
        referenced.add(block.figure_id);
        break;
      case 'text':
        collectTokenIds(block.text, referenced);
        break;
      case 'dialogue':
        block.lines.forEach((line) => collectTokenIds(line.text, referenced));
        break;
      case 'table':
        collectTokenIds(block.title, referenced);
        collectTokenIds(block.caption, referenced);
        [...block.headers, ...block.rows].forEach((row) =>
          row.forEach((cell) => collectTokenIds(cell, referenced)),
        );
        break;
    }
  }
  return Object.keys(data.figures).filter((id) => !referenced.has(id));
}

// ------------------------------------------------------------
// 표 병합 셀 레이아웃
// ------------------------------------------------------------

export interface SourceTableCell {
  text: string;
  row: number;
  col: number;
  colSpan: number;
  rowSpan: number;
}

export interface SourceTableSection {
  /** 각 행에서 실제로 그려야 하는 셀(병합으로 가려진 칸 제외) */
  rows: SourceTableCell[][];
  /** grid[r][c] = 그 칸을 덮는 셀 */
  grid: SourceTableCell[][];
}

export interface SourceTableLayout {
  columnCount: number;
  head: SourceTableSection;
  body: SourceTableSection;
}

const isBlank = (text: string) => text.trim() === '';

/**
 * header: 빈 셀은 바로 위 셀과 rowspan(위 셀이 비어 있지 않고 같은 열에서 시작할 때,
 *         또는 첫 열의 빈 모서리 칸), 아니면 바로 왼쪽 셀과 colspan으로 병합한다.
 * body:   첫 열(행 제목 열)의 빈 셀만 위 셀과 rowspan으로 병합한다.
 *         나머지 빈 셀은 체크 표처럼 실제로 비어 있을 수 있으므로 그대로 둔다.
 */
function layoutSection(
  source: string[][],
  columnCount: number,
  mode: 'head' | 'body',
): SourceTableSection {
  const grid: SourceTableCell[][] = [];
  const rows: SourceTableCell[][] = [];

  source.forEach((sourceRow, r) => {
    grid[r] = [];
    rows[r] = [];
    for (let c = 0; c < columnCount; c += 1) {
      if (grid[r][c]) continue;
      const text = sourceRow[c] ?? '';

      if (isBlank(text) && r > 0) {
        const up = grid[r - 1][c];
        const canMergeUp =
          up &&
          up.col === c &&
          up.row + up.rowSpan === r &&
          (mode === 'head'
            ? !isBlank(up.text) || c === 0
            : !isBlank(up.text) && c === 0 && up.colSpan === 1);
        if (canMergeUp) {
          const span = Array.from({ length: up.colSpan }, (_, k) => c + k);
          const allFree = span.every(
            (k) => !grid[r][k] && isBlank(sourceRow[k] ?? ''),
          );
          if (allFree) {
            up.rowSpan += 1;
            span.forEach((k) => {
              grid[r][k] = up;
            });
            continue;
          }
        }
      }

      if (mode === 'head' && isBlank(text) && c > 0) {
        const left = grid[r][c - 1];
        if (
          left &&
          !isBlank(left.text) &&
          left.row === r &&
          left.rowSpan === 1 &&
          left.col + left.colSpan === c
        ) {
          left.colSpan += 1;
          grid[r][c] = left;
          continue;
        }
      }

      const cell: SourceTableCell = { text, row: r, col: c, colSpan: 1, rowSpan: 1 };
      grid[r][c] = cell;
      rows[r].push(cell);
    }
  });

  return { rows, grid };
}

export function layoutSourceTable(headers: string[][], body: string[][]): SourceTableLayout {
  const columnCount = Math.max(
    0,
    ...headers.map((row) => row.length),
    ...body.map((row) => row.length),
  );
  return {
    columnCount,
    head: layoutSection(headers, columnCount, 'head'),
    body: layoutSection(body, columnCount, 'body'),
  };
}

export const CHOICE_MARKERS = ['①', '②', '③', '④', '⑤'];
