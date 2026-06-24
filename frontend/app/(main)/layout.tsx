'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { HStack } from '@shared/ui/HStack';
import { VStack } from '@shared/ui/VStack';
import { Sidebar } from '@shared/ui/Sidebar';
import { useAuth } from '@shared/contexts/AuthContext';
import s from './layout.module.scss';
import { SPACING } from '@shared/constants/spacing';

export default function MainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/landing');
    }
  }, [isLoading, user, router]);

  if (isLoading) return null;
  if (!user) return null;

  return (
    <HStack gap={SPACING.s16} className={s.container} align="start" style={{ padding: SPACING.s16 }}>
      <Sidebar />
      <VStack gap={SPACING.s16} className={s.mainContent} style={{ padding: SPACING.s24 }} fullHeight>
        {children}
      </VStack>
    </HStack>
  );
}
