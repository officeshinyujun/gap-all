import React from 'react';
import cs from 'classnames';
import { VStack } from '@shared/ui/VStack';
import { HStack } from '@shared/ui/HStack';
import type { ForumCommentData } from '@/types/questionstem';
import s from './index.module.scss';

export interface ForumCommentProps {
  comment: ForumCommentData;
  /** 댓글 인덱스 (1부터 시작) */
  index: number;
  className?: string;
}

/**
 * ForumComment
 * 게시판 댓글 항목.
 * 작성자와 댓글 내용을 수능 영어 온라인 게시판 지문 스타일로 렌더링합니다.
 */
export const ForumComment: React.FC<ForumCommentProps> = ({
  comment,
  index,
  className,
}) => {
  return (
    <VStack gap={4} fullWidth className={cs(s.comment, className)}>
      <HStack gap={8} align="center">
        <span className={s.commentIndex}>└ {index}</span>
        <span className={s.authorIcon}>👤</span>
        <span className={s.author}>{comment.author}</span>
      </HStack>
      <p className={s.text}>{comment.content ?? comment.text}</p>
    </VStack>
  );
};
