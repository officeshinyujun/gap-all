import React from 'react';
import cs from 'classnames';
import s from './index.module.scss';

export interface ConvTimestampProps {
  timestamp: string;
  /** 타임스탬프 정렬 방향 */
  align?: 'left' | 'right' | 'center';
  className?: string;
}

/**
 * ConvTimestamp
 * 대화 메시지의 타임스탬프 표시 컴포넌트.
 */
export const ConvTimestamp: React.FC<ConvTimestampProps> = ({
  timestamp,
  align = 'left',
  className,
}) => {
  return (
    <time className={cs(s.timestamp, s[align], className)}>
      {timestamp}
    </time>
  );
};
