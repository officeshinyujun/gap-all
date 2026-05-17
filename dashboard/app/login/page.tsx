'use client';

import { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import s from './page.module.scss';

type Mode = 'login' | 'register';

export default function LoginPage() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        await register(email, name, password);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={s.page}>
      <div className={s.card}>
        <div className={s.logoWrapper}>
          <span className={s.logoText}>GAP Dashboard</span>
        </div>

        <div className={s.tabs}>
          <button
            className={`${s.tab} ${mode === 'login' ? s.tabActive : ''}`}
            onClick={() => { setMode('login'); setError(''); }}
          >
            로그인
          </button>
          <button
            className={`${s.tab} ${mode === 'register' ? s.tabActive : ''}`}
            onClick={() => { setMode('register'); setError(''); }}
          >
            회원가입
          </button>
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

          {mode === 'register' && (
            <div className={s.fieldGroup}>
              <label className={s.label}>이름</label>
              <input
                className={s.input}
                type="text"
                placeholder="이름을 입력하세요"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
                maxLength={20}
              />
            </div>
          )}

          <div className={s.fieldGroup}>
            <label className={s.label}>비밀번호</label>
            <input
              className={s.input}
              type="password"
              placeholder="8자 이상 입력하세요"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </div>

          {error && <p className={s.error}>{error}</p>}

          <button
            className={s.submitButton}
            type="submit"
            disabled={isLoading}
          >
            {isLoading ? '처리 중...' : mode === 'login' ? '로그인' : '회원가입'}
          </button>
        </form>
      </div>
    </div>
  );
}
