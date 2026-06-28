import React from 'react';
import cs from 'classnames';
import { VStack } from '@/components/general/VStack';
import type { WorkflowStepData } from '@/types/questionstem';
import s from './index.module.scss';

export interface WorkflowStepProps {
  step: WorkflowStepData;
  className?: string;
}

export const WorkflowStep: React.FC<WorkflowStepProps> = ({ step, className }) => {
  return (
    <VStack gap={4} align="center" className={cs(s.step, className)}>
      <span className={s.idx}>{step.idx}</span>
      <span className={s.label}>{step.label}</span>
      {step.desc && <span className={s.desc}>{step.desc}</span>}
    </VStack>
  );
};
