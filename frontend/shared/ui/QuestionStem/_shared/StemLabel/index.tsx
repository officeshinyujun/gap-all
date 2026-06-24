import React from 'react';
import cs from 'classnames';
import s from './index.module.scss';

export interface StemLabelProps {
  children: React.ReactNode;
  className?: string;
}

/**
 * StemLabel
 * "다음 글을 읽고 물음에 답하시오." 같은 지시문 레이블.
 * 지문 상단에 위치하는 안내 텍스트입니다.
 */
export const StemLabel: React.FC<StemLabelProps> = ({ children, className }) => {
  if (!children) return null;
  return (
    <p className={cs(s.stemLabel, className)}>
      {children}
    </p>
  );
};
