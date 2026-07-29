import React, { useMemo } from 'react';
import { VStack } from '@shared/ui/VStack';
import { StemBox } from '../_shared/StemBox';
import { StemLabel } from '../_shared/StemLabel';
import { ConvLine } from './ConvLine';
import { ActorFlow } from './ActorFlow';
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
    const map = new Map<string, {
      name: string;
      role: string;
      icon_key: typeof data.participants[number]['icon_key'];
    }>();
    (data.participants || []).forEach((p) =>
      map.set(p.id, { name: p.name, role: p.role, icon_key: p.icon_key }),
    );
    return map;
  }, [data.participants]);

  const messages = data.messages || [];
  const sceneLabels = {
    dialogue: '대화 장면',
    interview: '인터뷰 장면',
    school: '학교 장면',
    office: '사무실 장면',
    public_service: '공공기관 장면',
    hospital: '의료기관 장면',
    shop: '상점 장면',
    court: '법원 장면',
  };
  const sceneLabel = data.scene_kind && data.scene_kind !== 'none'
    ? sceneLabels[data.scene_kind]
    : undefined;

  return (
    <StemBox>
      <VStack gap={16} fullWidth>
        <StemLabel>{label}</StemLabel>

        {sceneLabel ? <div className={s.sceneLabel}>{sceneLabel}</div> : null}

        {data.visual_aid ? (
          <ActorFlow participants={data.participants ?? []} visualAid={data.visual_aid} />
        ) : null}

        {/* 대화 내용 */}
        <div className={s.dialogBox}>
          <VStack gap={0} fullWidth>
            {messages.map((msg, index) => {
              const participant = participantMap.get(msg.p_id);
              return (
                <ConvLine
                  key={index}
                  iconKey={participant?.icon_key}
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
