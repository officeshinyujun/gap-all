import React from 'react';
import { VStack } from '@shared/ui/VStack';
import { HStack } from '@shared/ui/HStack';
import { StemBox } from '../_shared/StemBox';
import { StemLabel } from '../_shared/StemLabel';
import { PromoSlogan } from './PromoSlogan';
import { PromoBullet } from './PromoBullet';
import { PromoVisualTag } from './PromoVisualTag';
import { PromoMissingPart } from './PromoMissingPart';
import type { TPL_PROMOTIONAL_CANVAS } from '@/types/questionstem';
import s from './index.module.scss';

export interface TPLPromotionalCanvasProps {
  data: TPL_PROMOTIONAL_CANVAS;
  /** 지시문 텍스트. 기본값: "다음 광고를 읽고 물음에 답하시오." */
  label?: string;
}

/**
 * TPL_PROMOTIONAL_CANVAS
 * 광고/홍보물 형식의 지문 컴포넌트.
 * 수능 영어의 광고문, 안내문, 홍보 포스터 지문에 사용됩니다.
 * 슬로건 → 시각 요소 → 불릿 목록 → 빈칸 순서로 렌더링됩니다.
 */
export const TPLPromotionalCanvas: React.FC<TPLPromotionalCanvasProps> = ({
  data,
  label,
}) => {
  return (
    <StemBox variant="bordered">
      <VStack gap={16} fullWidth>
        <StemLabel>{label}</StemLabel>

        <PromoSlogan text={data.slogan} />

        {data.bullets.length > 0 && (
          <div className={s.bulletSection}>
            <VStack gap={4} fullWidth>
              {data.bullets.map((bullet, index) => (
                <PromoBullet key={index} text={bullet} index={index} />
              ))}
            </VStack>
          </div>
        )}

        {data.missing_part && (
          <PromoMissingPart hint={data.missing_part} />
        )}
      </VStack>
    </StemBox>
  );
};
