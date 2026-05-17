import React from 'react';
import cs from 'classnames';
import { HStack } from '@/components/general/HStack';
import s from './index.module.scss';

export interface ConvLineProps {
  /** 발화자 이름 */
  name: string;
  /** 발화 내용 */
  text: string;
  className?: string;
}

/**
 * ConvLine
 * 수능 대화문 지문 스타일의 한 줄 발화.
 * "발화자: 내용" 형식으로 렌더링됩니다.
 * 내용이 길면 발화자 이름 너비만큼 들여쓰기됩니다.
 */
export const ConvLine: React.FC<ConvLineProps> = ({ name, text, className }) => {
  return (
    <div className={cs(s.line, className)}>
      <span className={s.name}>{name}</span>
      <span className={s.colon}>: </span>
      <span className={s.text}>{text}</span>
    </div>
  );
};
