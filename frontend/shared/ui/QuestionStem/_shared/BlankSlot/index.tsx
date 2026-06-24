import React from 'react';
import cs from 'classnames';
import s from './index.module.scss';

export interface BlankSlotProps {
  /** 빈칸 안에 표시할 레이블. 예: "㉠", "A", "(가)" — 없으면 빈 밑줄만 표시 */
  label?: string;
  /** 빈칸 너비 (px). 기본값 60 */
  width?: number;
  className?: string;
}

/**
 * BlankSlot
 * 수능 지문의 빈칸(___) 또는 기호(㉠, ㉡, (가)) 표시 인라인 요소.
 * 텍스트 흐름 안에 inline으로 삽입됩니다.
 */
export const BlankSlot: React.FC<BlankSlotProps> = ({
  label,
  width = 60,
  className,
}) => {
  return (
    <span
      className={cs(s.blankSlot, className)}
      style={{ minWidth: width }}
    >
      {label ?? ''}
    </span>
  );
};
