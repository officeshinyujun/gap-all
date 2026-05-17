'use client';

import { useState, useEffect } from 'react';
import { VStack } from '@/components/general/VStack';
import { HStack } from '@/components/general/HStack';
import Typo from '@/components/general/Typo';
import { SPACING } from '@/constants/spacing';
import { API_BASE_URL } from '@/lib/auth';
import s from './page.module.scss';

const SUBJECTS = [
  { value: 'success', label: '성공적인 직업생활' },
  { value: 'industry', label: '공업 일반' },
];

interface EmbeddingStatus {
  unitNumber: number;
  chunkCount: number;
}

async function apiFetch<T>(path: string, method = 'GET'): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ message: res.statusText }));
    throw new Error(err.message ?? `오류: ${res.status}`);
  }
  return res.json();
}

export default function RagEmbeddingPage() {
  const [subject, setSubject] = useState('success');
  const [status, setStatus] = useState<EmbeddingStatus[]>([]);
  const [loadingStatus, setLoadingStatus] = useState(false);
  const [embeddingUnit, setEmbeddingUnit] = useState<number | 'all' | null>(null);
  const [msg, setMsg] = useState('');

  async function loadStatus() {
    setLoadingStatus(true);
    try {
      const data = await apiFetch<EmbeddingStatus[]>(`/study/${subject}/embedding-status`);
      setStatus(data);
    } catch (err: unknown) {
      setMsg(err instanceof Error ? err.message : '상태 조회 실패');
    } finally {
      setLoadingStatus(false);
    }
  }

  useEffect(() => {
    loadStatus();
  }, [subject]);

  async function handleEmbedUnit(unitNumber: number) {
    setEmbeddingUnit(unitNumber);
    setMsg('');
    try {
      const res = await apiFetch<{ message: string; chunks: number }>(
        `/study/${subject}/${unitNumber}/embed`,
        'POST',
      );
      setMsg(`✅ ${res.message} (${res.chunks}개 청크)`);
      await loadStatus();
    } catch (err: unknown) {
      setMsg(`❌ ${err instanceof Error ? err.message : '임베딩 실패'}`);
    } finally {
      setEmbeddingUnit(null);
    }
  }

  async function handleEmbedAll() {
    setEmbeddingUnit('all');
    setMsg('');
    try {
      const res = await apiFetch<{ message: string; results: { unitNumber: number; chunks: number }[] }>(
        `/study/${subject}/embed-units`,
        'POST',
      );
      const total = res.results.reduce((sum, r) => sum + r.chunks, 0);
      setMsg(`✅ ${res.message} (총 ${total}개 청크, ${res.results.length}개 단원)`);
      await loadStatus();
    } catch (err: unknown) {
      setMsg(`❌ ${err instanceof Error ? err.message : '임베딩 실패'}`);
    } finally {
      setEmbeddingUnit(null);
    }
  }

  const embeddedUnits = new Set(status.map((s) => s.unitNumber));
  const totalChunks = status.reduce((sum, s) => sum + s.chunkCount, 0);

  return (
    <VStack gap={SPACING.s24} fullWidth>
      {/* 헤더 */}
      <VStack gap={SPACING.s6}>
        <Typo.BD size={24} color="primary">RAG 임베딩 관리</Typo.BD>
        <Typo.TH size={12} color="secondary">
          교재를 벡터 DB에 임베딩하여 채팅 RAG 검색에 사용합니다
        </Typo.TH>
      </VStack>

      {/* 과목 선택 + 전체 임베딩 */}
      <div className={s.controlPanel}>
        <HStack gap={SPACING.s16} align="end" wrap="wrap" fullWidth>
          <VStack gap={SPACING.s6}>
            <Typo.MD size={12} color="secondary">과목</Typo.MD>
            <select
              className={s.select}
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            >
              {SUBJECTS.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </VStack>

          <VStack gap={SPACING.s6}>
            <Typo.MD size={12} color="secondary">현황</Typo.MD>
            <Typo.MD size={14} color="primary">
              {embeddedUnits.size} / 20단원 임베딩 완료 · 총 {totalChunks}개 청크
            </Typo.MD>
          </VStack>

          <button
            className={`${s.button} ${s.buttonPrimary}`}
            onClick={handleEmbedAll}
            disabled={embeddingUnit !== null}
          >
            {embeddingUnit === 'all' ? (
              <HStack gap={SPACING.s8} align="center">
                <div className={s.spinner} />
                <span>전체 임베딩 중...</span>
              </HStack>
            ) : '전체 단원 임베딩'}
          </button>
        </HStack>

        {msg && (
          <Typo.MD size={12} color="secondary" style={{ marginTop: SPACING.s10 }}>
            {msg}
          </Typo.MD>
        )}
      </div>

      {/* 단원별 현황 */}
      <div className={s.unitGrid}>
        {Array.from({ length: 20 }, (_, i) => i + 1).map((unitNum) => {
          const unitStatus = status.find((s) => s.unitNumber === unitNum);
          const isEmbedded = embeddedUnits.has(unitNum);
          const isLoading = embeddingUnit === unitNum;

          return (
            <div key={unitNum} className={`${s.unitCard} ${isEmbedded ? s.unitEmbedded : ''}`}>
              <HStack justify="between" align="center" fullWidth>
                <VStack gap={SPACING.s4}>
                  <Typo.MD size={14} color="primary" style={{ fontWeight: 600 }}>
                    {unitNum}단원
                  </Typo.MD>
                  <Typo.MD size={12} color="secondary">
                    {isEmbedded ? `${unitStatus!.chunkCount}개 청크` : '미임베딩'}
                  </Typo.MD>
                </VStack>
                <button
                  className={`${s.button} ${s.buttonSmall} ${isEmbedded ? s.buttonOutline : s.buttonPrimary}`}
                  onClick={() => handleEmbedUnit(unitNum)}
                  disabled={embeddingUnit !== null}
                >
                  {isLoading ? <div className={s.spinnerSmall} /> : isEmbedded ? '재생성' : '생성'}
                </button>
              </HStack>
            </div>
          );
        })}
      </div>

      {loadingStatus && (
        <HStack justify="center" fullWidth>
          <div className={s.spinner} />
        </HStack>
      )}
    </VStack>
  );
}
