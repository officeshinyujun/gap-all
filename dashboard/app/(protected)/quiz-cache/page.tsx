'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { VStack } from '@/components/general/VStack';
import { HStack } from '@/components/general/HStack';
import Typo from '@/components/general/Typo';
import { SPACING } from '@/constants/spacing';
import { apiFetch } from '@/lib/api';
import s from './page.module.scss';

type CacheUnit = {
  unitNumber: number;
  blank10: number | null;
  blank20: number | null;
  concept10: number | null;
  concept20: number | null;
};

type CacheSubject = {
  slug: string;
  title: string;
  units: CacheUnit[];
};

type RegenStatus = {
  status: 'idle' | 'running' | 'completed';
  completed: number;
  total: number;
  errors: string[];
};

function CacheCell({ value }: { value: number | null }) {
  if (value === null) return <span className={s.cellEmpty}>❌</span>;
  return <span className={s.cellFilled}>✅ {value}개</span>;
}

export default function QuizCachePage() {
  const [subjects, setSubjects] = useState<CacheSubject[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedSubject, setSelectedSubject] = useState('');
  const [selectedUnits, setSelectedUnits] = useState<number[]>([]);
  const [regenStatus, setRegenStatus] = useState<RegenStatus>({
    status: 'idle',
    completed: 0,
    total: 0,
    errors: [],
  });
  const [actionLoading, setActionLoading] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadCacheStatus = useCallback(async () => {
    setLoading(true);
    try {
      const data = await apiFetch<{ subjects: CacheSubject[] }>('/study/cache-status');
      setSubjects(data.subjects);
      if (!selectedSubject && data.subjects.length > 0) {
        setSelectedSubject(data.subjects[0].slug);
      }
    } catch {
    } finally {
      setLoading(false);
    }
  }, [selectedSubject]);

  useEffect(() => {
    loadCacheStatus();
  }, [loadCacheStatus]);

  useEffect(() => {
    if (regenStatus.status === 'running') {
      pollRef.current = setInterval(async () => {
        try {
          const data = await apiFetch<RegenStatus>('/study/cache-regenerate-status');
          setRegenStatus(data);
          if (data.status !== 'running') {
            if (pollRef.current) clearInterval(pollRef.current);
            loadCacheStatus();
          }
        } catch {
          if (pollRef.current) clearInterval(pollRef.current);
        }

      }, 2000);
    }
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [regenStatus.status, loadCacheStatus]);

  const currentSubject = subjects.find((sub) => sub.slug === selectedSubject);

  const allSelected =
    currentSubject && currentSubject.units.length > 0 &&
    currentSubject.units.every((u) => selectedUnits.includes(u.unitNumber));

  function toggleUnit(unitNumber: number) {
    setSelectedUnits((prev) =>
      prev.includes(unitNumber)
        ? prev.filter((n) => n !== unitNumber)
        : [...prev, unitNumber],
    );
  }

  function toggleAll() {
    if (!currentSubject) return;
    if (allSelected) {
      setSelectedUnits([]);
    } else {
      setSelectedUnits(currentSubject.units.map((u) => u.unitNumber));
    }
  }

  async function handleDeleteUnit(unitNumber: number) {
    setActionLoading(true);
    try {
      await apiFetch('/study/cache-bulk', {
        method: 'DELETE',
        body: JSON.stringify({ subjectSlug: selectedSubject, unitNumbers: [unitNumber] }),
      });
      await loadCacheStatus();
    } catch {
    } finally {
      setActionLoading(false);
    }
  }

  async function handleBulkDelete() {
    if (selectedUnits.length === 0) return;
    setActionLoading(true);
    try {
      await apiFetch('/study/cache-bulk', {
        method: 'DELETE',
        body: JSON.stringify({ subjectSlug: selectedSubject, unitNumbers: selectedUnits }),
      });
      setSelectedUnits([]);
      await loadCacheStatus();
    } catch {
    } finally {
      setActionLoading(false);
    }
  }

  async function handleBulkRegenerate() {
    if (selectedUnits.length === 0) return;
    setActionLoading(true);
    try {
      await apiFetch('/study/cache-regenerate', {
        method: 'POST',
        body: JSON.stringify({ subjectSlug: selectedSubject, unitNumbers: selectedUnits }),
      });
      setRegenStatus({ status: 'running', completed: 0, total: selectedUnits.length, errors: [] });
      setSelectedUnits([]);
    } catch {
    } finally {
      setActionLoading(false);
    }
  }

  if (loading) {
    return (
      <VStack gap={SPACING.s16} align="center" style={{ padding: SPACING.s32 }}>
        <div className={s.spinner} />
        <Typo.MD size={14} color="secondary">캐시 상태 불러오는 중...</Typo.MD>
      </VStack>
    );
  }

  return (
    <VStack gap={SPACING.s20} className={s.page}>
      <HStack gap={SPACING.s12} align="center" justify="between" fullWidth>
        <Typo.BD size={20} color="primary">퀴즈 캐시 관리</Typo.BD>
        <a href="/rag-embedding" className={s.embeddingLink}>
          RAG 임베딩 관리 →
        </a>
      </HStack>

      <HStack gap={SPACING.s8} align="center">
        {subjects.map((sub) => (
          <button
            key={sub.slug}
            className={`${s.subjectTab} ${selectedSubject === sub.slug ? s.subjectTabActive : ''}`}
            onClick={() => {
              setSelectedSubject(sub.slug);
              setSelectedUnits([]);
            }}
          >
            <Typo.MD size={14} color={selectedSubject === sub.slug ? 'white' : 'primary'}>
              {sub.title}
            </Typo.MD>
          </button>
        ))}
      </HStack>

      {selectedUnits.length > 0 && (
        <HStack gap={SPACING.s8} align="center">
          <button
            className={s.dangerButton}
            onClick={handleBulkDelete}
            disabled={actionLoading}
          >
            <Typo.MD size={12} color="wrong">선택 삭제 ({selectedUnits.length})</Typo.MD>
          </button>
          <button
            className={s.actionButton}
            onClick={handleBulkRegenerate}
            disabled={actionLoading}
          >
            <Typo.MD size={12} color="primary">선택 재생성 ({selectedUnits.length})</Typo.MD>
          </button>
        </HStack>
      )}

      {regenStatus.status === 'running' && (
        <VStack gap={SPACING.s8} className={s.progressSection}>
          <HStack gap={SPACING.s8} align="center">
            <Typo.MD size={12} color="secondary">
              재생성 진행 중: {regenStatus.completed}/{regenStatus.total}
            </Typo.MD>
          </HStack>
          <div className={s.progressBar}>
            <div
              className={s.progressFill}
              style={{ width: `${regenStatus.total > 0 ? (regenStatus.completed / regenStatus.total) * 100 : 0}%` }}
            />
          </div>
          {regenStatus.errors.length > 0 && (
            <Typo.MD size={12} color="wrong">
              오류: {regenStatus.errors.join(', ')}
            </Typo.MD>
          )}
        </VStack>
      )}

      {regenStatus.status === 'completed' && (
        <HStack gap={SPACING.s8} align="center">
          <Typo.MD size={12} color="correct">
            ✅ 재생성 완료 ({regenStatus.completed}/{regenStatus.total})
          </Typo.MD>
          <button
            className={s.actionButton}
            onClick={() => setRegenStatus({ status: 'idle', completed: 0, total: 0, errors: [] })}
          >
            <Typo.MD size={12} color="secondary">닫기</Typo.MD>
          </button>
        </HStack>
      )}

      {currentSubject && (
        <VStack gap={0} className={s.gridContainer}>
          <HStack gap={SPACING.s8} align="center" className={s.gridHeader} fullWidth>
            <input
              type="checkbox"
              checked={!!allSelected}
              onChange={toggleAll}
              className={s.selectAll}
            />
            <Typo.MD size={12} color="secondary" style={{ width: 80 }}>단원</Typo.MD>
            <Typo.MD size={12} color="secondary" style={{ width: 80, textAlign: 'center' }}>빈칸(10)</Typo.MD>
            <Typo.MD size={12} color="secondary" style={{ width: 80, textAlign: 'center' }}>빈칸(20)</Typo.MD>
            <Typo.MD size={12} color="secondary" style={{ width: 80, textAlign: 'center' }}>양방향(10)</Typo.MD>
            <Typo.MD size={12} color="secondary" style={{ width: 80, textAlign: 'center' }}>양방향(20)</Typo.MD>
            <Typo.MD size={12} color="secondary" style={{ width: 60, textAlign: 'center' }}>액션</Typo.MD>
          </HStack>

          {currentSubject.units.map((unit) => (
            <HStack
              key={unit.unitNumber}
              gap={SPACING.s8}
              align="center"
              className={s.gridRow}
              fullWidth
            >
              <input
                type="checkbox"
                checked={selectedUnits.includes(unit.unitNumber)}
                onChange={() => toggleUnit(unit.unitNumber)}
              />
              <Typo.MD size={14} color="primary" style={{ width: 80 }}>
                {unit.unitNumber}단원
              </Typo.MD>
              <CacheCell value={unit.blank10} />
              <CacheCell value={unit.blank20} />
              <CacheCell value={unit.concept10} />
              <CacheCell value={unit.concept20} />
              <button
                className={s.deleteButton}
                onClick={() => handleDeleteUnit(unit.unitNumber)}
                disabled={actionLoading}
              >
                <Typo.MD size={12} color="wrong">삭제</Typo.MD>
              </button>
            </HStack>
          ))}
        </VStack>
      )}
    </VStack>
  );
}
