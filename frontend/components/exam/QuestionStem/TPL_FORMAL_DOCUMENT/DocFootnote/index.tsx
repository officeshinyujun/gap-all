import React from 'react';
import cs from 'classnames';
import s from './index.module.scss';

export interface DocFootnoteProps {
  /** 각주 텍스트 */
  text: string;
  /** 각주 번호 (1부터 시작) */
  index: number;
  className?: string;
}

/**
 * DocFootnote
 * 공문서 하단 각주 항목.
 * "※" 또는 번호 기호와 함께 보충 설명을 표시합니다.
 */
export const DocFootnote: React.FC<DocFootnoteProps> = ({
  text,
  index,
  className,
}) => {
  return (
    <p className={cs(s.footnote, className)}>
      <span className={s.marker}>※{index > 1 ? index : ''}</span>
      <span className={s.text}>{text}</span>
    </p>
  );
};
