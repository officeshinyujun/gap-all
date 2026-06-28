import React from 'react';
import cs from 'classnames';
import s from './index.module.scss';
import { MatrixHead } from '../MatrixHead';
import { MatrixRow } from '../MatrixRow';
import type { MatrixHeader, MatrixRowData } from '@/types/questionstem';

export interface MatrixTableProps {
  headers?: MatrixHeader[];
  rows?: MatrixRowData[];
  className?: string;
}

/**
 * MatrixTable
 * 비교 행렬 전체 테이블 래퍼 (<table>).
 * MatrixHead + MatrixRow들을 조합합니다.
 */
export const MatrixTable: React.FC<MatrixTableProps> = ({
  headers,
  rows,
  className,
}) => {
  const safeHeaders = headers ?? [];
  const safeRows = rows ?? [];
  if (safeHeaders.length === 0 || safeRows.length === 0) return null;
  return (
    <div className={s.tableWrapper}>
      <table className={cs(s.table, className)}>
        <MatrixHead headers={safeHeaders} />
        <tbody>
          {safeRows.map((row, index) => (
            <MatrixRow key={row.id ?? `row-${index}`} row={row} index={index} />
          ))}
        </tbody>
      </table>
    </div>
  );
};
