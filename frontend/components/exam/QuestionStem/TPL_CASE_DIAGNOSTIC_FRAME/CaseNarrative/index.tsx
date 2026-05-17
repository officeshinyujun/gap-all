import React from 'react';
import cs from 'classnames';
import s from './index.module.scss';

export interface CaseNarrativeProps {
  text: string;
  className?: string;
}

/**
 * CaseNarrative
 * 사례 분석의 서술 텍스트 영역.
 * 사례에 대한 상황 설명이나 배경 서술을 담습니다.
 */
export const CaseNarrative: React.FC<CaseNarrativeProps> = ({
  text,
  className,
}) => {
  return (
    <div className={cs(s.narrative, className)}>
      <p className={s.text}>{text}</p>
    </div>
  );
};
