'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router';
import Typo from '@shared/ui/Typo';
import { VStack } from '@shared/ui/VStack';
import { HStack } from '@shared/ui/HStack';
import { Settings, ArrowUp, Menu, ChevronLeft } from 'lucide-react';
import { SPACING } from '@shared/constants/spacing';
import { API_BASE_URL } from '@shared/lib/auth';
import { fetchChatSessions } from '@shared/lib/chatApi';
import type { ChatSession } from '@shared/types/chat';
import { getClientCache } from '@/lib/clientCache';
import { CreateChatModal } from '@/components/chat/CreateChatModal';
import { ChatWindow } from '@/components/chat/ChatWindow';
import { SessionDrawer } from '@/components/chat/ChatWindow/SessionDrawer';
import s from './page.module.scss';

export default function ChatPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<ChatSession[]>(
    () => getClientCache<ChatSession[]>('chat:sessions') ?? [],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTitle, setSelectedTitle] = useState<string>('');
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(() => !getClientCache('chat:sessions'));
  const [showSessionDrawer, setShowSessionDrawer] = useState(false);
  const [isDrawerClosing, setIsDrawerClosing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const closeDrawer = () => {
    setIsDrawerClosing(true);
    setTimeout(() => {
      setShowSessionDrawer(false);
      setIsDrawerClosing(false);
    }, 240);
  };

  const loadSessions = async () => {
    try {
      const list = await fetchChatSessions();
      setSessions(list);
      if (selectedId) {
        const current = list.find((s) => s.id === selectedId);
        if (current) setSelectedTitle(current.title);
      }
    } catch { /* keep existing */ }
    setLoading(false);
  };

  useEffect(() => { loadSessions(); }, []);

  useEffect(() => {
    const sessionId = searchParams.get('session');
    const isNew = searchParams.get('new');
    if (sessionId) {
      setSelectedId(sessionId);
      setModalOpen(false);
      const found = sessions.find((s) => s.id === sessionId);
      if (found) setSelectedTitle(found.title);
    } else if (isNew) {
      setModalOpen(true);
    } else {
      setSelectedId(null);
    }
  }, [searchParams]);

  const handleCreated = (session: { id: string; title: string }) => {
    setSelectedId(session.id);
    setSelectedTitle(session.title);
    loadSessions();
  };

  const handleDelete = async (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    await fetch(`${API_BASE_URL}/chat/sessions/${sessionId}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));
    if (selectedId === sessionId) setSelectedId(null);
  };

  // ── 세션 미선택 — 홈 화면 ──
  if (!selectedId) {
    return (
      <div className={s.homeContainer}>
        {isMobile && (
          <button className={s.hamburgerBtn} onClick={() => setShowSessionDrawer(true)}>
            <Menu size={24} />
          </button>
        )}
        <div className={s.homeContent}>
          <VStack gap={SPACING.s12} align="start" fullWidth>
            <Typo.SM size={24} color="primary" className={s.heroTitle}>AI 튜터</Typo.SM>
            <Typo.MD size={16} color="secondary" className={s.heroSubtitle}>
              과목과 단원 범위를 설정하고 궁금한 것을 무엇이든 물어보세요!
            </Typo.MD>
          </VStack>
          <div className={s.inputCard}>
            <div className={s.settingsRow}>
              <Typo.MD size={12} color="secondary" className={s.settingHint}>
                새 채팅을 시작하려면 설정 버튼을 누르세요
              </Typo.MD>
            </div>
            <div className={s.inputRow}>
              <button className={s.iconBtn} onClick={() => setModalOpen(true)}>
                <Settings size={20} />
              </button>
              <div className={s.inputPlaceholder} onClick={() => setModalOpen(true)}>
                <Typo.MD size={14} color="secondary">궁금한 점을 물어보세요...</Typo.MD>
              </div>
              <button className={`${s.iconBtn} ${s.sendBtn}`} onClick={() => setModalOpen(true)}>
                <ArrowUp size={20} color="#FFFFFF" strokeWidth={3} />
              </button>
            </div>
          </div>
        </div>

        {isMobile && showSessionDrawer && (
          <SessionDrawer
            sessions={sessions}
            selectedId={selectedId}
            isClosing={isDrawerClosing}
            onClose={closeDrawer}
            onSelect={(session) => {
              navigate(`/chat?session=${session.id}`);
              setSelectedTitle(session.title);
              closeDrawer();
            }}
            onNewChat={() => navigate('/chat')}
          />
        )}

        <CreateChatModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onCreated={handleCreated} />
      </div>
    );
  }

  // ── 세션 선택 — 채팅 화면 ──
  const selectedSession = sessions.find((s) => s.id === selectedId);

  return (
    <>
      {isMobile && (
        <HStack className={s.mobileNav} gap={SPACING.s8}>
          <button className={s.mobileNavBtn} onClick={() => setShowSessionDrawer(true)}>
            <Menu size={22} />
          </button>
          <button className={s.mobileNavBtn} onClick={() => navigate('/chat')}>
            <ChevronLeft size={22} />
          </button>
        </HStack>
      )}

      <div className={s.chatContainer}>

      <div className={s.chatWindowWrapper}>
        <ChatWindow key={selectedId} sessionId={selectedId!} sessionTitle={selectedTitle} />
      </div>

      {isMobile && showSessionDrawer && (
        <SessionDrawer
          sessions={sessions}
          selectedId={selectedId}
          isClosing={isDrawerClosing}
          onClose={closeDrawer}
          onSelect={(session) => {
            navigate(`/chat?session=${session.id}`);
            setSelectedTitle(session.title);
            closeDrawer();
          }}
          onNewChat={() => setModalOpen(true)}
        />
      )}

      <CreateChatModal isOpen={modalOpen} onClose={() => setModalOpen(false)} onCreated={handleCreated} />
    </div>
    </>
  );
}
