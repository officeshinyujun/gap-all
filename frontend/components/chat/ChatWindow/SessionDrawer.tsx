import { HStack } from '@shared/ui/HStack';
import { VStack } from '@shared/ui/VStack';
import Typo from '@shared/ui/Typo';
import { X, Plus } from 'lucide-react';
import { SPACING } from '@shared/constants/spacing';
import type { ChatSession } from '@shared/types/chat';
import s from './SessionDrawer.module.scss';

interface Props {
  sessions: ChatSession[];
  selectedId: string | null;
  isClosing: boolean;
  onClose: () => void;
  onSelect: (session: ChatSession) => void;
  onNewChat?: () => void;
}

export function SessionDrawer({ sessions, selectedId, isClosing, onClose, onSelect, onNewChat }: Props) {
  return (
    <div className={`${s.overlay} ${isClosing ? s.closing : ''}`} onClick={onClose}>
      <div className={`${s.panel} ${isClosing ? s.closing : ''}`} onClick={(e) => e.stopPropagation()}>
        <HStack justify="between" align="center" fullWidth className={s.drawerHeader}>
          <Typo.SM size={16} color="primary">최근 채팅</Typo.SM>
          <button className={s.closeBtn} onClick={onClose}>
            <X size={20} />
          </button>
        </HStack>

        {onNewChat && (
          <button className={s.newChatBtn} onClick={() => { onNewChat(); onClose(); }}>
            <Plus size={18} />
            <Typo.MD size={14} color="primary">새 채팅 생성</Typo.MD>
          </button>
        )}

        <VStack gap={SPACING.s8} fullWidth>
          {sessions.length === 0 ? (
            <Typo.MD size={14} color="secondary">채팅 기록이 없습니다.</Typo.MD>
          ) : (
            sessions.map((session) => (
              <HStack
                key={session.id}
                className={`${s.item} ${session.id === selectedId ? s.active : ''}`}
                align="center"
                fullWidth
                onClick={() => onSelect(session)}
              >
                <VStack gap={SPACING.s4}>
                  <Typo.MD size={14} color="primary">{session.title}</Typo.MD>
                  <Typo.MD size={12} color="secondary">{session.subject?.title ?? ''}</Typo.MD>
                </VStack>
              </HStack>
            ))
          )}
        </VStack>
      </div>
    </div>
  );
}
