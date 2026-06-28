import React from 'react';
import cs from 'classnames';
import s from './index.module.scss';
import { MatrixCell } from '../MatrixCell';
import type { MatrixRowData } from '@/types/questionstem';

export interface MatrixRowProps {
  row: MatrixRowData;
  /** 짝수/홀수 행 구분을 위한 인덱스 */
  index: number;
  className?: string;
}

/**
 * MatrixRow
 * 비교 행렬 표의 데이터 행 (<tr>).
 * row.cells 배열을 MatrixCell로 렌더링합니다.
 * 첫 번째 셀은 행 헤더(th 역할)로 강조 표시됩니다.
 */
export const MatrixRow: React.FC<MatrixRowProps> = ({ row, index, className }) => {
  const cells = Array.isArray(row.cells)
    ? row.cells
    : row.cells
      ? Object.values(row.cells)
      : typeof row === 'object'
        ? Object.values(row)
        : [];

  const rowId = row.id ?? `row-${index}`;

  return (
    <tr className={cs(s.row, index % 2 === 0 ? s.even : s.odd, className)}>
      {cells.map((cell, cellIndex) => (
        <MatrixCell
          key={`${rowId}-${cellIndex}`}
          highlight={cellIndex === 0}
          align={cellIndex === 0 ? 'left' : 'center'}
        >
          {cell}
        </MatrixCell>
      ))}
    </tr>
  );
};
