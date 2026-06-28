import React from 'react';
import cs from 'classnames';
import s from './index.module.scss';
import { MatrixCell } from '../MatrixCell';
import type { MatrixHeader } from '@/types/questionstem';

export interface MatrixHeadProps {
  headers?: MatrixHeader[];
  className?: string;
}

/**
 * MatrixHead
 * 비교 행렬 표의 헤더 행 (<thead> + <th>).
 * headers 배열을 받아 각 열의 제목을 렌더링합니다.
 */
export const MatrixHead: React.FC<MatrixHeadProps> = ({ headers, className }) => {
  const safeHeaders = headers ?? [];
  return (
    <thead className={cs(s.head, className)}>
      <tr>
        {safeHeaders.map((header, index) => {
          const id = typeof header === 'string' ? `h-${index}` : header.id;
          const label = typeof header === 'string' ? header : header.label;
          return <th key={id} className={s.th}>{label}</th>;
        })}
      </tr>
    </thead>
  );
};
