'use client';

import { useState, useCallback } from 'react';
import { VStack } from '@/components/general/VStack';
import { HStack } from '@/components/general/HStack';
import Typo from '@/components/general/Typo';
import { SPACING } from '@/constants/spacing';
import { QuestionRenderer } from '@/components/exam/QuestionStem/QuestionRenderer';
import { getTemplateLabel } from '@/utils/examParser';
import { apiFetch } from '@/lib/api';
import type { ExamQuestion } from '@/types/examQuestion';
import s from './page.module.scss';

interface RawQuestion {
  id: string;
  targetConcept: string;
  itemType: string;
  difficulty: string;
  recommendedTemplate: string;
  questionStem: string;
  stimulusData: unknown;
  optionsList: string[];
  explanation: unknown;
  correctAnswer?: number;
  subject?: { slug: string; title: string };
  unit?: { unitNumber: number; title: string };
  createdAt: string;
}

function toExamQuestion(raw: RawQuestion): ExamQuestion {
  return {
    metadata: {
      unit_name: raw.unit?.title ?? '',
      target_concept: raw.targetConcept,
      item_type: raw.itemType,
      difficulty: raw.difficulty,
      recommended_template: raw.recommendedTemplate,
    },
    render_ready: {
      question_stem: raw.questionStem,
      stimulus_data: raw.stimulusData ?? {},
      options_list: raw.optionsList ?? [],
      explanation: raw.explanation as string | undefined,
    },
    correct_answer: raw.correctAnswer,
  } as ExamQuestion;
}

const DIFFICULTIES = [
  { value: '', label: '전체' },
  { value: 'LOW', label: '하' },
  { value: 'MIDDLE', label: '중' },
  { value: 'HIGH', label: '상' },
];

const SUBJECTS = [
  { value: '', label: '전체 과목' },
  { value: 'success', label: '성공적인 직업생활' },
  { value: 'industry', label: '공업 일반' },
];

export default function QuestionSearchPage() {
  const [query, setQuery] = useState('');
  const [subjectFilter, setSubjectFilter] = useState('');
  const [diffFilter, setDiffFilter] = useState('');
  const [results, setResults] = useState<RawQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<RawQuestion | null>(null);

  const handleSearch = useCallback(async () => {
    if (!query.trim() && !subjectFilter && !diffFilter) return;
    setLoading(true);
    setSearched(true);
    setSelected(null);
    try {
      const params = new URLSearchParams();
      if (query.trim()) params.set('search', query.trim());
      if (subjectFilter) params.set('subjectSlug', subjectFilter);
      if (diffFilter) params.set('difficulty', diffFilter);
      params.set('limit', '100');
      const data = await apiFetch<RawQuestion[]>(`/admin/questions?${params.toString()}`);
      setResults(data);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [query, subjectFilter, diffFilter]);

  return (
    <VStack gap={SPACING.s20} className={s.page}>
      <Typo.BD size={20} color="primary">스마트 문제 검색</Typo.BD>

      {/* 검색 폼 */}
      <div className={s.searchPanel}>
        <VStack gap={SPACING.s12} fullWidth>
          <input
            className={s.searchInput}
            type="text"
            placeholder="문제, 개념어, 해설 키워드 검색..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <HStack gap={SPACING.s10} align="center" wrap="wrap">
            <select className={s.select} value={subjectFilter} onChange={(e) => setSubjectFilter(e.target.value)}>
              {SUBJECTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select className={s.select} value={diffFilter} onChange={(e) => setDiffFilter(e.target.value)}>
              {DIFFICULTIES.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
            <button className={s.searchBtn} onClick={handleSearch} disabled={loading}>
              {loading ? '검색 중...' : '검색'}
            </button>
          </HStack>
        </VStack>
      </div>

      <HStack gap={0} align="start" fullWidth className={s.body}>
        {/* 결과 목록 */}
        <VStack gap={0} className={s.resultList}>
          {loading && (
            <VStack align="center" justify="center" fullWidth style={{ padding: 24 }}>
              <Typo.TH size={12} color="secondary">검색 중...</Typo.TH>
            </VStack>
          )}
          {!loading && searched && results.length === 0 && (
            <VStack align="center" justify="center" fullWidth style={{ padding: 24 }}>
              <Typo.TH size={12} color="secondary">검색 결과가 없습니다</Typo.TH>
            </VStack>
          )}
          {!loading && results.map((q) => (
            <button
              key={q.id}
              className={`${s.resultItem} ${selected?.id === q.id ? s.resultItemActive : ''}`}
              onClick={() => setSelected(q)}
            >
              <VStack gap={4}>
                <span className={s.resultStem}>{q.questionStem}</span>
                <HStack gap={6} align="center">
                  <span className={s.resultBadge}>{q.difficulty === 'LOW' ? '하' : q.difficulty === 'MIDDLE' ? '중' : '상'}</span>
                  <span className={s.resultMeta}>{q.targetConcept}</span>
                  <span className={s.resultMeta}>{getTemplateLabel(q.recommendedTemplate)}</span>
                </HStack>
              </VStack>
            </button>
          ))}
        </VStack>

        {/* 상세 뷰어 */}
        <VStack gap={0} fullWidth fullHeight className={s.detail}>
          {!selected && (
            <VStack align="center" justify="center" fullWidth fullHeight className={s.emptyState}>
              <Typo.MD size={14} color="secondary">검색 결과에서 문제를 선택하세요</Typo.MD>
            </VStack>
          )}
          {selected && (
            <VStack gap={0} fullWidth fullHeight>
              <HStack gap={8} align="center" fullWidth className={s.selectedHeader}>
                <Typo.SM size={14} color="primary">{selected.targetConcept}</Typo.SM>
                <span className={s.resultBadge}>{selected.difficulty === 'LOW' ? '하' : selected.difficulty === 'MIDDLE' ? '중' : '상'}</span>
                <span className={s.resultMeta}>{selected.unit?.title} ({selected.unit?.unitNumber}단원)</span>
              </HStack>
              <div className={s.selectedQuestion}>
                <QuestionRenderer
                  question={toExamQuestion(selected)}
                  questionNumber={1}
                />
              </div>
            </VStack>
          )}
        </VStack>
      </HStack>
    </VStack>
  );
}
