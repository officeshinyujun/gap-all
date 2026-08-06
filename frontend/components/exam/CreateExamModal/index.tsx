import React, { useEffect, useState } from 'react';
import { VStack } from '@shared/ui/VStack';
import { HStack } from '@shared/ui/HStack';
import { Select } from '@shared/ui/Select';
import { SPACING } from '@shared/constants/spacing';
import { Difficulty } from '@shared/types/exam';
import s from './style.module.scss';
import Typo from '@shared/ui/Typo';
import { API_BASE_URL } from '@shared/lib/auth';
import { fetchSubjectBySlug } from '@/lib/examApi';

type GenerationMode = 'ai_blueprint' | 'simply_reference';

interface CreateExamModalProps {
    isOpen: boolean;
    onClose: () => void;
    subjectName: string;
    onCreated?: (jobId: string, sourceType: GenerationMode) => void;
    defaultStartUnit?: number;
    defaultEndUnit?: number;
}

// subjectName → slug 매핑
const SUBJECT_SLUG_MAP: Record<string, string> = {
    '성공적인 직업생활': 'success',
    '공업 일반': 'industry',
};

// 실제 수능/모의평가 출제 빈도 기반 단원 중요도 (등장 시험 수)
const UNIT_IMPORTANCE: Record<number, number> = {
  1:4, 2:12, 3:10, 4:8, 5:11, 6:11, 7:9, 8:10, 9:9, 10:12,
  11:3, 12:12, 13:4, 14:10, 15:4, 16:7, 17:6, 18:11, 19:10, 20:5,
};

const UNIT_OPTIONS = Array.from({ length: 20 }, (_, i) => {
  const n = i + 1;
  const imp = UNIT_IMPORTANCE[n] ?? 0;
  const stars = imp >= 11 ? '★★★' : imp >= 8 ? '★★' : imp >= 5 ? '★' : '';
  return { label: `${n}단원 ${stars}`, value: n };
});

const SUBJECT_OPTIONS = [
    { label: '성직', value: '성공적인 직업생활' },
    { label: '공일', value: '공업 일반' },
];

const DIFFICULTY_MAP: Record<Difficulty, string> = {
    [Difficulty.LOW]: 'LOW',
    [Difficulty.MIDDLE]: 'MIDDLE',
    [Difficulty.HIGH]: 'HIGH',
    [Difficulty.INTERGRATE]: 'INTERGRATE',
};

