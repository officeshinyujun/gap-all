'use client';

import { useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router';
import { HStack } from '@/components/general/HStack';
import { VStack } from '@/components/general/VStack';
import { Sidebar } from '@shared/ui/Sidebar';
import { useAuth } from '@shared/contexts/AuthContext';
import { EntranceNoticeModal } from '@widgets/EntranceNoticeModal';
import s from './layout.module.scss';
import { SPACING } from '@/constants/spacing';

export default function MainLayout() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const isChat = pathname === '/chat' || pathname.startsWith('/chat?');

  useEffect(() => {
    if (!isLoading && !user) {
      navigate('/landing', { replace: true });
    }
  }, [isLoading, user, navigate]);

  if (isLoading) return null;
  if (!user) return null;

  return (
    <HStack gap={SPACING.s16} className={s.container} align="start" style={{ padding: SPACING.s16 }}>
      <Sidebar />
      <VStack gap={SPACING.s16} className={`${s.mainContent} ${isChat ? s.noBottomBar : ''}`} style={{ padding: SPACING.s24 }} fullHeight>
        <Outlet />
      </VStack>
      <EntranceNoticeModal userId={user.id} />
    </HStack>
  );
}
