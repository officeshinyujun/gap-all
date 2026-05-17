import React from 'react';
import cs from 'classnames';
import { VStack } from '@/components/general/VStack';
import type { DocParagraphData } from '@/types/questionstem';
import s from './index.module.scss';

export interface DocParagraphProps {
  paragraph: DocParagraphData;
  className?: string;
}

/**
 * DocParagraph
 * 공문서의 단락 하나 (소제목 + 본문).
 * sub_title이 있으면 소제목을 강조 표시하고, content를 본문으로 렌더링합니다.
 */
export const DocParagraph: React.FC<DocParagraphProps> = ({
  paragraph,
  className,
}) => {
  return (
    <VStack gap={4} fullWidth className={cs(s.paragraph, className)}>
      {paragraph.sub_title && (
        <span className={s.subTitle}>{paragraph.sub_title}</span>
      )}
      <p className={s.content}>{paragraph.content}</p>
    </VStack>
  );
};
