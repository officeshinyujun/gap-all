import React from 'react';
import cs from 'classnames';
import { HStack } from '@shared/ui/HStack';
import { VStack } from '@shared/ui/VStack';
import s from './index.module.scss';

export interface InstructorBubbleProps {
  text?: string | null;
  id?: string | null;
  avatar?: string | null;
  className?: string;
}

/**
 * InstructorBubble
 * 수업 장면에서 강사(선생님)의 말풍선.
 * 흑백 사각형 아바타 + 말풍선 형태로 렌더링됩니다.
 */
export const InstructorBubble: React.FC<InstructorBubbleProps> = ({
  text,
  id,
  avatar,
  className,
}) => {
  return (
    <HStack gap={10} align="start" className={cs(s.wrapper, className)}>
      <VStack gap={4} align="center" className={s.avatarCol}>
        <div className={s.avatar}>
          {avatar
            ? <img src={avatar} alt={id ?? ''} className={s.avatarImg} />
            : <span className={s.avatarInitial}>{id?.charAt(0) ?? '?'}</span>}
        </div>
        <span className={s.label}>{id ?? ''}</span>
      </VStack>
      <div className={s.bubble}>
        <span className={s.tail} />
        <p className={s.text}>{text ?? ''}</p>
      </div>
    </HStack>
  );
};
