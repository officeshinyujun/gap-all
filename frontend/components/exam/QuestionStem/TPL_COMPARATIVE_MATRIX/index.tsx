import React from 'react';
import { VStack } from '@shared/ui/VStack';
import { HStack } from '@shared/ui/HStack';
import { StemBox } from '../_shared/StemBox';
import { StemLabel } from '../_shared/StemLabel';
import { SelectionChip } from '../_shared/SelectionChip';
import { MatrixTable } from './MatrixTable';
import type { TPL_COMPARATIVE_MATRIX } from '@/types/questionstem';
import s from './index.module.scss';

export interface TPLComparativeMatrixProps {
  data: TPL_COMPARATIVE_MATRIX;
  /** 지시문 텍스트. 기본값: "다음 표를 보고 물음에 답하시오." */
  label?: string;
}

/**
 * TPL_COMPARATIVE_MATRIX
 * 비교 행렬 표 + 하단 선택지 칩 조합 지문 컴포넌트.
 * 수능에서 "다음 표를 보고 물음에 답하시오." 형식의 지문에 사용됩니다.
 */
export const TPLComparativeMatrix: React.FC<TPLComparativeMatrixProps> = ({
  data,
  label,
}) => {
  return (
    <StemBox>
      <VStack gap={16} fullWidth>
        <StemLabel>{label}</StemLabel>
        <MatrixTable headers={data.headers} rows={data.rows} />
        {data.selection_chips.length > 0 && (
          <VStack gap={8} fullWidth>
            <div className={s.chipsLabel}>선택지</div>
            <HStack gap={8} wrap="wrap">
              {data.selection_chips.map((chip, index) => (
                <div key={index} className={s.chipItem}>
                  <SelectionChip number={(index + 1) as 1 | 2 | 3 | 4 | 5} />
                  <span className={s.chipText}>{chip}</span>
                </div>
              ))}
            </HStack>
          </VStack>
        )}
      </VStack>
    </StemBox>
  );
};
