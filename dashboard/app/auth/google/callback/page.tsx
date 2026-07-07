'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function DashboardGoogleCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const apiBase = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
    fetch(`${apiBase}/users/me`, { credentials: 'include' })
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
  }, [router]);

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <p>로그인 처리 중...</p>
    </div>
  );
}
