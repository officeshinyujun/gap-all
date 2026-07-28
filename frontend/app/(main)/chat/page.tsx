'use client';

import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router';
import Typo from '@shared/ui/Typo';
import { VStack } from '@shared/ui/VStack';
import { HStack } from '@shared/ui/HStack';
import { Settings, ArrowUp, Menu, X } from 'lucide-react';
import { SPACING } from '@shared/constants/spacing';
import { API_BASE_URL } from '@shared/lib/auth';
import { CreateChatModal } from '@/components/chat/CreateChatModal';
import { ChatWindow } from '@/components/chat/ChatWindow';
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
  const [searchParams] = useSearchParams();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTitle, setSelectedTitle] = useState<string>('');
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showSessionDrawer, setShowSessionDrawer] = useState(false);
  const [isDrawerClosing, setIsDrawerClosing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const handleCloseDrawer = () => {
    setIsDrawerClosing(true);
    setTimeout(() => {
      setShowSessionDrawer(false);
      setIsDrawerClosing(false);
    }, 240);
  };

  const fetchSessions = async () => {
    const res = await fetch(`${API_BASE_URL}/chat/sessions`, {
      credentials: 'include',
    });
    if (res.ok) {
      const data = await res.json();
      const list = Array.isArray(data) ? data : data.sessions ?? [];
      setSessions(list);
      // 선택된 세션 타이틀 유지 (세션 리스트 갱신돼도 ChatWindow 안 꺼지게)
      if (selectedId) {
        const current = list.find((s: ChatSession) => s.id === selectedId);
        if (current) setSelectedTitle(current.title);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  // 쿼리 파라미터로 세션 선택 또는 모달 오픈
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
    }
    // else: do nothing — don't reset selectedId, it may have been set by handleCreated
  }, [searchParams]); // sessions 제거 — sessions 변경 시 selectedId 초기화 방지

  const handleCreated = (session: { id: string; title: string }) => {
    setSelectedId(session.id);
    setSelectedTitle(session.title);
    fetchSessions();
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

  const selectedSession = sessions.find((s) => s.id === selectedId);

  // 세션 미선택 — 시작 화면
  if (!selectedId) {
    return (
      <div className={s.homeContainer}>
        {isMobile && (
          <button className={s.hamburgerButton} onClick={() => setShowSessionDrawer(true)}>
            <Menu size={24} color="var(--text-primary)" />
          </button>
        )}
        <div className={s.homeContent}>
          <VStack gap={SPACING.s12} align="start" fullWidth>
            <Typo.SM size={24} color="primary" style={{ fontWeight: 600 }}>AI 튜터</Typo.SM>
            <Typo.MD size={16} color="secondary" style={{ fontWeight: 500 }}>
              과목과 단원 범위를 설정하고 궁금한 것을 무엇이든 물어보세요!
            </Typo.MD>
          </VStack>

          {/* 입력 카드 */}
          <div className={s.inputCard}>
            <div className={s.settingsRow}>
              <Typo.MD size={12} color="secondary" style={{ fontWeight: 500 }}>
                새 채팅을 시작하려면 설정 버튼을 누르세요
              </Typo.MD>
            </div>
            <div className={s.inputRow}>
              <button className={s.iconButton} onClick={() => setModalOpen(true)}>
                <Settings size={20} color="var(--text-primary)" />
              </button>
              <div className={s.inputPlaceholder} onClick={() => setModalOpen(true)}>
                <Typo.MD size={14} color="secondary">궁금한 점을 물어보세요...</Typo.MD>
              </div>
              <button className={`${s.iconButton} ${s.sendButton}`} onClick={() => setModalOpen(true)}>
                <ArrowUp size={20} color="#FFFFFF" strokeWidth={3} />
              </button>
            </div>
          </div>
        </div>

        {isMobile && showSessionDrawer && (
          <div className={`${s.sessionDrawerOverlay} ${isDrawerClosing ? s.closing : ''}`} onClick={handleCloseDrawer}>
            <div className={`${s.sessionDrawerPanel} ${isDrawerClosing ? s.closing : ''}`} onClick={(e) => e.stopPropagation()}>
              <HStack justify="between" align="center" fullWidth style={{ marginBottom: SPACING.s16 }}>
                <Typo.SM size={16} color="primary">최근 채팅</Typo.SM>
                <button className={s.drawerClose} onClick={handleCloseDrawer}>
                  <X size={20} />
                </button>
              </HStack>
              <VStack gap={SPACING.s8} fullWidth>
                {sessions.length === 0 ? (
                  <Typo.MD size={14} color="secondary">채팅 기록이 없습니다.</Typo.MD>
                ) : (
                  sessions.map((session) => (
                    <HStack
                      key={session.id}
                      className={s.drawerSessionItem}
                      align="center"
                      fullWidth
                      onClick={() => { setSelectedId(session.id); setSelectedTitle(session.title); handleCloseDrawer(); }}
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
        )}

        <CreateChatModal
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onCreated={handleCreated}
        />
      </div>
    );
  }

  // 세션 선택 — 채팅창
  return (
    <div className={s.chatContainer}>
      {/* 상단 바 */}
      <div className={s.chatTopBar}>
        <HStack align="center" fullWidth>
          {isMobile && (
            <button className={s.backButton} onClick={() => setShowSessionDrawer(true)}>
              <Menu size={20} color="var(--text-primary)" />
            </button>
          )}
          <button className={s.backButton} onClick={() => setSelectedId(null)}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="var(--text-primary)">
              <path d="M12.5 15L7.5 10L12.5 5" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <VStack gap={SPACING.s4} style={{ marginLeft: SPACING.s12 }}>
            <Typo.SM size={16} color="primary">{selectedSession?.title}</Typo.SM>
            <Typo.MD size={12} color="secondary">
              {selectedSession?.subject?.title ?? ''}{selectedSession?.startUnit ? ` · ${selectedSession.startUnit}~${selectedSession.endUnit}단원` : ''}
            </Typo.MD>
          </VStack>
        </HStack>
      </div>

      {/* 채팅창 */}
      <div className={s.chatWindowWrapper}>
        <ChatWindow key={selectedId} sessionId={selectedId!} sessionTitle={selectedTitle} />
      </div>

      {isMobile && showSessionDrawer && (
        <div className={`${s.sessionDrawerOverlay} ${isDrawerClosing ? s.closing : ''}`} onClick={handleCloseDrawer}>
          <div className={`${s.sessionDrawerPanel} ${isDrawerClosing ? s.closing : ''}`} onClick={(e) => e.stopPropagation()}>
            <HStack justify="between" align="center" fullWidth style={{ marginBottom: SPACING.s16 }}>
              <Typo.SM size={16} color="primary">최근 채팅</Typo.SM>
              <button className={s.drawerClose} onClick={handleCloseDrawer}>
                <X size={20} />
              </button>
            </HStack>
            <VStack gap={SPACING.s8} fullWidth>
              {sessions.length === 0 ? (
                <Typo.MD size={14} color="secondary">채팅 기록이 없습니다.</Typo.MD>
              ) : (
                sessions.map((session) => (
                  <HStack
                    key={session.id}
                    className={`${s.drawerSessionItem} ${session.id === selectedId ? s.drawerSessionActive : ''}`}
                    align="center"
                    fullWidth
                    onClick={() => { setSelectedId(session.id); setSelectedTitle(session.title); handleCloseDrawer(); }}
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
      )}

      <CreateChatModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}
