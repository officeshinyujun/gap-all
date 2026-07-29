import React from 'react';
import cs from 'classnames';
import { HStack } from '@shared/ui/HStack';
import type { CaseCheckItemData } from '@/types/questionstem';
import s from './index.module.scss';

export interface CaseCheckItemProps {
  item: CaseCheckItemData;
  className?: string;
}

/**
 * CaseCheckItem
 * 사례 진단 체크리스트의 개별 항목.
 * id(A/B/C/D)를 레이블로 표시합니다.
 */
export const CaseCheckItem: React.FC<CaseCheckItemProps> = ({
  item,
  className,
}) => {
  return (
    <HStack gap={8} align="center" className={cs(s.item, className)}>
      <span className={s.id}>{item.id}</span>
      <span className={s.label}>{item.label}</span>
    </HStack>
  );
};
