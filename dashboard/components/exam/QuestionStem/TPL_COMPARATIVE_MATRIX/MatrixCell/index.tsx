import React from 'react';
import cs from 'classnames';
import s from './index.module.scss';

export interface MatrixCellProps {
  children: React.ReactNode;
  /** 셀 정렬 방향 */
  align?: 'left' | 'center' | 'right';
  /** 강조 셀 여부 (배경색 변경) */
  highlight?: boolean;
  className?: string;
}

/**
 * MatrixCell
 * 비교 행렬 표의 개별 데이터 셀 (<td>).
 */
export const MatrixCell: React.FC<MatrixCellProps> = ({
  children,
  align = 'center',
  highlight = false,
  className,
}) => {
  return (
    <td className={cs(s.cell, s[align], highlight && s.highlight, className)}>
      {children}
    </td>
  );
};
