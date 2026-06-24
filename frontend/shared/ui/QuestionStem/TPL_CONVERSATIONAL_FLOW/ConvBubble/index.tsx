import React from 'react';
import cs from 'classnames';
import s from './index.module.scss';

export interface ConvBubbleProps {
  text: string;
  /** 말풍선 방향: 'left' = 상대방, 'right' = 나 */
  direction: 'left' | 'right';
  /** 참여자 인덱스 (색상 구분용) */
  colorIndex: number;
  className?: string;
}

/**
 * ConvBubble
 * 대화 말풍선 컴포넌트.
 * direction에 따라 좌측(상대방) 또는 우측(본인) 스타일로 렌더링됩니다.
 */
export const ConvBubble: React.FC<ConvBubbleProps> = ({
  text,
  direction,
  colorIndex,
  className,
}) => {
  return (
    <div
      className={cs(
        s.bubble,
        s[direction],
        s[`color${colorIndex % 4}`],
        className,
      )}
    >
      <p className={s.text}>{text}</p>
      <span className={cs(s.tail, s[`tail_${direction}`])} />
    </div>
  );
};
