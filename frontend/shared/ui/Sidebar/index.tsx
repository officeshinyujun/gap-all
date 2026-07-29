'use client';

import { useState, useEffect, useCallback } from "react";
import { VStack } from "../VStack";
import { HStack } from "../HStack";
import Typo from "../Typo";
import { SPACING } from "../../../constants/spacing";
import s from "./style.module.scss";
import { LayoutDashboard, MessageSquare, Briefcase, Hammer, Plus, BookOpen, User, X, FileText, RefreshCcw, type LucideIcon } from "lucide-react";
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router';
import { APP_CONFIG } from "../../../constants/app";
import { API_BASE_URL } from "../../../lib/auth";
import { useAuth } from "../../../contexts/AuthContext";
import { fetchWithClientCache } from '@/lib/clientCache';

interface ChatSession {
  id: string;
  title: string;
}

function SidebarItem({ icon: Icon, label, href, isActive }: { icon: LucideIcon, label: string, href: string, isActive?: boolean }) {
  return (
    <Link to={href} style={{ textDecoration: 'none', display: 'block' }}>
      <HStack gap={SPACING.s8} align="center" className={`${s.menuItem} ${isActive ? s.menuItemActive : ''}`}>
        <Icon size={16} color={isActive ? "var(--text-primary)" : "var(--text-secondary)"} />
        <Typo.MD size={14} color={isActive ? "primary" : "secondary"}>{label}</Typo.MD>
      </HStack>
    </Link>
  );
}

const STUDY_SHEET_ITEMS = {
  study: [
    { icon: Briefcase, label: "성공적인 직업생활", href: "/study/success" },
    { icon: Hammer, label: "공업 일반", href: "/study/industry" },
  ],
  exam: [
    { icon: Briefcase, label: "성공적인 직업생활 문제", href: "/exam/success" },
    { icon: Hammer, label: "공업 일반 문제", href: "/exam/industry" },
  ],
};

function MobileStudySheet({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const navigate = useNavigate();

  if (!isOpen) return null;

  const handleItemClick = (href: string) => {
    onClose();
    navigate(href);
  };

  return (
    <div className={s.sheetOverlay} onClick={onClose}>
      <div className={s.sheetPanel} onClick={(e) => e.stopPropagation()}>
        <HStack justify="between" align="center" fullWidth style={{ marginBottom: SPACING.s16 }}>
          <Typo.SM size={16} color="primary">스터디</Typo.SM>
          <button className={s.sheetClose} onClick={onClose}>
            <X size={20} />
          </button>
        </HStack>

        <VStack gap={SPACING.s20} fullWidth>
          <VStack gap={SPACING.s8} fullWidth>
            <Typo.MD size={12} color="secondary">학습하기</Typo.MD>
            {STUDY_SHEET_ITEMS.study.map((item) => (
              <button key={item.href} className={s.sheetItem} onClick={() => handleItemClick(item.href)}>
                <item.icon size={18} color="#5C6370" />
                <span>{item.label}</span>
              </button>
            ))}
          </VStack>

          <VStack gap={SPACING.s8} fullWidth>
            <Typo.MD size={12} color="secondary">문제 풀기</Typo.MD>
            {STUDY_SHEET_ITEMS.exam.map((item) => (
              <button key={item.href} className={s.sheetItem} onClick={() => handleItemClick(item.href)}>
                <item.icon size={18} color="#5C6370" />
                <span>{item.label}</span>
              </button>
            ))}
          </VStack>
        </VStack>
      </div>
    </div>
  );
}

function BottomBar({ pathname }: { pathname: string }) {
  const [showStudySheet, setShowStudySheet] = useState(false);
  const [reviewEnabled, setReviewEnabled] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem('gap_review_enabled');
    if (stored !== null) {
      setReviewEnabled(stored === 'true');
    }
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'gap_review_enabled') {
        setReviewEnabled(e.newValue !== 'false');
      }
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  const isRouteActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const isStudyActive = pathname.startsWith('/study') || pathname.startsWith('/exam');

  return (
    <>
      <nav className={s.bottomBar}>
        <Link to="/" className={`${s.bottomBarItem} ${isRouteActive('/') ? s.bottomBarItemActive : ''}`}>
          <LayoutDashboard size={22} color={isRouteActive('/') ? "#3333CC" : "#5C5C70"} />
          <span className={s.bottomBarLabel}>홈</span>
        </Link>

        <button
          className={`${s.bottomBarItem} ${isStudyActive ? s.bottomBarItemActive : ''}`}
          onClick={() => setShowStudySheet(true)}
        >
          <BookOpen size={22} color={isStudyActive ? "#3333CC" : "#5C5C70"} />
          <span className={s.bottomBarLabel}>스터디</span>
        </button>

        {reviewEnabled && (
          <Link to="/review" className={`${s.bottomBarItem} ${isRouteActive('/review') ? s.bottomBarItemActive : ''}`}>
            <RefreshCcw size={22} color={isRouteActive('/review') ? "#3333CC" : "#5C5C70"} />
            <span className={s.bottomBarLabel}>오답</span>
          </Link>
        )}

        <Link to="/chat" className={`${s.bottomBarItem} ${isRouteActive('/chat') ? s.bottomBarItemActive : ''}`}>
          <MessageSquare size={22} color={isRouteActive('/chat') ? "#3333CC" : "#5C5C70"} />
          <span className={s.bottomBarLabel}>채팅</span>
        </Link>

        <Link to="/profile" className={`${s.bottomBarItem} ${isRouteActive('/profile') ? s.bottomBarItemActive : ''}`}>
          <User size={22} color={isRouteActive('/profile') ? "#3333CC" : "#5C5C70"} />
          <span className={s.bottomBarLabel}>프로필</span>
        </Link>
      </nav>

      <MobileStudySheet isOpen={showStudySheet} onClose={() => setShowStudySheet(false)} />
    </>
  );
}

