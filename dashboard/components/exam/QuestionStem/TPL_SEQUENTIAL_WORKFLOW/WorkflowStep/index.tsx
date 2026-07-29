import React from 'react';
import cs from 'classnames';
import { VStack } from '@/components/general/VStack';
import type { WorkflowStepData } from '@/types/questionstem';
import s from './index.module.scss';

export interface WorkflowStepProps {
  step: WorkflowStepData;
  className?: string;
}

/**
 * WorkflowStep
 * 순서도의 일반 스텝 박스.
 * idx(순서 번호), label(제목), desc(설명)을 수능 절차 지문 스타일로 렌더링합니다.
 */
export const WorkflowStep: React.FC<WorkflowStepProps> = ({ step, className }) => {
  const displayLabel = step.label.trim() || String(step.idx);
  return (
    <VStack gap={4} align="center" className={cs(s.step, className)}>
      <span className={s.label}>{displayLabel}</span>
      {step.desc ? <span className={s.desc}>{step.desc}</span> : null}
    </VStack>
  );
};
