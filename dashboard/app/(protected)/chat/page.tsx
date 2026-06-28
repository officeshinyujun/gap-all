'use client';

import { useState, useEffect } from 'react';
import { VStack } from '@/components/general/VStack';
import { HStack } from '@/components/general/HStack';
import Typo from '@/components/general/Typo';
import { SPACING } from '@/constants/spacing';
import { CreateChatModal } from '@/components/chat/CreateChatModal';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { apiFetch } from '@/lib/api';
import { Plus, MessageSquare, Trash2 } from 'lucide-react';
import s from './page.module.scss';

interface ChatSession {
  id: string;
  title: string;
  startUnit: number | null;
  endUnit: number | null;
  createdAt: string;
  subject: { title: string } | null;
}

export default function ChatPage() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchSessions = async () => {
    try {
      const data = await apiFetch<ChatSession[] | { sessions: ChatSession[] }>('/chat/sessions');
      setSessions(Array.isArray(data) ? data : data.sessions ?? []);
    } catch {} finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleCreated = (session: { id: string; title: string }) => {
    fetchSessions();
    setSelectedId(session.id);
  };

  const handleDelete = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    await apiFetch(`/chat/sessions/${sessionId}`, { method: 'DELETE' });
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    if (selectedId === sessionId) setSelectedId(null);
  };

  const selectedSession = sessions.find((s) => s.id === selectedId);

  return (
    <HStack fullWidth fullHeight className={s.container}>
      {/* 사이드 패널 — 세션 목록 */}
      <VStack className={s.sidebar} fullHeight>
        <HStack align="center" justify="between" className={s.sidebarHeader} fullWidth>
          <Typo.SM size={16} color="primary">채팅 테스트</Typo.SM>
          <button className={s.newButton} onClick={() => setModalOpen(true)}>
            <Plus size={16} color="#FFFFFF" />
          </button>
        </HStack>

        <div className={s.sessionList}>
          {loading ? (
            <div className={s.empty}>
              <Typo.MD size={12} color="secondary">불러오는 중...</Typo.MD>
            </div>
          ) : sessions.length === 0 ? (
            <div className={s.empty}>
              <Typo.MD size={12} color="secondary">세션이 없습니다.</Typo.MD>
              <Typo.MD size={12} color="secondary">+ 버튼으로 새 채팅을 시작하세요.</Typo.MD>
            </div>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                className={`${s.sessionItem} ${selectedId === session.id ? s.active : ''}`}
                onClick={() => setSelectedId(session.id)}
              >
                <HStack align="center" justify="between" fullWidth gap={SPACING.s8}>
                  <HStack align="center" gap={SPACING.s8} style={{ flex: 1, minWidth: 0 }}>
                    <MessageSquare size={14} color={selectedId === session.id ? '#3E78F7' : '#5C6370'} />
                    <VStack gap={SPACING.s4} style={{ flex: 1, minWidth: 0 }}>
                      <Typo.MD size={12} color={selectedId === session.id ? 'primary' : 'primary'} style={{ fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {session.title}
                      </Typo.MD>
                      <Typo.MD size={10} color="secondary">
                        {session.subject?.title ?? ''}{session.startUnit ? ` · ${session.startUnit}~${session.endUnit}단원` : ''}
                      </Typo.MD>
                    </VStack>
                  </HStack>
                  <button
                    className={s.deleteButton}
                    onClick={(e) => handleDelete(e, session.id)}
                  >
                    <Trash2 size={13} color="#5C6370" />
                  </button>
                </HStack>
              </div>
            ))
          )}
        </div>
      </VStack>

      {/* 채팅창 */}
      <div className={s.chatArea}>
        {selectedSession ? (
          <ChatWindow sessionId={selectedSession.id} sessionTitle={selectedSession.title} />
        ) : (
          <div className={s.emptyChat}>
            <VStack gap={SPACING.s12} align="center">
              <MessageSquare size={40} color="#D9DCE2" />
              <Typo.MD size={14} color="secondary">세션을 선택하거나 새 채팅을 시작하세요.</Typo.MD>
              <button className={s.startButton} onClick={() => setModalOpen(true)}>
                <Plus size={14} color="#FFFFFF" />
                새 채팅 시작
              </button>
            </VStack>
          </div>
        )}
      </div>

      <CreateChatModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={handleCreated}
      />
    </HStack>
  );
}
