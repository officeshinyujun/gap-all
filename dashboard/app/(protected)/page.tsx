'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { VStack } from '@/components/general/VStack';
import { HStack } from '@/components/general/HStack';
import Typo from '@/components/general/Typo';
import { SPACING } from '@/constants/spacing';
import { API_BASE_URL } from '@/lib/auth';
import s from './page.module.scss';

interface Stats {
  userCount: number;
  examCount: number;
  cachePercent: number;
  incorrectCount: number;
  totalTokens: number;
  totalRequests: number;
}

function StatCard({ label, value, unit }: { label: string; value: number | string; unit?: string }) {
  return (
    <VStack gap={SPACING.s8} className={s.statCard} align="center" justify="center">
      <Typo.MD size={12} color="secondary">{label}</Typo.MD>
      <Typo.BD size={24} color="primary">{value}{unit ?? ''}</Typo.BD>
    </VStack>
  );
}

export default function HomePage() {
  const { user } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<Stats>({ userCount: 0, examCount: 0, cachePercent: 0, incorrectCount: 0, totalTokens: 0, totalRequests: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };

    Promise.allSettled([
      fetch(`${API_BASE_URL}/admin/users`, { headers, credentials: 'include' }).then(r => r.json()),
      fetch(`${API_BASE_URL}/exams`, { headers, credentials: 'include' }).then(r => r.json()),
      fetch(`${API_BASE_URL}/study/cache-status`, { headers, credentials: 'include' }).then(r => r.json()),
      fetch(`${API_BASE_URL}/admin/openai-usage`, { headers, credentials: 'include' }).then(r => r.json()),
    ]).then(([usersRes, examsRes, cacheRes, usageRes]) => {
      const userCount = usersRes.status === 'fulfilled' && Array.isArray(usersRes.value) ? usersRes.value.length : 0;
      const examCount = examsRes.status === 'fulfilled' && Array.isArray(examsRes.value) ? examsRes.value.length : 0;

      let cachePercent = 0;
      if (cacheRes.status === 'fulfilled' && cacheRes.value.subjects) {
        let filled = 0, total = 0;
        for (const sub of cacheRes.value.subjects) {
          for (const unit of sub.units) {
            total += 4;
            if (unit.blank10 !== null) filled++;
            if (unit.blank20 !== null) filled++;
            if (unit.concept10 !== null) filled++;
            if (unit.concept20 !== null) filled++;
          }
        }
        cachePercent = total > 0 ? Math.round((filled / total) * 100) : 0;
      }

      let totalTokens = 0;
      let totalRequests = 0;
      if (usageRes.status === 'fulfilled' && usageRes.value?.db) {
        for (const row of usageRes.value.db) {
          totalTokens += row.totalTokens ?? 0;
          totalRequests += row.nRequests ?? 0;
        }
      }

      setStats({ userCount, examCount, cachePercent, incorrectCount: 0, totalTokens, totalRequests });
      setLoading(false);
    });
  }, []);

  return (
    <VStack gap={SPACING.s32} className={s.page}>
      <VStack gap={SPACING.s8}>
        <Typo.BD size={24} color="primary">안녕하세요, {user?.name ?? ''}님</Typo.BD>
        <Typo.TH size={14} color="secondary">GAP Admin Dashboard</Typo.TH>
      </VStack>

      <HStack gap={SPACING.s16} className={s.statsRow}>
        <StatCard label="총 유저 수" value={loading ? '-' : `${stats.userCount}`} unit={loading ? '' : '명'} />
        <StatCard label="총 시험 수" value={loading ? '-' : `${stats.examCount}`} unit={loading ? '' : '개'} />
        <StatCard label="캐시 커버리지" value={loading ? '-' : `${stats.cachePercent}`} unit={loading ? '' : '%'} />
        <StatCard label="AI 토큰 (7일)" value={loading ? '-' : (stats.totalTokens ?? 0).toLocaleString()} />
        <StatCard label="AI 요청 (7일)" value={loading ? '-' : `${stats.totalRequests ?? 0}`} unit={loading ? '' : '회'} />
      </HStack>

      <VStack gap={SPACING.s12}>
        <Typo.MD size={14} color="secondary">빠른 액션</Typo.MD>
        <HStack gap={SPACING.s12}>
          <button className={s.quickAction} onClick={() => router.push('/quiz-cache')}>
            <Typo.MD size={14} color="primary">캐시 관리</Typo.MD>
          </button>
          <button className={s.quickAction} onClick={() => router.push('/exam-generate')}>
            <Typo.MD size={14} color="primary">시험 생성</Typo.MD>
          </button>
          <button className={s.quickAction} onClick={() => router.push('/study-quiz')}>
            <Typo.MD size={14} color="primary">퀴즈 테스트</Typo.MD>
          </button>
        </HStack>
      </VStack>
    </VStack>
  );
}
