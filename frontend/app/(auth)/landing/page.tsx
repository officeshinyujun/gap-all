'use client';

import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router';
import { APP_CONFIG } from '@/constants/app';
import { useAuth } from '@shared/contexts/AuthContext';
import s from './page.module.scss';

export default function LandingPage() {
  const navigate = useNavigate();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && user) {
      navigate('/', { replace: true });
    }
  }, [isLoading, user, navigate]);

  return (
    <div className={s.page}>
        <div className={s.card}>
          <div className={s.logoWrapper}>
          <img src="/2830_logo.png" alt={APP_CONFIG.name} width={72} height={72} />
          </div>
        <div className={s.textGroup}>
          <h1 className={s.title}>{APP_CONFIG.name}</h1>
          <p className={s.description}>{APP_CONFIG.description}</p>
        </div>
        <Link to="/login" className={s.ctaButton}>
          시작하기
        </Link>
      </div>
    </div>
  );
}