export function Sidebar() {
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [showAll, setShowAll] = useState(false);

  const activeSessionId = searchParams.get('session');

  const fetchSessions = useCallback(async () => {
    try {
      const data = await fetchWithClientCache('chat:sessions', 30_000, async () => {
        const res = await fetch(`${API_BASE_URL}/chat/sessions`, {
          credentials: 'include',
        });
        if (!res.ok) throw new Error('채팅 목록을 불러오지 못했습니다.');
        return res.json() as Promise<ChatSession[] | { sessions?: ChatSession[] }>;
      });
      setSessions(Array.isArray(data) ? data : data.sessions ?? []);
    } catch { }
  }, []);

  useEffect(() => {
    fetchSessions();
  }, [fetchSessions, pathname]);

  const isRouteActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const visibleSessions = showAll ? sessions : sessions.slice(0, 5);
  const hasMore = sessions.length > 5;

  return (
    <>
      <VStack justify="between" align="center" className={s.sidebar} fullHeight>
        <VStack gap={SPACING.s10} fullWidth>
          <Link to="/" aria-label="메인페이지로 이동" style={{ textDecoration: 'none', display: 'block' }}>
            <HStack gap={SPACING.s8} align="center" style={{ padding: SPACING.s12 }}>
              <img src="/2830_logo.png" alt={APP_CONFIG.name} width={32} height={32} />
              <Typo.MD size={16} color="primary">{APP_CONFIG.name}</Typo.MD>
            </HStack>
          </Link>

          <VStack gap={SPACING.s8} style={{ padding: SPACING.s8 }}>
            <Typo.MD size={12} color="secondary">General</Typo.MD>
            <SidebarItem icon={LayoutDashboard} label="메인페이지" href="/" isActive={isRouteActive('/')} />
            <SidebarItem icon={FileText} label="개념리스트" href="/concept-list" isActive={isRouteActive('/concept-list')} />
          </VStack>

          <VStack gap={SPACING.s8} style={{ padding: SPACING.s8 }}>
            <Typo.MD size={12} color="secondary">Study</Typo.MD>
            <SidebarItem icon={Briefcase} label="성공적인 직업생활" href="/study/success" isActive={isRouteActive('/study/success')} />
            <SidebarItem icon={Hammer} label="공업 일반" href="/study/industry" isActive={isRouteActive('/study/industry')} />
          </VStack>

          <VStack gap={SPACING.s8} style={{ padding: SPACING.s8 }}>
            <Typo.MD size={12} color="secondary">exam</Typo.MD>
            <SidebarItem icon={Briefcase} label="성공적인 직업생활 문제" href="/exam/success" isActive={isRouteActive('/exam/success')} />
            <SidebarItem icon={Hammer} label="공업 일반 문제" href="/exam/industry" isActive={isRouteActive('/exam/industry')} />
          </VStack>

          <VStack gap={SPACING.s8} style={{ padding: SPACING.s8 }}>
            <Typo.MD size={12} color="secondary">chat</Typo.MD>
            <SidebarItem icon={Plus} label="새 채팅 만들기" href="/chat?new=1" isActive={pathname === '/chat' && !activeSessionId} />
            {visibleSessions.map((session) => (
              <SidebarItem
                key={session.id}
                icon={MessageSquare}
                label={session.title}
                href={`/chat?session=${session.id}`}
                isActive={activeSessionId === session.id}
              />
            ))}
            {hasMore && (
              <HStack justify="between" align="center" style={{ padding: SPACING.s8 }}>
                <Typo.MD size={12} color="secondary">외 {sessions.length - 5}개</Typo.MD>
                <Typo.MD
                  size={12}
                  color="brand"
                  style={{ cursor: 'pointer' }}
                  onClick={() => setShowAll(!showAll)}
                >
                  {showAll ? '접기' : '보러가기'}
                </Typo.MD>
              </HStack>
            )}
          </VStack>
        </VStack>

        <Link to="/profile" style={{ textDecoration: 'none', display: 'block', width: '100%' }}>
          <HStack gap={SPACING.s8} align="center" className={s.userProfile} fullWidth style={{ cursor: 'pointer' }}>
            <div className={s.avatar} />
            <VStack gap={SPACING.s4}>
              <Typo.MD size={16} color="primary">{user?.name ?? ''}</Typo.MD>
              <Typo.MD size={12} color="secondary">{user?.email ?? ''}</Typo.MD>
            </VStack>
          </HStack>
        </Link>
      </VStack>

      <BottomBar pathname={pathname} />
    </>
  );
}
