'use client';

import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useAuth } from '@shared/contexts/AuthContext';

export default function GoogleCallbackPage() {
  const navigate = useNavigate();
  const { refreshUser } = useAuth();
  const processedRef = useRef(false);

  useEffect(() => {
    if (processedRef.current) return;
    processedRef.current = true;

    refreshUser()
      .then((user) => {
        navigate(user ? '/' : '/login', { replace: true });
      })
      .catch(() => {
        navigate('/login', { replace: true });
      });
  }, [navigate, refreshUser]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <p>로그인 처리 중...</p>
    </div>
  );
}
