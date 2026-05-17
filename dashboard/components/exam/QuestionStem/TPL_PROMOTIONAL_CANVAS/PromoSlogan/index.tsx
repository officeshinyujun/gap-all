import React from 'react';
import cs from 'classnames';
import s from './index.module.scss';

export interface PromoSloganProps {
  text: string;
  className?: string;
}

/**
 * PromoSlogan
 * 광고/홍보물의 메인 슬로건 텍스트.
 * 수능 영어 광고문 지문의 핵심 문구를 강조 표시합니다.
 */
export const PromoSlogan: React.FC<PromoSloganProps> = ({ text, className }) => {
  return (
    <div className={cs(s.sloganWrapper, className)}>
      <p className={s.slogan}>{text}</p>
    </div>
  );
};
