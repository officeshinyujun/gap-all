import React from 'react';
import cs from 'classnames';
import { VStack } from '@shared/ui/VStack';
import { HStack } from '@shared/ui/HStack';
import type { ForumMainPost } from '@/types/questionstem';
import s from './index.module.scss';

export interface ForumPostProps {
  post: ForumMainPost;
  className?: string;
}

/**
 * ForumPost
 * 게시판 원글(메인 포스트).
 * 작성자, 제목, 본문을 수능 영어 온라인 게시판 지문 스타일로 렌더링합니다.
 */
export const ForumPost: React.FC<ForumPostProps> = ({ post, className }) => {
  return (
    <VStack gap={0} fullWidth className={cs(s.post, className)}>
      <div className={s.titleBar}>
        <h3 className={s.title}>{post.title}</h3>
      </div>
      <HStack gap={8} align="center" className={s.meta}>
        <span className={s.authorIcon}>👤</span>
        <span className={s.author}>{post.author}</span>
        <span className={s.metaDivider}>·</span>
        <span className={s.postLabel}>원글</span>
      </HStack>
      <div className={s.body}>
        <p className={s.content}>{post.content}</p>
      </div>
    </VStack>
  );
};
