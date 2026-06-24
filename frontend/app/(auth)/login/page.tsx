'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '@shared/contexts/AuthContext';
import { APP_CONFIG } from '@/constants/app';
import { API_BASE_URL } from '@shared/lib/auth';
import s from './page.module.scss';

type Mode = 'login' | 'register';

function validatePassword(password: string, birthday: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (password.length < 8) {
    errors.push('8자 이상');
  }
  if (!/^[A-Z]/.test(password)) {
    errors.push('첫 글자 대문자');
  }
  const specialChars = password.match(/[!@#$%^&*()_+\-=\[\]{}|;':",./<>?~`\\]/g);
  if (!specialChars || specialChars.length < 2) {
    errors.push('특수문자 2개 이상');
  }
  if (birthday) {
    const date = new Date(birthday);
    const yyyy = date.getFullYear().toString();
    const yy = yyyy.slice(2);
    const mm = (date.getMonth() + 1).toString().padStart(2, '0');
    const dd = date.getDate().toString().padStart(2, '0');
    const patterns = [
      `${yyyy}${mm}${dd}`, `${yy}${mm}${dd}`, `${mm}${dd}${yyyy}`,
      `${mm}${dd}`, `${dd}${mm}${yy}`, `${dd}${mm}${yyyy}`,
    ];
    if (patterns.some(p => password.includes(p))) {
      errors.push('생일 포함 불가');
    }
  }
  return { valid: errors.length === 0, errors };
}

export default function LoginPage() {
  const { login, register } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [birthday, setBirthday] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationToken, setVerificationToken] = useState('');
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [codeSent, setCodeSent] = useState(false);

  const handleSendCode = async () => {
    setError('');
    setIsSendingCode(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/send-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message ?? '인증번호 발송에 실패했습니다.');
      }
      setCodeSent(true);
    } catch (err: any) {
      setError(err.message ?? '인증번호 발송에 실패했습니다.');
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleVerifyCode = async () => {
    setError('');
    setIsVerifying(true);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/verify-code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: verificationCode }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message ?? '인증번호 확인에 실패했습니다.');
      }
      const data = await res.json();
      setVerificationToken(data.verificationToken);
      setIsEmailVerified(true);
    } catch (err: any) {
      setError(err.message ?? '인증번호 확인에 실패했습니다.');
    } finally {
      setIsVerifying(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      if (mode === 'login') {
        await login(email, password);
      } else {
        const { valid, errors } = validatePassword(password, birthday);
        if (!valid) {
          setError(`비밀번호: ${errors.join(', ')}`);
          setIsLoading(false);
          return;
        }
        await register(email, name, password, birthday, verificationToken);
      }
    } catch (err: any) {
      setError(err.message ?? '오류가 발생했습니다.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={s.page}>
      <div className={s.card}>
        <Link href="/landing" className={s.logoLink}>
          <Image src="/2830_logo.png" alt={APP_CONFIG.name} width={40} height={40} />
          <span className={s.logoText}>{APP_CONFIG.name}</span>
        </Link>

        <div className={s.tabs}>
          <button
            className={`${s.tab} ${mode === 'login' ? s.tabActive : ''}`}
            onClick={() => { setMode('login'); setError(''); setCodeSent(false); setIsEmailVerified(false); setVerificationCode(''); setVerificationToken(''); setBirthday(''); }}
          >
            로그인
          </button>
          <button
            className={`${s.tab} ${mode === 'register' ? s.tabActive : ''}`}
            onClick={() => { setMode('register'); setError(''); setCodeSent(false); setIsEmailVerified(false); setVerificationCode(''); setVerificationToken(''); setBirthday(''); }}
          >
            회원가입
          </button>
        </div>

        <form className={s.form} onSubmit={handleSubmit}>
          <div className={s.fieldGroup}>
            <label className={s.label}>이메일</label>
            <div className={s.inputRow}>
              <input
                className={s.input}
                type="email"
                placeholder="example@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                disabled={mode === 'register' && isEmailVerified}
              />
              {mode === 'register' && !isEmailVerified && (
                <button
                  type="button"
                  className={s.sendCodeButton}
                  onClick={handleSendCode}
                  disabled={isSendingCode || !email}
                >
                  {isSendingCode ? '발송 중...' : codeSent ? '재발송' : '인증번호 발송'}
                </button>
              )}
              {mode === 'register' && isEmailVerified && (
                <span className={s.verifiedBadge}>인증완료</span>
              )}
            </div>
          </div>

          {mode === 'register' && codeSent && !isEmailVerified && (
            <div className={s.fieldGroup}>
              <label className={s.label}>인증번호</label>
              <div className={s.inputRow}>
                <input
                  className={s.input}
                  type="text"
                  placeholder="6자리 인증번호"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                />
                <button
                  type="button"
                  className={s.verifyButton}
                  onClick={handleVerifyCode}
                  disabled={isVerifying || verificationCode.length !== 6}
                >
                  {isVerifying ? '확인 중...' : '확인'}
                </button>
              </div>
            </div>
          )}

          {mode === 'register' && isEmailVerified && (
            <>
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
              <div className={s.fieldGroup}>
                <label className={s.label}>생년월일</label>
                <input
                  className={s.input}
                  type="date"
                  value={birthday}
                  onChange={(e) => setBirthday(e.target.value)}
                  required
                  max={new Date().toISOString().split('T')[0]}
                />
              </div>
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
                  autoComplete="new-password"
                />
                {password && (() => {
                  const rules = [
                    { label: '8자 이상', pass: password.length >= 8 },
                    { label: '첫 글자 대문자', pass: /^[A-Z]/.test(password) },
                    { label: '특수문자 2개 이상', pass: (password.match(/[!@#$%^&*()_+\-=\[\]{}|;':",./<>?~`\\]/g) || []).length >= 2 },
                    {
                      label: '생일 포함 불가', pass: !birthday || (() => {
                        const date = new Date(birthday);
                        const yyyy = date.getFullYear().toString();
                        const yy = yyyy.slice(2);
                        const mm = (date.getMonth() + 1).toString().padStart(2, '0');
                        const dd = date.getDate().toString().padStart(2, '0');
                        const patterns = [`${yyyy}${mm}${dd}`, `${yy}${mm}${dd}`, `${mm}${dd}${yyyy}`, `${mm}${dd}`, `${dd}${mm}${yy}`, `${dd}${mm}${yyyy}`];
                        return !patterns.some(p => password.includes(p));
                      })()
                    },
                  ];
                  return (
                    <ul className={s.passwordRules}>
                      {rules.map(r => (
                        <li key={r.label} className={r.pass ? s.rulePass : s.ruleFail}>{r.label}</li>
                      ))}
                    </ul>
                  );
                })()}
              </div>
            </>
          )}

          {mode === 'login' && (
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
                autoComplete="current-password"
              />
            </div>
          )}

          {error && <p className={s.error}>{error}</p>}

          {(mode === 'login' || isEmailVerified) && (
            <button
              className={s.submitButton}
              type="submit"
              disabled={isLoading}
            >
              {isLoading ? '처리 중...' : mode === 'login' ? '로그인' : '회원가입'}
            </button>
          )}
        </form>

        <div className={s.divider}>
          <div className={s.dividerLine} />
          <span className={s.dividerText}>또는</span>
          <div className={s.dividerLine} />
        </div>

        <button
          className={s.googleButton}
          type="button"
          onClick={() => { window.location.href = `${API_BASE_URL}/auth/google`; }}
        >
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615Z" fill="#4285F4" />
            <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18Z" fill="#34A853" />
            <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332Z" fill="#FBBC05" />
            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58Z" fill="#EA4335" />
          </svg>
          Google로 계속하기
        </button>
      </div>
    </div>
  );
}
