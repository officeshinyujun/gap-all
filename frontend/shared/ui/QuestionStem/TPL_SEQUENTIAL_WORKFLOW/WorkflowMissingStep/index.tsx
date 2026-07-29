import React from 'react';
import cs from 'classnames';
import { VStack } from '@shared/ui/VStack';
import { BlankSlot } from '../../_shared/BlankSlot';
import type { WorkflowStepData } from '@/types/questionstem';
import s from './index.module.scss';

export interface WorkflowMissingStepProps {
  step: WorkflowStepData;
  className?: string;
}

/**
 * WorkflowMissingStep
 * 순서도에서 is_missing=true인 빈칸 스텝.
 * 수능 순서 배열 문제에서 답을 채워야 하는 빈 박스로 표시됩니다.
 */
export const WorkflowMissingStep: React.FC<WorkflowMissingStepProps> = ({
  step,
  className,
}) => {
  return (
    <VStack gap={4} align="center" className={cs(s.missingStep, className)}>
      <span className={s.idx}>{step.idx}</span>
      <BlankSlot label="?" width={48} />
      {step.label && <span className={s.hint}>{step.label}</span>}
    </VStack>
  );
};
