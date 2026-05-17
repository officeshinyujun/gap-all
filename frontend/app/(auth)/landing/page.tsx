'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { APP_CONFIG } from '@/constants/app';
import { useAuth } from '@/contexts/AuthContext';
import s from './page.module.scss';

export default function LandingPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && user) {
      router.replace('/');
    }
  }, [isLoading, user, router]);

  return (
    <div className={s.page}>
      <div className={s.card}>
        <div className={s.logoWrapper}>
          <Image src="/2830_logo.png" alt={APP_CONFIG.name} width={72} height={72} priority />
        </div>
        <div className={s.textGroup}>
          <h1 className={s.title}>{APP_CONFIG.name}</h1>
          <p className={s.description}>{APP_CONFIG.description}</p>
        </div>
        <Link href="/login" className={s.ctaButton}>
          시작하기
        </Link>
      </div>
    </div>
  );
}
