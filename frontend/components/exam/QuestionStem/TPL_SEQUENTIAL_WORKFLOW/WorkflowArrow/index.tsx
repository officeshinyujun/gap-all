import React from 'react';
import cs from 'classnames';
import s from './index.module.scss';

export interface WorkflowArrowProps {
  /** 화살표 방향: horizontal → 오른쪽, vertical → 아래쪽 */
  direction: 'horizontal' | 'vertical';
  className?: string;
}

/**
 * WorkflowArrow
 * 순서도 스텝 사이의 화살표 (→ 또는 ↓).
 * orientation에 따라 방향이 자동으로 결정됩니다.
 */
export const WorkflowArrow: React.FC<WorkflowArrowProps> = ({
  direction,
  className,
}) => {
  return (
    <div
      className={cs(s.arrow, s[direction], className)}
      aria-hidden="true"
    >
      {direction === 'horizontal' ? '→' : '↓'}
    </div>
  );
};
