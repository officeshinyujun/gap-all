'use client';

import { useEffect } from 'react';
import { Outlet, useNavigate } from 'react-router';
import { HStack } from '@shared/ui/HStack';
import { VStack } from '@shared/ui/VStack';
import { Sidebar } from '@shared/ui/Sidebar';
import { useAuth } from '@shared/contexts/AuthContext';
import s from './layout.module.scss';
import { SPACING } from '@shared/constants/spacing';

export default function MainLayout() {
  const { user, isLoading } = useAuth();
  const navigate = useNavigate();

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
      <VStack gap={SPACING.s16} className={s.mainContent} style={{ padding: SPACING.s24 }} fullHeight>
        <Outlet />
      </VStack>
    </HStack>
  );
}
