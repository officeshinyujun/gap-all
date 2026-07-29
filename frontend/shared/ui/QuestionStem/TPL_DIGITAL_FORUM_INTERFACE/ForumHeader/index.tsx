import React from 'react';
import cs from 'classnames';
import { HStack } from '@shared/ui/HStack';
import s from './index.module.scss';

export interface ForumHeaderProps {
  forumName: string;
  className?: string;
}

/**
 * ForumHeader
 * 수능 영어 온라인 게시판 지문 스타일의 브라우저 창 타이틀바.
 * 흑백 창 UI (□□× 버튼 + 사이트명) 형태로 렌더링됩니다.
 */
export const ForumHeader: React.FC<ForumHeaderProps> = ({
  forumName,
  className,
}) => {
  return (
    <div className={cs(s.titleBar, className)}>
      <HStack gap={0} align="center" justify="between" fullWidth>
        <span className={s.forumName}>{forumName}</span>
        <HStack gap={4} align="center">
          <span className={s.winBtn}>─</span>
          <span className={s.winBtn}>□</span>
          <span className={s.winBtn}>×</span>
        </HStack>
      </HStack>
    </div>
  );
};
