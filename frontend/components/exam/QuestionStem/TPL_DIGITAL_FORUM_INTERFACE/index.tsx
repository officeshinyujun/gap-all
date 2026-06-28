import React from 'react';
import { VStack } from '@shared/ui/VStack';
import { StemBox } from '../_shared/StemBox';
import { StemLabel } from '../_shared/StemLabel';
import { ForumHeader } from './ForumHeader';
import { ForumPost } from './ForumPost';
import { ForumComment } from './ForumComment';
import type { TPL_DIGITAL_FORUM_INTERFACE } from '@/types/questionstem';
import s from './index.module.scss';

export interface TPLDigitalForumInterfaceProps {
  data: TPL_DIGITAL_FORUM_INTERFACE;
  /** 지시문 텍스트. 기본값: "다음 인터넷 게시판의 글을 읽고 물음에 답하시오." */
  label?: string;
}

/**
 * TPL_DIGITAL_FORUM_INTERFACE
 * 온라인 게시판 형식의 지문 컴포넌트.
 * 수능 영어의 인터넷 게시판 지문에 사용됩니다.
 * 포럼 헤더 → 원글 → 댓글 목록 순서로 렌더링됩니다.
 */
export const TPLDigitalForumInterface: React.FC<TPLDigitalForumInterfaceProps> = ({
  data,
  label,
}) => {
  return (
    <StemBox>
      <VStack gap={16} fullWidth>
        <StemLabel>{label}</StemLabel>
        <div className={s.forumWrapper}>
          <ForumHeader forumName={data.forum_name} />
          <ForumPost post={data.main_post} />
          {(data.comments || []).length > 0 && (
            <div className={s.commentsSection}>
              <div className={s.commentsHeader}>
                <span className={s.commentsCount}>
                  댓글 {data.comments.length}개
                </span>
              </div>
              <VStack gap={0} fullWidth>
                {data.comments.map((comment, index) => (
                  <ForumComment
                    key={index}
                    comment={comment}
                    index={index + 1}
                  />
                ))}
              </VStack>
            </div>
          )}
        </div>
      </VStack>
    </StemBox>
  );
};
