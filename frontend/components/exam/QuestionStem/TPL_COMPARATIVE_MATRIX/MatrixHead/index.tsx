import React from 'react';
import cs from 'classnames';
import s from './index.module.scss';
import { MatrixCell } from '../MatrixCell';
import type { MatrixHeader } from '@/types/questionstem';

export interface MatrixHeadProps {
  headers: MatrixHeader[];
  className?: string;
}

/**
 * MatrixHead
 * 비교 행렬 표의 헤더 행 (<thead> + <th>).
 * headers 배열을 받아 각 열의 제목을 렌더링합니다.
 */
export const MatrixHead: React.FC<MatrixHeadProps> = ({ headers, className }) => {
  return (
    <thead className={cs(s.head, className)}>
      <tr>
        {headers.map((header) => (
          <th key={header.id} className={s.th}>
            {header.label}
          </th>
        ))}
      </tr>
    </thead>
  );
};
