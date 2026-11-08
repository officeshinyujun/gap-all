'use client';

import React, { useState } from 'react';
import cs from 'classnames';
import { VStack } from '@/components/general/VStack';
import { StemBox } from '../_shared/StemBox';
import { StemLabel } from '../_shared/StemLabel';
import type {
  SourceBlock,
  SourceChoiceTable as SourceChoiceTableData,
  SourceFigure,
  SourceTableBlock,
  TPL_SOURCE_BLOCKS,
} from '@/types/questionstem';
import {
  CHOICE_MARKERS,
  getUnreferencedFigureIds,
  layoutSourceTable,
  splitFigureTokens,
} from '@/utils/sourceBlocks';
import s from './index.module.scss';

export interface TPLSourceBlocksProps {
  data: TPL_SOURCE_BLOCKS;
  label?: string;
}

type Figures = Record<string, SourceFigure>;

// ------------------------------------------------------------
// 그림
// ------------------------------------------------------------

interface SourceFigureViewProps {
  id: string;
  figure: SourceFigure | undefined;
  inline?: boolean;
}

const SourceFigureView: React.FC<SourceFigureViewProps> = ({ id, figure, inline = false }) => {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const src = figure?.src ?? null;
  const alt = figure?.alt?.trim() || `[그림 ${id}]`;

  if (!src || failedSrc === src) {
    return (
      <span
        className={cs(s.figureMissing, inline && s.figureMissingInline)}
        role="img"
        aria-label={alt}
        data-figure-id={id}
      >
        {alt}
      </span>
    );
  }

  // 원본 크기·도메인이 제각각인 원문 크롭이므로 next/image 대신 <img>를 쓴다.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={inline ? s.figureInline : s.figureImage}
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      crossOrigin="anonymous"
      data-figure-id={id}
      data-figure-kind={figure?.kind}
      onError={() => setFailedSrc(src)}
    />
  );
};

// ------------------------------------------------------------
// 원문 문자열 (줄바꿈 유지, 마크다운 해석 없음, `[그림 Fk]` 토큰 치환)
// ------------------------------------------------------------

function renderSourceText(text: string, figures: Figures): React.ReactNode {
  const segments = splitFigureTokens(text, figures);
  if (segments.length === 1 && segments[0].type === 'text') return segments[0].text;
  return segments.map((segment, i) =>
    segment.type === 'text' ? (
      <React.Fragment key={i}>{segment.text}</React.Fragment>
    ) : (
      <SourceFigureView key={i} id={segment.figureId} figure={figures[segment.figureId]} inline />
    ),
  );
}

// ------------------------------------------------------------
// 표
// ------------------------------------------------------------

const isShortCell = (text: string) => text.length <= 8 && !text.includes('\n');

const SourceTable: React.FC<{ block: SourceTableBlock; figures: Figures }> = ({ block, figures }) => {
  const layout = layoutSourceTable(block.headers, block.rows);
  if (layout.columnCount === 0) return null;

  return (
    <div className={s.tableBlock}>
      {block.title && <div className={s.tableTitle}>{renderSourceText(block.title, figures)}</div>}
      <div className={s.tableScroll}>
        <table className={s.table}>
          {layout.head.rows.length > 0 && (
            <thead>
              {layout.head.rows.map((cells, r) => (
                <tr key={r}>
                  {cells.map((cell) => (
                    <th
                      key={cell.col}
                      colSpan={cell.colSpan > 1 ? cell.colSpan : undefined}
                      rowSpan={cell.rowSpan > 1 ? cell.rowSpan : undefined}
                      scope={cell.colSpan > 1 ? 'colgroup' : 'col'}
                    >
                      {renderSourceText(cell.text, figures)}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
          )}
          <tbody>
            {layout.body.rows.map((cells, r) => (
              <tr key={r}>
                {cells.map((cell) => (
                  <td
                    key={cell.col}
                    colSpan={cell.colSpan > 1 ? cell.colSpan : undefined}
                    rowSpan={cell.rowSpan > 1 ? cell.rowSpan : undefined}
                    className={isShortCell(cell.text) ? s.cellCenter : undefined}
                  >
                    {renderSourceText(cell.text, figures)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {block.caption && <div className={s.tableCaption}>{renderSourceText(block.caption, figures)}</div>}
    </div>
  );
};

// ------------------------------------------------------------
// 블록
// ------------------------------------------------------------

function renderBlock(block: SourceBlock, index: number, figures: Figures): React.ReactNode {
  switch (block.type) {
    case 'text':
      if (!block.text.trim()) return null;
      return (
        <div key={index} className={s.text}>
          {renderSourceText(block.text, figures)}
        </div>
      );
    case 'table':
      return <SourceTable key={index} block={block} figures={figures} />;
    case 'dialogue':
      if (!block.lines.length) return null;
      return (
        <div key={index} className={s.dialogue}>
          {block.lines.map((line, i) => (
            <div key={i} className={s.dialogueLine}>
              {line.speaker && <span className={s.speaker}>{line.speaker}</span>}
              <span className={s.utterance}>{renderSourceText(line.text, figures)}</span>
            </div>
          ))}
        </div>
      );
    case 'figure':
      return (
        <div key={index} className={s.figureBlock}>
          <SourceFigureView id={block.figure_id} figure={figures[block.figure_id]} />
        </div>
      );
    default:
      return null;
  }
}

export const TPLSourceBlocks: React.FC<TPLSourceBlocksProps> = ({ data, label }) => {
  const figures = data.figures ?? {};
  const trailingFigureIds = getUnreferencedFigureIds({ ...data, figures });

  return (
    <StemBox>
      <VStack gap={16} fullWidth>
        <StemLabel>{label}</StemLabel>
        <div className={s.sourceBox}>
          {(data.blocks ?? []).map((block, i) => renderBlock(block, i, figures))}
          {trailingFigureIds.map((id) => (
            <div key={`trailing-${id}`} className={s.figureBlock}>
              <SourceFigureView id={id} figure={figures[id]} />
            </div>
          ))}
        </div>
      </VStack>
    </StemBox>
  );
};

// ------------------------------------------------------------
// 선택지 머리 표 ((가)/(나) 열, ①~⑤ 행)
// ------------------------------------------------------------

export interface SourceChoiceTableProps {
  data: SourceChoiceTableData;
}

export const SourceChoiceTable: React.FC<SourceChoiceTableProps> = ({ data }) => {
  if (!data.headers.length || !data.rows.length) return null;
  return (
    <div className={s.tableScroll}>
      <table className={cs(s.table, s.choiceTable)}>
        <thead>
          <tr>
            <th aria-label="선택지" />
            {data.headers.map((header, i) => (
              <th key={i} scope="col">{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, r) => (
            <tr key={r}>
              <th scope="row">{CHOICE_MARKERS[r] ?? String(r + 1)}</th>
              {data.headers.map((_, c) => (
                <td key={c}>{row[c] ?? ''}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
