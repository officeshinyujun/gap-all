'use client';

import { useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '@shared/contexts/AuthContext';
import { APP_CONFIG } from '@/constants/app';
import { API_BASE_URL } from '@shared/lib/auth';
import { VStack } from '@/components/general/VStack';
import s from './page.module.scss';

export default function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message ?? '로그인 중 오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <VStack fullHeight fullWidth justify="center" align="center" className={s.page}>
      <VStack align="center" gap={28} className={s.card}>
        <Link to="/landing" className={s.logoLink}>
          <img src="/2830_logo.png" alt={APP_CONFIG.name} width={36} height={36} />
          <span className={s.logoText}>{APP_CONFIG.name}</span>
        </Link>

        <div className={s.header}>
          <h1 className={s.title}>로그인</h1>
          <p className={s.subtitle}>돌아오신 것을 환영합니다</p>
        </div>

        <form className={s.form} onSubmit={handleSubmit}>
          <div className={s.fieldGroup}>
            <label className={s.label}>이메일</label>
            <input
              className={s.input}
              type="email"
              placeholder="example@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>

          <div className={s.fieldGroup}>
            <label className={s.label}>비밀번호</label>
            <input
              className={s.input}
              type="password"
              placeholder="비밀번호를 입력하세요"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
            />
          </div>

          {error && <p className={s.error}>{error}</p>}

          <button
            className={s.submitButton}
            type="submit"
            disabled={isLoading}
          >
            {isLoading ? '로그인 중...' : '로그인'}
          </button>
        </form>

        <div className={s.divider}>
          <div className={s.dividerLine} />
          <span className={s.dividerText}>또는</span>
          <div className={s.dividerLine} />
        </div>

        <button
          className={s.googleButton}
          type="button"
          onClick={() => {
            const returnTo = window.location.origin;
            window.location.href = `${API_BASE_URL}/auth/google?return_to=${encodeURIComponent(returnTo)}`;
          }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4" />
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853" />
            <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05" />
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335" />
          </svg>
          Google로 계속하기
        </button>

        <p className={s.footer}>
          계정이 없으신가요?{' '}
          <Link to="/signup" className={s.footerLink}>회원가입</Link>
        </p>
      </VStack>
    </VStack>
  );
}
