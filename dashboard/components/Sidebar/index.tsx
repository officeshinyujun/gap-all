'use client';

import { VStack } from '../general/VStack';
import { HStack } from '../general/HStack';
import Typo from '../general/Typo';
import { SPACING } from '../../constants/spacing';
import s from './style.module.scss';
import { LayoutDashboard, FlaskConical, Users, BarChart2, Zap, LogOut, MessageSquare, BookMarked, Database, RefreshCw, Eye, Activity, FileEdit, BookOpen, Search } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

const MENU_SECTIONS = [
  {
    title: '대시보드',
    items: [
      { icon: LayoutDashboard, label: '홈', href: '/' },
      { icon: BarChart2, label: '학습 분석', href: '/analytics' },
    ],
  },
  {
    title: '퀴즈 관리',
    items: [
      { icon: Database, label: '캐시 관리', href: '/quiz-cache' },
      { icon: BookMarked, label: '퀴즈 테스트', href: '/study-quiz' },
    ],
  },
  {
    title: '시험 관리',
    items: [
      { icon: FlaskConical, label: '시험 생성', href: '/exam-generate' },
      { icon: BarChart2, label: '시험 목록', href: '/exam-list' },
      { icon: Search, label: '문제 검색', href: '/question-search' },
      { icon: Eye, label: '문제 뷰어', href: '/questionstem' },
    ],
  },
  {
    title: '오답 관리',
    items: [
      { icon: RefreshCw, label: '오답 현황', href: '/incorrect-records' },
    ],
  },
  {
    title: '채팅',
    items: [
      { icon: MessageSquare, label: '채팅 테스트', href: '/chat' },
    ],
  },
  {
    title: '유저',
    items: [
      { icon: Users, label: '유저 목록', href: '/admin/users' },
      { icon: BarChart2, label: '학습 진척도', href: '/admin/progress' },
    ],
  },
  {
    title: '시스템',
    items: [
      { icon: Zap, label: 'RAG 임베딩', href: '/rag-embedding' },
      { icon: FileEdit, label: '교재 편집', href: '/summation-editor' },
      { icon: BookOpen, label: '구조화 개념', href: '/structured-concept' },
      { icon: Activity, label: 'API 사용량', href: '/admin/usage' },
    ],
  },
];

function SidebarItem({ icon: Icon, label, href, isActive }: { icon: any; label: string; href: string; isActive?: boolean }) {
  return (
    <Link href={href} style={{ textDecoration: 'none', display: 'block' }}>
      <HStack gap={SPACING.s8} align="center" className={`${s.menuItem} ${isActive ? s.menuItemActive : ''}`}>
        <Icon size={16} color={isActive ? '#101113' : '#5C6370'} />
        <Typo.MD size={14} color={isActive ? 'primary' : 'secondary'}>{label}</Typo.MD>
      </HStack>
    </Link>
  );
}

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();
  const router = useRouter();

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/';
    return pathname.startsWith(href);
  };

  const handleLogout = () => {
    logout();
    router.replace('/login');
  };

  return (
    <VStack className={s.sidebar} fullHeight>
      {/* 로고 */}
      <HStack gap={SPACING.s8} align="center" style={{ padding: SPACING.s12 }}>
        <div className={s.gapLogo} />
        <Typo.MD size={16} color="primary">GAP Admin</Typo.MD>
      </HStack>

      {/* Menu sections */}
      <VStack gap={SPACING.s10} fullWidth className={s.menuArea}>
        {MENU_SECTIONS.map((section) => (
          <VStack key={section.title} gap={SPACING.s8} style={{ padding: SPACING.s8 }}>
            <Typo.MD size={12} color="secondary">{section.title}</Typo.MD>
            {section.items.map((item) => (
              <SidebarItem
                key={item.href}
                icon={item.icon}
                label={item.label}
                href={item.href}
                isActive={isActive(item.href)}
              />
            ))}
          </VStack>
        ))}
      </VStack>

      {/* 유저 프로필 + 로그아웃 */}
      <VStack gap={SPACING.s8} fullWidth style={{ padding: SPACING.s8 }}>
        <HStack gap={SPACING.s8} align="center" className={s.userProfile} fullWidth>
          <div className={s.avatar} />
          <VStack gap={SPACING.s4}>
            <Typo.MD size={14} color="primary">{user?.name ?? ''}</Typo.MD>
            <Typo.MD size={12} color="secondary">{user?.email ?? ''}</Typo.MD>
          </VStack>
        </HStack>
        <button className={s.logoutBtn} onClick={handleLogout}>
          <HStack gap={SPACING.s8} align="center">
            <LogOut size={14} color="#5C6370" />
            <Typo.MD size={12} color="secondary">로그아웃</Typo.MD>
          </HStack>
        </button>
      </VStack>
    </VStack>
  );
}
