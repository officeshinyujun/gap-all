'use client';

import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { useAuth } from '@shared/contexts/AuthContext';
import { APP_CONFIG } from '@/constants/app';
import { API_BASE_URL } from '@shared/lib/auth';
import { VStack } from '@/components/general/VStack';
import s from './page.module.scss';

function validatePassword(password: string, birthday: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (password.length < 8) errors.push('8자 이상');
  if (!/^[A-Z]/.test(password)) errors.push('첫 글자 대문자');
  const specialChars = password.match(/[!@#$%^&*()_+\-=\[\]{}|;':",./<>?~`\\]/g);
  if (!specialChars || specialChars.length < 2) errors.push('특수문자 2개 이상');
  if (birthday) {
    const date = new Date(birthday);
    const yyyy = date.getFullYear().toString();
    const yy = yyyy.slice(2);
    const mm = (date.getMonth() + 1).toString().padStart(2, '0');
    const dd = date.getDate().toString().padStart(2, '0');
    const patterns = [`${yyyy}${mm}${dd}`, `${yy}${mm}${dd}`, `${mm}${dd}${yyyy}`, `${mm}${dd}`, `${dd}${mm}${yy}`, `${dd}${mm}${yyyy}`];
    if (patterns.some(p => password.includes(p))) errors.push('생일 포함 불가');
  }
  return { valid: errors.length === 0, errors };
}

export default function SignupPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
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
      const { valid, errors } = validatePassword(password, birthday);
      if (!valid) {
        setError(`비밀번호: ${errors.join(', ')}`);
        setIsLoading(false);
        return;
      }
      await register(email, name, password, birthday, verificationToken);
      navigate('/', { replace: true });
    } catch (err: any) {
      setError(err.message ?? '회원가입 중 오류가 발생했습니다.');
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
          <h1 className={s.title}>회원가입</h1>
          <p className={s.subtitle}>직업탐구 학습을 지금 시작하세요</p>
        </div>

        <form className={s.form} onSubmit={handleSubmit}>
          <div className={s.fieldGroup}>
            <label className={s.label}>이메일</label>
            <input
              className={s.input}
              type="email"
              placeholder="example@email.com"
              value={email}
              onChange={(e) => { setEmail(e.target.value); setCodeSent(false); setIsEmailVerified(false); setVerificationCode(''); setVerificationToken(''); }}
              required
              autoComplete="email"
              disabled={isEmailVerified}
            />
          </div>

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
              autoComplete="name"
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
              autoComplete="bday"
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
                { label: '생일 포함 불가', pass: !birthday || (() => {
                  const date = new Date(birthday);
                  const yyyy = date.getFullYear().toString();
                  const yy = yyyy.slice(2);
                  const mm = (date.getMonth() + 1).toString().padStart(2, '0');
                  const dd = date.getDate().toString().padStart(2, '0');
                  const patterns = [`${yyyy}${mm}${dd}`, `${yy}${mm}${dd}`, `${mm}${dd}${yyyy}`, `${mm}${dd}`, `${dd}${mm}${yy}`, `${dd}${mm}${yyyy}`];
                  return !patterns.some(p => password.includes(p));
                })() },
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

          <div className={s.verificationSection}>
            {!isEmailVerified && (
              <button
                type="button"
                className={s.sendCodeButton}
                onClick={handleSendCode}
                disabled={isSendingCode || !email}
              >
                {isSendingCode ? '발송 중...' : codeSent ? '인증번호 재발송' : '이메일 인증하기'}
              </button>
            )}

            {codeSent && !isEmailVerified && (
              <div className={s.verifyRow}>
                <input
                  className={s.input}
                  type="text"
                  placeholder="인증번호 6자리"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  maxLength={6}
                  autoComplete="one-time-code"
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
            )}

            {isEmailVerified && (
              <div className={s.verifiedRow}>
                <span className={s.verifiedIcon}>✓</span>
                <span className={s.verifiedText}>이메일 인증 완료</span>
              </div>
            )}
          </div>

          {error && <p className={s.error}>{error}</p>}

          <button
            className={s.submitButton}
            type="submit"
            disabled={isLoading || !isEmailVerified}
          >
            {isLoading ? '가입 중...' : '회원가입'}
          </button>
        </form>

        <p className={s.footer}>
          이미 계정이 있으신가요?{' '}
          <Link to="/login" className={s.footerLink}>로그인</Link>
        </p>
      </VStack>
    </VStack>
  );
}
