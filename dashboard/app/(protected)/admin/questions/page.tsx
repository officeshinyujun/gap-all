'use client';

import { useState, useEffect, useCallback } from 'react';
import { VStack } from '@/components/general/VStack';
import { HStack } from '@/components/general/HStack';
import Typo from '@/components/general/Typo';
import { SPACING } from '@/constants/spacing';
import { apiFetch } from '@/lib/api';
import s from './page.module.scss';

const PAGE_SIZE = 50;

interface Question {
  id: string;
  targetConcept: string;
  itemType: string;
  difficulty: string;
  recommendedTemplate: string;
  questionStem: string;
  createdAt: string;
  subject: { slug: string; title: string };
  unit: { unitNumber: number; title: string };
}

interface Stats {
  total: number;
  bySubject: { slug: string; title: string; count: number }[];
  byDifficulty: { difficulty: string; count: number }[];
}

const DIFF_LABEL: Record<string, string> = {
  LOW: '하',
  MIDDLE: '중',
  HIGH: '상',
  SUPER: '극상',
};

export default function AdminQuestionsPage() {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);

  const [subjectSlug, setSubjectSlug] = useState('');
  const [unitNumber, setUnitNumber] = useState('');
  const [difficulty, setDifficulty] = useState('');

  const fetchStats = useCallback(async () => {
    try {
      setStats(await apiFetch<Stats>('/admin/questions/stats'));
    } catch {}
  }, []);

  const fetchQuestions = useCallback(async (newOffset = 0) => {
    setLoading(true);
    const params = new URLSearchParams();
    if (subjectSlug) params.set('subjectSlug', subjectSlug);
    if (unitNumber) params.set('unitNumber', unitNumber);
    if (difficulty) params.set('difficulty', difficulty);
    params.set('limit', String(PAGE_SIZE));
    params.set('offset', String(newOffset));

    try {
      const data = await apiFetch<{ items: Question[]; total: number }>(`/admin/questions?${params}`);
      setQuestions(data.items ?? []);
      setTotal(data.total ?? 0);
      setOffset(newOffset);
    } catch {}
    setLoading(false);
  }, [subjectSlug, unitNumber, difficulty]);

  useEffect(() => {
    fetchStats();
    fetchQuestions(0);
  }, []);

  const handleSearch = () => {
    fetchQuestions(0);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return;
    try {
      await apiFetch(`/admin/questions/${id}`, { method: 'DELETE' });
      fetchQuestions(offset);
      fetchStats();
    } catch {}
  };

  const handlePrev = () => {
    if (offset > 0) fetchQuestions(Math.max(0, offset - PAGE_SIZE));
  };

  const handleNext = () => {
    if (offset + PAGE_SIZE < total) fetchQuestions(offset + PAGE_SIZE);
  };

  return (
    <VStack className={s.page} fullWidth>
      <HStack gap={SPACING.s16} align="center" className={s.header} fullWidth>
        <Typo.BD size={20}>Question DB</Typo.BD>
      </HStack>

      <VStack gap={SPACING.s16} className={s.body} fullWidth>
        {stats && (
          <HStack gap={SPACING.s12} fullWidth>
            <div className={s.statCard}>
              <Typo.SM size={12} color="secondary">전체 문항</Typo.SM>
              <Typo.BD size={24}>{stats.total}</Typo.BD>
            </div>
            {stats.bySubject.map((sub) => (
              <div key={sub.slug} className={s.statCard}>
                <Typo.SM size={12} color="secondary">{sub.title}</Typo.SM>
                <Typo.BD size={24}>{sub.count}</Typo.BD>
              </div>
            ))}
            {stats.byDifficulty.map((d) => (
              <div key={d.difficulty} className={s.statCard}>
                <Typo.SM size={12} color="secondary">{DIFF_LABEL[d.difficulty] ?? d.difficulty}</Typo.SM>
                <Typo.BD size={24}>{d.count}</Typo.BD>
              </div>
            ))}
          </HStack>
        )}

        <HStack gap={SPACING.s8} align="center" className={s.filterBar} fullWidth>
          <select
            className={s.select}
            value={subjectSlug}
            onChange={(e) => setSubjectSlug(e.target.value)}
          >
            <option value="">전체 과목</option>
            {stats?.bySubject.map((sub) => (
              <option key={sub.slug} value={sub.slug}>{sub.title}</option>
            ))}
          </select>
          <input
            className={s.select}
            type="number"
            placeholder="단원 번호"
            value={unitNumber}
            onChange={(e) => setUnitNumber(e.target.value)}
          />
          <select
            className={s.select}
            value={difficulty}
            onChange={(e) => setDifficulty(e.target.value)}
          >
            <option value="">전체 난이도</option>
            <option value="LOW">하</option>
            <option value="MIDDLE">중</option>
            <option value="HIGH">상</option>
            <option value="SUPER">극상</option>
          </select>
          <button className={s.paginationBtn} onClick={handleSearch}>검색</button>
        </HStack>

        <VStack className={s.tableWrap} fullWidth>
          <HStack gap={SPACING.s8} align="center" className={s.tableHeader} fullWidth>
            <span className={s.cell} style={{ flex: 2 }}>개념</span>
            <span className={s.cell} style={{ flex: 1 }}>단원</span>
            <span className={s.cell} style={{ flex: 1 }}>난이도</span>
            <span className={s.cell} style={{ flex: 1 }}>유형</span>
            <span className={s.cell} style={{ flex: 1 }}>템플릿</span>
            <span className={s.cell} style={{ flex: 1 }}>생성일</span>
            <span className={s.cell} style={{ flex: 0.5 }}>삭제</span>
          </HStack>

          {loading ? (
            <VStack align="center" justify="center" style={{ padding: 40 }}>
              <Typo.SM color="secondary">로딩 중...</Typo.SM>
            </VStack>
          ) : questions.length === 0 ? (
            <VStack align="center" justify="center" style={{ padding: 40 }}>
              <Typo.SM color="secondary">문항이 없습니다</Typo.SM>
            </VStack>
          ) : (
            questions.map((q) => (
              <HStack key={q.id} gap={SPACING.s8} align="center" className={s.tableRow} fullWidth>
                <span className={s.cell} style={{ flex: 2 }}>{q.targetConcept}</span>
                <span className={s.cell} style={{ flex: 1 }}>{q.unit?.unitNumber}단원</span>
                <span className={s.cell} style={{ flex: 1 }}>{DIFF_LABEL[q.difficulty] ?? q.difficulty}</span>
                <span className={s.cell} style={{ flex: 1 }}>{q.itemType}</span>
                <span className={s.cell} style={{ flex: 1 }}>{q.recommendedTemplate?.replace('TPL_', '')}</span>
                <span className={s.cell} style={{ flex: 1 }}>{new Date(q.createdAt).toLocaleDateString()}</span>
                <button className={s.deleteBtn} onClick={() => handleDelete(q.id)}>삭제</button>
              </HStack>
            ))
          )}
        </VStack>

        <HStack gap={SPACING.s12} align="center" justify="center" className={s.pagination} fullWidth>
          <button className={s.paginationBtn} onClick={handlePrev} disabled={offset === 0}>
            이전
          </button>
          <Typo.SM size={12} color="secondary">
            {total}개 중 {offset + 1}-{Math.min(offset + PAGE_SIZE, total)}
          </Typo.SM>
          <button className={s.paginationBtn} onClick={handleNext} disabled={offset + PAGE_SIZE >= total}>
            다음
          </button>
        </HStack>
      </VStack>
    </VStack>
  );
}
