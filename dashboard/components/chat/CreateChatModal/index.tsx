'use client';

import { useState, useEffect } from 'react';
import { VStack } from '@/components/general/VStack';
import { HStack } from '@/components/general/HStack';
import Typo from '@/components/general/Typo';
import { apiFetch } from '@/lib/api';
import { SPACING } from '@/constants/spacing';
import s from './style.module.scss';

interface Subject {
  id: string;
  title: string;
  slug: string;
}

interface CreateChatModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: (session: { id: string; title: string }) => void;
}

export function CreateChatModal({ isOpen, onClose, onCreated }: CreateChatModalProps) {
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [subjectId, setSubjectId] = useState('');
  const [title, setTitle] = useState('');
  const [startUnit, setStartUnit] = useState(1);
  const [endUnit, setEndUnit] = useState(20);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    (async () => {
      try {
        const data = await apiFetch<Subject[] | { subjects: Subject[] }>('/subjects');
        const list: Subject[] = Array.isArray(data) ? data : data.subjects ?? [];
        setSubjects(list);
        if (list.length > 0) setSubjectId(list[0].id);
      } catch {
        setError('과목 목록을 불러오지 못했습니다.');
      }
    })();
  }, [isOpen]);

  const handleCreate = async () => {
    if (!subjectId || !title.trim()) {
      setError('과목과 제목을 입력해주세요.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await apiFetch<{ session: { id: string; title: string } }>('/chat/sessions', {
        method: 'POST',
        body: JSON.stringify({ subjectId, title: title.trim(), startUnit, endUnit }),
      });
      onCreated(data.session);
      setTitle('');
      setStartUnit(1);
      setEndUnit(20);
      onClose();
    } catch {
      setError('채팅 세션 생성에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const unitOptions = Array.from({ length: 20 }, (_, i) => i + 1);

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.modal} onClick={(e) => e.stopPropagation()}>
        <VStack gap={SPACING.s24} fullWidth>
          {/* 헤더 */}
          <VStack gap={SPACING.s8}>
            <Typo.SM size={24} color="primary">새 채팅 세션</Typo.SM>
            <Typo.MD size={14} color="secondary">과목과 단원 범위를 설정하고 AI 튜터와 대화하세요.</Typo.MD>
          </VStack>

          <VStack gap={SPACING.s16} fullWidth>
            {/* 제목 */}
            <VStack gap={SPACING.s8} fullWidth>
              <Typo.MD size={14} color="primary">세션 제목</Typo.MD>
              <input
                className={s.input}
                placeholder="예: 1~5단원 복습"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </VStack>

            {/* 과목 */}
            <VStack gap={SPACING.s8} fullWidth>
              <Typo.MD size={14} color="primary">과목</Typo.MD>
              <select
                className={s.select}
                value={subjectId}
                onChange={(e) => setSubjectId(e.target.value)}
              >
                {subjects.map((sub) => (
                  <option key={sub.id} value={sub.id}>
                    {sub.title}
                  </option>
                ))}
              </select>
            </VStack>

            {/* 단원 범위 */}
            <VStack gap={SPACING.s8} fullWidth>
              <Typo.MD size={14} color="primary">단원 범위</Typo.MD>
              <HStack gap={SPACING.s10} align="center" fullWidth>
                <select
                  className={s.select}
                  value={startUnit}
                  onChange={(e) => {
                    const val = Number(e.target.value);
                    setStartUnit(val);
                    if (val > endUnit) setEndUnit(val);
                  }}
                >
                  {unitOptions.map((n) => (
                    <option key={n} value={n}>{n}단원</option>
                  ))}
                </select>
                <Typo.MD size={14} color="secondary">~</Typo.MD>
                <select
                  className={s.select}
                  value={endUnit}
                  onChange={(e) => setEndUnit(Number(e.target.value))}
                >
                  {unitOptions.filter((n) => n >= startUnit).map((n) => (
                    <option key={n} value={n}>{n}단원</option>
                  ))}
                </select>
              </HStack>
            </VStack>

            {error && <Typo.MD size={12} color="secondary" style={{ color: '#DA7F7F' }}>{error}</Typo.MD>}
          </VStack>

          {/* 버튼 */}
          <HStack gap={SPACING.s10} justify="end" fullWidth>
            <button className={s.buttonSecondary} onClick={onClose} disabled={loading}>취소</button>
            <button className={s.buttonPrimary} onClick={handleCreate} disabled={loading}>
              {loading ? '생성 중...' : '시작하기'}
            </button>
          </HStack>
        </VStack>
      </div>
    </div>
  );
}
