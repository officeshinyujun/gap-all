'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { VStack } from '@/components/general/VStack';
import { HStack } from '@/components/general/HStack';
import Typo from '@/components/general/Typo';
import { SPACING } from '@/constants/spacing';
import { apiFetch } from '@/lib/api';
import s from './page.module.scss';

interface Stats {
  userCount: number;
  examCount: number;
  cachePercent: number;
  incorrectCount: number;
  totalTokens: number;
  totalRequests: number;
}

interface QuizHistoryEntry {
  timestamp: number;
  mode: string;
  subject: string;
  unit: number;
  correct: number;
  total: number;
  percent: number;
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
  const [recentQuizzes, setRecentQuizzes] = useState<QuizHistoryEntry[]>([]);

  useEffect(() => {
    Promise.allSettled([
      apiFetch<unknown[]>('/admin/users'),
      apiFetch<unknown[]>('/exams'),
      apiFetch<{ subjects: { units: Record<string, unknown>[] }[] }>('/study/cache-status'),
      apiFetch<{ db: { totalTokens: number; nRequests: number }[] }>('/admin/openai-usage'),
      apiFetch<{ total: number }>('/admin/incorrect-records/stats'),
    ]).then(([usersRes, examsRes, cacheRes, usageRes, incorrectRes]) => {
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

      const incorrectCount = incorrectRes.status === 'fulfilled' ? (incorrectRes.value?.total ?? 0) : 0;

      setStats({ userCount, examCount, cachePercent, incorrectCount, totalTokens, totalRequests });
      setLoading(false);
    });

    try {
      const raw = localStorage.getItem('gap_quiz_history');
      if (raw) setRecentQuizzes(JSON.parse(raw).slice(0, 5));
    } catch {}
  }, []);

  const actions = [
    { label: '캐시 관리', path: '/quiz-cache', icon: '⚡' },
    { label: '시험 생성', path: '/exam-generate', icon: '📝' },
    { label: '퀴즈 테스트', path: '/study-quiz', icon: '📖' },
    { label: '오답 현황', path: '/incorrect-records', icon: '❌' },
    { label: '시험 목록', path: '/exam-list', icon: '📋' },
  ];

  const adminActions = [
    { label: '유저 관리', path: '/admin/users' },
    { label: '학습 진척도', path: '/admin/progress' },
    { label: 'API 사용량', path: '/admin/usage' },
    { label: '문항 DB', path: '/admin/questions' },
  ];

  return (
    <VStack gap={SPACING.s24} className={s.page}>
      <VStack gap={SPACING.s8}>
        <Typo.BD size={24} color="primary">안녕하세요, {user?.name ?? ''}님</Typo.BD>
        <Typo.TH size={14} color="secondary">GAP Admin Dashboard</Typo.TH>
      </VStack>

      {/* 통계 */}
      <div className={s.statsGrid}>
        <StatCard label="총 유저" value={loading ? '-' : `${stats.userCount}`} unit="명" />
        <StatCard label="총 시험" value={loading ? '-' : `${stats.examCount}`} unit="개" />
        <StatCard label="캐시 커버리지" value={loading ? '-' : `${stats.cachePercent}`} unit="%" />
        <StatCard label="AI 토큰 (7일)" value={loading ? '-' : (stats.totalTokens ?? 0).toLocaleString()} />
        <StatCard label="AI 요청 (7일)" value={loading ? '-' : `${stats.totalRequests ?? 0}`} unit="회" />
        <StatCard label="오답 기록" value={loading ? '-' : `${stats.incorrectCount}`} unit="개" />
      </div>

      {/* 빠른 액션 */}
      <VStack gap={SPACING.s12}>
        <Typo.MD size={14} color="primary" style={{ fontWeight: 600 }}>빠른 액션</Typo.MD>
        <div className={s.actionGrid}>
          {actions.map((a) => (
            <button key={a.path} className={s.quickAction} onClick={() => router.push(a.path)}>
              <span className={s.actionIcon}>{a.icon}</span>
              <Typo.MD size={14} color="primary">{a.label}</Typo.MD>
            </button>
          ))}
        </div>
      </VStack>

      {/* Admin */}
      <VStack gap={SPACING.s12}>
        <Typo.MD size={14} color="primary" style={{ fontWeight: 600 }}>Admin</Typo.MD>
        <div className={s.actionGrid}>
          {adminActions.map((a) => (
            <button key={a.path} className={s.quickAction} onClick={() => router.push(a.path)}>
              <Typo.MD size={14} color="primary">{a.label}</Typo.MD>
            </button>
          ))}
        </div>
      </VStack>

      {/* 최근 퀴즈 */}
      {recentQuizzes.length > 0 && (
        <VStack gap={SPACING.s8}>
          <Typo.MD size={14} color="primary" style={{ fontWeight: 600 }}>최근 퀴즈 기록</Typo.MD>
          <div className={s.quizHistoryWidget}>
            {recentQuizzes.map((h, i) => {
              const pctClass = h.percent >= 70 ? s.pctHigh : h.percent >= 40 ? s.pctMid : s.pctLow;
              return (
                <div key={`${h.timestamp}-${i}`} className={s.quizHistoryRow}>
                  <span className={`${s.quizPct} ${pctClass}`}>{h.percent}%</span>
                  <span className={s.quizMeta}>
                    {h.mode === 'blank' ? '빈칸' : h.mode === 'concept' ? '개념' : '실전'}
                    {' · '}{(h.subject === 'success' ? '성직' : '공일')}{h.unit}단원
                    {' · '}{h.correct}/{h.total}
                  </span>
                  <span className={s.quizDate}>
                    {new Date(h.timestamp).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit' })}
                  </span>
                </div>
              );
            })}
          </div>
        </VStack>
      )}
    </VStack>
  );
}
