'use client';

import { useEffect } from 'react';
import { API_BASE_URL } from '@/lib/auth';

export default function GoogleCallbackPage() {
  useEffect(() => {
    fetch(`${API_BASE_URL}/users/me`, { credentials: 'include' })
      .then((res) => {
        if (res.ok) {
          window.location.href = '/';
        } else {
          window.location.href = '/login';
        }
      })
      .catch(() => {
        window.location.href = '/login';
      });
  }, []);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <p>로그인 처리 중...</p>
    </div>
  );
}
