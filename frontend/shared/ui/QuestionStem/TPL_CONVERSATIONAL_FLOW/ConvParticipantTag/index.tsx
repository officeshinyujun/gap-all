import React from 'react';
import cs from 'classnames';
import s from './index.module.scss';

export interface ConvParticipantTagProps {
  name: string;
  role: string;
  colorIndex: number;
  className?: string;
}

/**
 * ConvParticipantTag
 * 대화 참여자 이름 + 역할 표시.
 * 수능 스타일에 맞게 단순 텍스트 레이블로 렌더링됩니다.
 */
export const ConvParticipantTag: React.FC<ConvParticipantTagProps> = ({
  name,
  role,
  className,
}) => {
  return (
    <span className={cs(s.tag, className)}>
      {name}{role ? ` (${role})` : ''}
    </span>
  );
};
