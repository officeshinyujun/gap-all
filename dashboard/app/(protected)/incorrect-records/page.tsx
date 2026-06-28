'use client';

import { useState, useEffect, useCallback } from 'react';
import { VStack } from '@/components/general/VStack';
import { HStack } from '@/components/general/HStack';
import Typo from '@/components/general/Typo';
import { SPACING } from '@/constants/spacing';
import { apiFetch } from '@/lib/api';
import s from './page.module.scss';

interface IncorrectRecord {
  id: string;
  targetConcept: string;
  source: string;
  incorrectCount: number;
  consecutiveCorrect: number;
  isGraduated: boolean;
  lastIncorrectAt: string;
  lastReviewedAt: string | null;
  user: { id: string; name: string; email: string };
  subject: { slug: string; title: string };
  unit: { unitNumber: number; title: string };
}

interface Stats {
  total: number;
  graduated: number;
  active: number;
  bySubject: { slug: string; title: string; count: number }[];
  topConcepts: { targetConcept: string; count: number }[];
}

export default function IncorrectRecordsPage() {
  const [records, setRecords] = useState<IncorrectRecord[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subjectFilter, setSubjectFilter] = useState('');
  const [graduatedFilter, setGraduatedFilter] = useState('');
  const [offset, setOffset] = useState(0);
  const limit = 50;

  const clearError = useCallback(() => setError(null), []);

  const loadStats = useCallback(async () => {
    try {
      const data = await apiFetch<Stats>('/admin/incorrect-records/stats');
      setStats(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '통계 로딩 실패');
    }
  }, []);

  const loadRecords = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (subjectFilter) params.set('subjectSlug', subjectFilter);
      if (graduatedFilter) params.set('isGraduated', graduatedFilter);
      params.set('limit', String(limit));
      params.set('offset', String(offset));
      const data = await apiFetch<IncorrectRecord[]>(
        `/admin/incorrect-records?${params.toString()}`
      );
      setRecords(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : '오답 기록 로딩 실패');
    } finally {
      setLoading(false);
    }
  }, [subjectFilter, graduatedFilter, offset]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    loadRecords();
  }, [loadRecords]);

  const handleSearch = () => {
    setOffset(0);
    loadRecords();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('이 오답 기록을 삭제하시겠습니까?')) return;
    try {
      await apiFetch(`/admin/incorrect-records/${id}`, { method: 'DELETE' });
      setRecords((prev) => prev.filter((r) => r.id !== id));
      loadStats();
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '삭제 실패');
    }
  };

  const handleBulkDelete = async (type: 'all' | 'subject') => {
    const msg =
      type === 'all'
        ? '전체 오답 기록을 삭제하시겠습니까?'
        : `${subjectFilter || '선택된'} 과목의 오답 기록을 삭제하시겠습니까?`;
    if (!confirm(msg)) return;
    try {
      const body: Record<string, string> = {};
      if (type === 'subject' && subjectFilter) body.subjectSlug = subjectFilter;
      await apiFetch('/admin/incorrect-records/bulk', {
        method: 'DELETE',
        body: JSON.stringify(body),
      });
      loadRecords();
      loadStats();
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '일괄 삭제 실패');
    }
  };

  return (
    <VStack gap={SPACING.s24} className={s.page}>
      <Typo.BD size={20}>오답 현황</Typo.BD>

      {error && (
        <div className={s.errorBanner}>
          <Typo.SM size={12} color="wrong">{error}</Typo.SM>
          <button className={s.dismissBtn} onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {stats && (
        <VStack gap={SPACING.s12} fullWidth>
          <HStack gap={SPACING.s12} fullWidth>
            <VStack gap={SPACING.s4} className={s.statCard}>
              <Typo.MD size={12}>총 오답</Typo.MD>
              <Typo.BD size={24}>{stats.total}</Typo.BD>
            </VStack>
            <VStack gap={SPACING.s4} className={s.statCard}>
              <Typo.MD size={12}>졸업 완료</Typo.MD>
              <Typo.BD size={24}>{stats.graduated}</Typo.BD>
            </VStack>
            <VStack gap={SPACING.s4} className={s.statCard}>
              <Typo.MD size={12}>활성</Typo.MD>
              <Typo.BD size={24}>{stats.active}</Typo.BD>
            </VStack>
            <VStack gap={SPACING.s4} className={s.statCard}>
              <Typo.MD size={12}>과목별</Typo.MD>
              <Typo.BD size={24}>{stats.bySubject.length}</Typo.BD>
            </VStack>
          </HStack>

          {stats.topConcepts.length > 0 && (
            <VStack gap={SPACING.s6} className={s.conceptSection}>
              <Typo.MD size={14} color="primary" style={{ fontWeight: 600 }}>최다 오답 개념 TOP 10</Typo.MD>
              <div className={s.conceptBarList}>
                {stats.topConcepts.slice(0, 10).map((c, i) => {
                  const maxCount = stats.topConcepts[0].count;
                  const pct = maxCount > 0 ? (c.count / maxCount) * 100 : 0;
                  return (
                    <div key={c.targetConcept + i} className={s.conceptBarRow}>
                      <span className={s.conceptBarLabel}>
                        <span className={s.conceptBarRank}>{i + 1}</span>
                        {c.targetConcept}
                      </span>
                      <div className={s.conceptBarTrack}>
                        <div className={s.conceptBarFill} style={{ width: `${pct}%` }} />
                      </div>
                      <span className={s.conceptBarCount}>{c.count}회</span>
                    </div>
                  );
                })}
              </div>
            </VStack>
          )}
        </VStack>
      )}

      <HStack gap={SPACING.s8} align="center" className={s.filterBar} fullWidth>
        <select
          className={s.select}
          value={subjectFilter}
          onChange={(e) => setSubjectFilter(e.target.value)}
        >
          <option value="">전체 과목</option>
          {stats?.bySubject.map((sub) => (
            <option key={sub.slug} value={sub.slug}>
              {sub.title}
            </option>
          ))}
        </select>
        <select
          className={s.select}
          value={graduatedFilter}
          onChange={(e) => setGraduatedFilter(e.target.value)}
        >
          <option value="">전체 상태</option>
          <option value="true">졸업</option>
          <option value="false">활성</option>
        </select>
        <button className={s.searchBtn} onClick={handleSearch}>
          검색
        </button>
      </HStack>

      <HStack gap={SPACING.s8}>
        <button className={s.bulkBtn} onClick={() => handleBulkDelete('all')}>
          전체 삭제
        </button>
        <button
          className={s.bulkBtn}
          disabled={!subjectFilter}
          onClick={() => handleBulkDelete('subject')}
        >
          과목별 삭제
        </button>
      </HStack>

      {loading ? (
        <HStack justify="center" fullWidth>
          <div className={s.spinner} />
        </HStack>
      ) : (
        <VStack gap={0} className={s.tableContainer} fullWidth>
          <HStack gap={SPACING.s8} align="center" className={s.tableHeader} fullWidth>
            <span className={s.headerCell} style={{ flex: 1 }}>유저</span>
            <span className={s.headerCell} style={{ flex: 2 }}>개념</span>
            <span className={s.headerCell} style={{ flex: 1 }}>과목</span>
            <span className={s.headerCell} style={{ flex: 1 }}>단원</span>
            <span className={s.headerCell} style={{ flex: 1 }}>출처</span>
            <span className={s.headerCell} style={{ flex: 1 }}>틀린횟수</span>
            <span className={s.headerCell} style={{ flex: 1 }}>연속정답</span>
            <span className={s.headerCell} style={{ flex: 1 }}>졸업</span>
            <span className={s.headerCell} style={{ flex: 1 }}>마지막오답</span>
            <span className={s.headerCell} style={{ flex: 0.5 }}></span>
          </HStack>
          {records.map((r) => (
            <HStack key={r.id} gap={SPACING.s8} align="center" className={s.tableRow} fullWidth>
              <span className={s.cell} style={{ flex: 1 }}>{r.user?.name}</span>
              <span className={s.cell} style={{ flex: 2 }}>{r.targetConcept}</span>
              <span className={s.cell} style={{ flex: 1 }}>{r.subject?.title?.slice(0, 4)}</span>
              <span className={s.cell} style={{ flex: 1 }}>{r.unit?.unitNumber}단원</span>
              <span className={s.cell} style={{ flex: 1 }}>{r.source}</span>
              <span className={s.cell} style={{ flex: 1 }}>{r.incorrectCount}</span>
              <span className={s.cell} style={{ flex: 1 }}>{r.consecutiveCorrect}/3</span>
              <span
                className={`${s.cell} ${r.isGraduated ? s.graduated : ''}`}
                style={{ flex: 1 }}
              >
                {r.isGraduated ? '✅ 졸업' : '❌ 활성'}
              </span>
              <span className={s.cell} style={{ flex: 1 }}>
                {new Date(r.lastIncorrectAt).toLocaleDateString()}
              </span>
              <button className={s.deleteBtn} onClick={() => handleDelete(r.id)}>
                삭제
              </button>
            </HStack>
          ))}
        </VStack>
      )}

      {!loading && records.length >= limit && (
        <HStack gap={SPACING.s8} justify="center" fullWidth>
          <button
            className={s.searchBtn}
            disabled={offset === 0}
            onClick={() => setOffset((o) => Math.max(0, o - limit))}
          >
            이전
          </button>
          <button className={s.searchBtn} onClick={() => setOffset((o) => o + limit)}>
            다음
          </button>
        </HStack>
      )}
    </VStack>
  );
}
