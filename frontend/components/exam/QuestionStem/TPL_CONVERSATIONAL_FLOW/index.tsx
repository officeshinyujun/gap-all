import React, { useMemo } from 'react';
import { VStack } from '@/components/general/VStack';
import { StemBox } from '../_shared/StemBox';
import { StemLabel } from '../_shared/StemLabel';
import { ConvLine } from './ConvLine';
import type { TPL_CONVERSATIONAL_FLOW } from '@/types/questionstem';
import s from './index.module.scss';

export interface TPLConversationalFlowProps {
  data: TPL_CONVERSATIONAL_FLOW;
  /** 지시문 텍스트. 기본값: "다음 대화를 읽고 물음에 답하시오." */
  label?: string;
}

/**
 * TPL_CONVERSATIONAL_FLOW
 * 수능 대화문 형식의 지문 컴포넌트.
 * "발화자: 내용" 텍스트 나열 형식으로 렌더링됩니다.
 */
export const TPLConversationalFlow: React.FC<TPLConversationalFlowProps> = ({
  data,
  label,
}) => {
  const participantMap = useMemo(() => {
    const map = new Map<string, { name: string; role: string }>();
    data.participants.forEach((p) => map.set(p.id, { name: p.name, role: p.role }));
    return map;
  }, [data.participants]);

  return (
    <StemBox>
      <VStack gap={16} fullWidth>
        <StemLabel>{label}</StemLabel>

        {/* 대화 내용 */}
        <div className={s.dialogBox}>
          <VStack gap={0} fullWidth>
            {data.messages.map((msg, index) => {
              const participant = participantMap.get(msg.p_id);
              return (
                <ConvLine
                  key={index}
                  name={participant?.name ?? msg.p_id}
                  text={msg.text}
                />
              );
            })}
          </VStack>
        </div>
      </VStack>
    </StemBox>
  );
};
