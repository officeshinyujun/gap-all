import React from 'react';
import cs from 'classnames';
import { HStack } from '@shared/ui/HStack';
import { BlankSlot } from '../../_shared/BlankSlot';
import s from './index.module.scss';

export interface PromoMissingPartProps {
  /** 빈칸 설명 힌트 텍스트 (예: "행사 날짜", "할인율") */
  hint?: string;
  className?: string;
}

/**
 * PromoMissingPart
 * 광고/홍보물에서 답을 채워야 하는 빈칸 강조 박스.
 * 수능 영어 광고문 지문의 "윗글에서 언급되지 않은 것" 또는 빈칸 문제에 사용됩니다.
 */
export const PromoMissingPart: React.FC<PromoMissingPartProps> = ({
  hint,
  className,
}) => {
  return (
    <div className={cs(s.missingBox, className)}>
      <HStack gap={8} align="center" justify="center">
        <span className={s.questionMark}>?</span>
        <BlankSlot label={hint ?? ''} width={hint ? hint.length * 10 + 40 : 80} />
      </HStack>
    </div>
  );
};
