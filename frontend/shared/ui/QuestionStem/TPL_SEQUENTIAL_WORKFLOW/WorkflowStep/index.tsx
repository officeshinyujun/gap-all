import React from 'react';
import cs from 'classnames';
import { VStack } from '@shared/ui/VStack';
import type { WorkflowStepData } from '@/types/questionstem';
import s from './index.module.scss';

export interface WorkflowStepProps {
  step: WorkflowStepData;
  className?: string;
}

export const WorkflowStep: React.FC<WorkflowStepProps> = ({ step, className }) => {
  const displayLabel = step.label.trim() || String(step.idx);
  return (
    <VStack gap={4} align="center" className={cs(s.step, className)}>
      <span className={s.label}>{displayLabel}</span>
      {step.desc && <span className={s.desc}>{step.desc}</span>}
    </VStack>
  );
};
