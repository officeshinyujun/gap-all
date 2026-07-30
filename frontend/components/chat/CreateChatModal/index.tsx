'use client';

import { useState, useEffect } from 'react';
import { VStack } from '@shared/ui/VStack';
import { HStack } from '@shared/ui/HStack';
import { Select } from '@shared/ui/Select';
import Typo from '@shared/ui/Typo';
import { SPACING } from '@shared/constants/spacing';
import { API_BASE_URL } from '@shared/lib/auth';
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
    fetch(`${API_BASE_URL}/subjects`, {
      credentials: 'include',
    })
      .then((r) => r.json())
      .then((data) => {
        const list: Subject[] = Array.isArray(data) ? data : data.subjects ?? [];
        setSubjects(list);
        if (list.length > 0) setSubjectId(list[0].id);
      })
      .catch(() => setError('과목 목록을 불러오지 못했습니다.'));
  }, [isOpen]);

  const handleCreate = async () => {
    if (!subjectId || !title.trim()) {
      setError('과목과 제목을 입력해주세요.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_BASE_URL}/chat/sessions`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ subjectId, title: title.trim(), startUnit, endUnit }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
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

  const unitOptions = Array.from({ length: 20 }, (_, i) => ({ label: `${i + 1}단원`, value: i + 1 }));

  return (
    <div className={s.overlay} onClick={onClose}>
      <div className={s.modal} onClick={(e) => e.stopPropagation()}>
        <VStack gap={SPACING.s24} fullWidth>
          <VStack gap={SPACING.s8}>
            <Typo.SM size={24} color="primary">새 채팅 시작</Typo.SM>
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
              <Select
                value={subjectId}
                onChange={(val) => setSubjectId(val as string)}
                options={subjects.map((s) => ({ label: s.title, value: s.id }))}
              />
            </VStack>

            {/* 단원 범위 */}
            <VStack gap={SPACING.s8} fullWidth>
              <Typo.MD size={14} color="primary">단원 범위</Typo.MD>
              <HStack gap={SPACING.s10} align="center" fullWidth>
                <Select
                  value={startUnit}
                  onChange={(val) => {
                    const n = val as number;
                    setStartUnit(n);
                    if (n > endUnit) setEndUnit(n);
                  }}
                  options={unitOptions}
                />
                <Typo.MD size={14} color="secondary">~</Typo.MD>
                <Select
                  value={endUnit}
                  onChange={(val) => setEndUnit(val as number)}
                  options={unitOptions.map((o) => ({ ...o, disabled: o.value < startUnit }))}
                />
              </HStack>
            </VStack>

            {error && (
              <Typo.MD size={12} className={s.error}>{error}</Typo.MD>
            )}
          </VStack>

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
