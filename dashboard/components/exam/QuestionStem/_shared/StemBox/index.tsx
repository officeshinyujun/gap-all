import React from 'react';
import cs from 'classnames';
import s from './index.module.scss';

export interface StemBoxProps {
  children: React.ReactNode;
  variant?: 'default' | 'bordered';
  className?: string;
}

/**
 * StemBox
 * 지문 전체를 감싸는 외곽 박스.
 * 수능 시험지의 지문 영역처럼 흰 배경 + 테두리 스타일을 제공합니다.
 */
export const StemBox: React.FC<StemBoxProps> = ({
  children,
  variant = 'default',
  className,
}) => {
  return (
    <div className={cs(s.stemBox, s[variant], className)}>
      {children}
    </div>
  );
};
