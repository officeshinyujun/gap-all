import React from 'react';
import type {
  ConvParticipant,
  ConversationActionKey,
  ConversationVisualAid,
} from '@/types/questionstem';
import { MaterialIcon } from '../_shared/MaterialIcon';
import s from './ActorFlow.module.scss';

const ACTION_LABELS: Record<ConversationActionKey, string> = {
  request: '요청',
  inform: '알림',
  consult: '상담',
  approve: '승인',
  reject: '거절',
  provide: '제공',
  report: '보고',
  notify: '통지',
  pay: '지급',
  regulate: '규제',
};

export interface ActorFlowProps {
  participants: ConvParticipant[];
  visualAid: ConversationVisualAid;
}

export function ActorFlow({ participants, visualAid }: ActorFlowProps) {
  if (visualAid.kind !== 'actor_flow') return null;

  const participantMap = new Map(participants.map((participant) => [participant.id, participant]));
  const actors = visualAid.actor_ids
    .map((id) => participantMap.get(id))
    .filter((participant): participant is ConvParticipant => participant !== undefined);

  if (actors.length < 2 || visualAid.relations.length === 0) return null;

  return (
    <section aria-label="등장인물 간 상호 작용" className={s.wrapper}>
      <div className={s.title}>등장인물 간 상호 작용</div>
      <div className={s.actors}>
        {actors.map((actor) => (
          <div className={s.actor} key={actor.id}>
            <MaterialIcon
              className={s.icon}
              iconKey={actor.icon_key}
              label={`${actor.name} 역할 아이콘`}
            />
            <div>
              <div className={s.actorName}>{actor.name}</div>
              <div className={s.actorRole}>{actor.role}</div>
            </div>
          </div>
        ))}
      </div>
      <div className={s.relations}>
        {visualAid.relations.map((relation, index) => {
          const from = participantMap.get(relation.from_id);
          const to = participantMap.get(relation.to_id);
          if (!from || !to) return null;
          return (
            <div className={s.relation} key={`${relation.from_id}-${relation.to_id}-${index}`}>
              <span>{from.name}</span>
              <span aria-hidden="true" className={s.arrow}>→</span>
              <span className={s.action}>{ACTION_LABELS[relation.action_key]}</span>
              <span aria-hidden="true" className={s.arrow}>→</span>
              <span>{to.name}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
