import React from 'react';
import { VStack } from '@/components/general/VStack';
import { HStack } from '@/components/general/HStack';
import { StemBox } from '../_shared/StemBox';
import { StemLabel } from '../_shared/StemLabel';
import { WorkflowStep } from './WorkflowStep';
import { WorkflowArrow } from './WorkflowArrow';
import { WorkflowMissingStep } from './WorkflowMissingStep';
import type { TPL_SEQUENTIAL_WORKFLOW } from '@/types/questionstem';

export interface TPLSequentialWorkflowProps {
  data: TPL_SEQUENTIAL_WORKFLOW;
  /** 지시문 텍스트. 기본값: "다음 순서도를 보고 물음에 답하시오." */
  label?: string;
}

/**
 * TPL_SEQUENTIAL_WORKFLOW
 * 순서도/절차 흐름 형식의 지문 컴포넌트.
 * orientation에 따라 수평(→) 또는 수직(↓) 레이아웃으로 렌더링됩니다.
 * is_missing=true인 스텝은 빈칸 박스로 표시됩니다.
 */
export const TPLSequentialWorkflow: React.FC<TPLSequentialWorkflowProps> = ({
  data,
  label,
}) => {
  const isHorizontal = data.orientation === 'horizontal';

  const renderSteps = () => {
    const elements: React.ReactNode[] = [];

    data.steps.forEach((step, index) => {
      // 스텝 렌더링
      elements.push(
        step.is_missing ? (
          <WorkflowMissingStep key={`step-${step.idx}`} step={step} />
        ) : (
          <WorkflowStep key={`step-${step.idx}`} step={step} />
        ),
      );

      // 마지막 스텝이 아니면 화살표 추가
      if (index < data.steps.length - 1) {
        elements.push(
          <WorkflowArrow
            key={`arrow-${index}`}
            direction={isHorizontal ? 'horizontal' : 'vertical'}
          />,
        );
      }
    });

    return elements;
  };

  return (
    <StemBox>
      <VStack gap={16} fullWidth>
        <StemLabel>{label}</StemLabel>
        {isHorizontal ? (
          <HStack gap={0} align="center" wrap="wrap" fullWidth justify="center">
            {renderSteps()}
          </HStack>
        ) : (
          <VStack gap={0} align="center" fullWidth>
            {renderSteps()}
          </VStack>
        )}
      </VStack>
    </StemBox>
  );
};
