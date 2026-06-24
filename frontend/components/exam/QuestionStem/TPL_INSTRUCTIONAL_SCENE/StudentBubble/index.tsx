import React from 'react';
import cs from 'classnames';
import { HStack } from '@shared/ui/HStack';
import { VStack } from '@shared/ui/VStack';
import s from './index.module.scss';

export interface StudentBubbleProps {
  text: string;
  id: string;
  colorIndex: number;
  className?: string;
}

/**
 * StudentBubble
 * 수업 장면에서 학생의 말풍선.
 * 흑백 사각형 아바타 + 우측 말풍선 형태로 렌더링됩니다.
 */
export const StudentBubble: React.FC<StudentBubbleProps> = ({
  text,
  id,
  className,
}) => {
  return (
    <HStack gap={10} align="start" justify="end" className={cs(s.wrapper, className)}>
      <div className={s.bubble}>
        <span className={s.tail} />
        <p className={s.text}>{text}</p>
      </div>
      <VStack gap={4} align="center" className={s.avatarCol}>
        <div className={s.avatar}>
          <span className={s.avatarInitial}>{id.charAt(0)}</span>
        </div>
        <span className={s.label}>{id}</span>
      </VStack>
    </HStack>
  );
};