export function CreateExamModal({ isOpen, onClose, subjectName, onCreated, defaultStartUnit = 1, defaultEndUnit = 3 }: CreateExamModalProps) {
    const [selectedSubjectName, setSelectedSubjectName] = useState(subjectName);
    const [startUnit, setStartUnit] = useState(defaultStartUnit);
    const [endUnit, setEndUnit] = useState(defaultEndUnit);
    const [difficulty, setDifficulty] = useState<Difficulty>(Difficulty.MIDDLE);
    const [questionCount, setQuestionCount] = useState(20);
    const [prompt, setPrompt] = useState('');
    const [mode, setMode] = useState<GenerationMode>('ai_blueprint');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        setSelectedSubjectName(subjectName);
    }, [subjectName]);

    if (!isOpen) return null;

    async function handleCreate() {
        setLoading(true);
        setError('');
        try {
            const slug = SUBJECT_SLUG_MAP[selectedSubjectName];
            if (!slug) throw new Error('지원하지 않는 과목입니다.');
            const subject = await fetchSubjectBySlug(slug);

            const res = await fetch(`${API_BASE_URL}/exams/jobs`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    subjectId: subject.id,
                    startUnitNum: startUnit,
                    endUnitNum: endUnit,
                    difficulty: DIFFICULTY_MAP[difficulty],
                    questionCount,
                    customPrompt: prompt || undefined,
                    sourceType: mode,
                }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({ message: '생성 실패' }));
                throw new Error(
                    err.code === 'AI_FEATURE_DISABLED'
                        ? 'AI 신규 문항 생성이 아직 활성화되지 않았습니다.'
                        : err.code === 'AI_PROFILE_UNAVAILABLE'
                            ? 'AI 출제 프로파일을 준비하는 중입니다. 잠시 후 다시 시도해주세요.'
                            : err.message ?? '시험 생성에 실패했습니다.',
                );
            }

            const data = await res.json();
            onClose();
            onCreated?.(data.jobId, mode);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : '생성 중 오류가 발생했습니다.');
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className={s.overlay} onClick={onClose}>
            <div className={s.modal} onClick={e => e.stopPropagation()}>
                <VStack gap={SPACING.s24} fullWidth>
                    <VStack gap={SPACING.s8}>
                        <Typo.SM size={24} color="primary">새로운 문제 생성</Typo.SM>
                        <Typo.MD size={14} color="secondary">{selectedSubjectName} 과목의 맞춤형 시험을 생성합니다.</Typo.MD>
                    </VStack>

                        <VStack gap={SPACING.s16} fullWidth>

                        <VStack gap={SPACING.s8} fullWidth>
                            <Typo.MD size={14} color="primary">과목</Typo.MD>
                            <Select
                                value={selectedSubjectName}
                                onChange={(val) => {
                                    if (typeof val === 'string') {
                                        setSelectedSubjectName(val);
                                    }
                                }}
                                options={SUBJECT_OPTIONS}
                            />
                        </VStack>

                        {/* Generation Mode */}
                        <VStack gap={SPACING.s8} fullWidth>
                            <Typo.MD size={14} color="primary">생성 방식</Typo.MD>
                            <Select
                                value={mode}
                                onChange={(val) => setMode(val as GenerationMode)}
                                options={[
                                    { label: 'AI 생성', value: 'ai_blueprint' as const },
                                    { label: '참조 기반', value: 'simply_reference' as const },
                                ]}
                            />
                        </VStack>

                        {/* Range */}
                        <VStack gap={SPACING.s8} fullWidth>
                            <Typo.MD size={14} color="primary">단원 범위</Typo.MD>
                            <HStack gap={SPACING.s10} align="center" fullWidth>
                            <Select
                                value={startUnit}
                                onChange={(val) => {
                                    const newStart = val as number;
                                    setStartUnit(newStart);
                                    if (endUnit < newStart) setEndUnit(newStart);
                                }}
                                options={UNIT_OPTIONS}
                            />
                            <Typo.MD size={14} color="secondary">~</Typo.MD>
                            <Select
                                value={endUnit}
                                onChange={(val) => setEndUnit(val as number)}
                                options={UNIT_OPTIONS.map(o => ({
                                    ...o,
                                    disabled: o.value < startUnit,
                                }))}
                            />
                            </HStack>
                        </VStack>

                        {/* Difficulty & Count */}
                        <HStack gap={SPACING.s16} fullWidth>
                            <VStack gap={SPACING.s8} style={{ flex: 1 }}>
                                <Typo.MD size={14} color="primary">난이도</Typo.MD>
                                <Select
                                    value={difficulty}
                                    onChange={(val) => setDifficulty(val as Difficulty)}
                                    options={[
                                        { label: '낮음 (LOW)', value: Difficulty.LOW },
                                        { label: '중간 (MIDDLE)', value: Difficulty.MIDDLE },
                                        { label: '높음 (HIGH)', value: Difficulty.HIGH },
                                        { label: '통합 (INTERGRATE)', value: Difficulty.INTERGRATE },
                                    ]}
                                />
                            </VStack>
                            <VStack gap={SPACING.s8} style={{ flex: 1 }}>
                                <Typo.MD size={14} color="primary">문항 수</Typo.MD>
                                <input type="number" className={s.input} value={questionCount} onChange={e => setQuestionCount(Number(e.target.value))} min={5} max={20} />
                            </VStack>
                        </HStack>

                        {/* Custom Prompt */}
                        <VStack gap={SPACING.s8} fullWidth>
                            <Typo.MD size={14} color="primary">
                                추가 프롬프트 (선택)
                            </Typo.MD>
                            <textarea
                                className={s.textarea}
                                placeholder="예: 수능 기출 스타일로 출제해줘, 혹은 특정 개념 위주로 내줘"
                                value={prompt}
                                onChange={e => setPrompt(e.target.value)}
                            />
                        </VStack>

                        {error && (
                            <Typo.MD size={12} color="secondary" style={{ color: '#DA7F7F' }}>{error}</Typo.MD>
                        )}
                    </VStack>

                    {/* Actions */}
                    <HStack gap={SPACING.s10} justify="end" fullWidth style={{ marginTop: SPACING.s8 }}>
                        <button className={s.buttonSecondary} onClick={onClose} disabled={loading}>취소</button>
                        <button className={s.buttonPrimary} onClick={handleCreate} disabled={loading}>
                            {loading ? '생성 중...' : '생성하기'}
                        </button>
                    </HStack>
                </VStack>
            </div>
        </div>
    );
}
