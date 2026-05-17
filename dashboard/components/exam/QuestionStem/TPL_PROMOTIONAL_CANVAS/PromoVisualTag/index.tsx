import React from 'react';
import cs from 'classnames';
import s from './index.module.scss';

export interface PromoVisualTagProps {
  /** 시각 요소 설명 텍스트 (예: "로고 이미지", "제품 사진") */
  label: string;
  className?: string;
}

/**
 * PromoVisualTag
 * 광고/홍보물의 시각 요소 플레이스홀더 태그.
 * 실제 이미지 대신 시각 요소의 존재를 텍스트로 표시합니다.
 * 수능 영어 광고문 지문에서 "[사진]", "[로고]" 등의 표기에 해당합니다.
 */
export const PromoVisualTag: React.FC<PromoVisualTagProps> = ({
  label,
  className,
}) => {
  return (
    <div className={cs(s.tag, className)} aria-label={label}>
      <span className={s.bracket}>[</span>
      <span className={s.label}>{label}</span>
      <span className={s.bracket}>]</span>
    </div>
  );
};
