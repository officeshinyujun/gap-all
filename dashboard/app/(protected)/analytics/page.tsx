'use client';

import { useState, useEffect } from 'react';
import { VStack } from '@/components/general/VStack';
import { HStack } from '@/components/general/HStack';
import Typo from '@/components/general/Typo';
import { SPACING } from '@/constants/spacing';
import { API_BASE_URL } from '@/lib/auth';
import s from './page.module.scss';

interface Stats {
  total: number;
  graduated: number;
  active: number;
  bySubject: { slug: string; title: string; count: number }[];
  topConcepts: { targetConcept: string; count: number }[];
}

interface QuizEntry {
  timestamp: number;
  mode: string;
  subject: string;
  unit: number;
  correct: number;
  total: number;
  percent: number;
}

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<Stats | null>(null);
  const [quizHistory, setQuizHistory] = useState<QuizEntry[]>([]);

  useEffect(() => {
    Promise.all([
      fetch(`${API_BASE_URL}/admin/incorrect-records/stats`, { credentials: 'include' }).then(r => r.json()),
    ]).then(([statsData]) => {
      setStats(statsData);
      setLoading(false);
    }).catch(() => setLoading(false));

    try {
      const raw = localStorage.getItem('gap_quiz_history');
      if (raw) setQuizHistory(JSON.parse(raw) as QuizEntry[]);
    } catch {}
  }, []);

  const recentHistory = quizHistory.slice(0, 10);
  const avgPercent = quizHistory.length > 0
    ? Math.round(quizHistory.reduce((s, h) => s + h.percent, 0) / quizHistory.length)
    : 0;

  const modeCounts = quizHistory.reduce<Record<string, number>>((acc, h) => {
    acc[h.mode] = (acc[h.mode] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <VStack gap={SPACING.s24} className={s.page}>
      <Typo.BD size={20} color="primary">학습 분석</Typo.BD>

      <div className={s.grid2}>
        {/* 오답 통계 */}
        <VStack gap={SPACING.s12} className={s.card}>
          <Typo.MD size={14} color="primary" style={{ fontWeight: 600 }}>오답 현황</Typo.MD>
          {loading ? (
            <Typo.TH size={12} color="secondary">로딩 중...</Typo.TH>
          ) : stats ? (
            <VStack gap={SPACING.s8}>
              <div className={s.statRow}>
                <span className={s.statLabel}>총 오답</span>
                <span className={s.statValue}>{stats.total}</span>
              </div>
              <div className={s.statRow}>
                <span className={s.statLabel}>졸업</span>
                <span className={s.statValue}>{stats.graduated}</span>
              </div>
              <div className={s.statRow}>
                <span className={s.statLabel}>활성</span>
                <span className={s.statValue}>{stats.active}</span>
              </div>
              {stats.bySubject.map((sub) => (
                <div key={sub.slug} className={s.statRow}>
                  <span className={s.statLabel}>{sub.title}</span>
                  <span className={s.statValue}>{sub.count}개</span>
                </div>
              ))}
            </VStack>
          ) : (
            <Typo.TH size={12} color="secondary">데이터 없음</Typo.TH>
          )}
        </VStack>

        {/* 퀴즈 통계 */}
        <VStack gap={SPACING.s12} className={s.card}>
          <Typo.MD size={14} color="primary" style={{ fontWeight: 600 }}>퀴즈 활동</Typo.MD>
          {quizHistory.length === 0 ? (
            <Typo.TH size={12} color="secondary">퀴즈 기록 없음</Typo.TH>
          ) : (
            <VStack gap={SPACING.s8}>
              <div className={s.statRow}>
                <span className={s.statLabel}>총 퀴즈</span>
                <span className={s.statValue}>{quizHistory.length}회</span>
              </div>
              <div className={s.statRow}>
                <span className={s.statLabel}>평균 정답률</span>
                <span className={s.statValue}>{avgPercent}%</span>
              </div>
              {Object.entries(modeCounts).map(([mode, count]) => (
                <div key={mode} className={s.statRow}>
                  <span className={s.statLabel}>{mode === 'blank' ? '빈칸' : mode === 'concept' ? '개념' : '실전'}</span>
                  <span className={s.statValue}>{count}회</span>
                </div>
              ))}
            </VStack>
          )}
        </VStack>
      </div>

      {/* 최다 오답 개념 */}
      {stats && stats.topConcepts.length > 0 && (
        <VStack gap={SPACING.s8} className={s.card}>
          <Typo.MD size={14} color="primary" style={{ fontWeight: 600 }}>최다 오답 개념 TOP 10</Typo.MD>
          <div className={s.conceptList}>
            {stats.topConcepts.map((c, i) => {
              const maxCount = stats.topConcepts[0].count;
              const pct = maxCount > 0 ? (c.count / maxCount) * 100 : 0;
              return (
                <div key={c.targetConcept + i} className={s.conceptRow}>
                  <span className={s.conceptRank}>{i + 1}</span>
                  <span className={s.conceptName}>{c.targetConcept}</span>
                  <div className={s.conceptTrack}>
                    <div className={s.conceptFill} style={{ width: `${pct}%` }} />
                  </div>
                  <span className={s.conceptCount}>{c.count}회</span>
                </div>
              );
            })}
          </div>
        </VStack>
      )}

      {/* 최근 퀴즈 */}
      {recentHistory.length > 0 && (
        <VStack gap={SPACING.s8} className={s.card}>
          <Typo.MD size={14} color="primary" style={{ fontWeight: 600 }}>최근 퀴즈 결과 (최대 10개)</Typo.MD>
          <div className={s.historyList}>
            {recentHistory.map((h, i) => {
              const pctClass = h.percent >= 70 ? s.pctHigh : h.percent >= 40 ? s.pctMid : s.pctLow;
              return (
                <div key={`${h.timestamp}-${i}`} className={s.historyRow}>
                  <span className={`${s.historyPct} ${pctClass}`}>{h.percent}%</span>
                  <span className={s.historyMeta}>
                    {h.mode === 'blank' ? '빈칸' : h.mode === 'concept' ? '개념' : '실전'}
                    {' · '}{(h.subject === 'success' ? '성직' : '공일')}{h.unit}단원
                    {' · '}{h.correct}/{h.total}
                  </span>
                  <span className={s.historyDate}>
                    {new Date(h.timestamp).toLocaleDateString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
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
