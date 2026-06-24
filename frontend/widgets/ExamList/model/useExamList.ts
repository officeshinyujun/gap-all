'use client';

import { useState, useEffect } from 'react';
import { fetchExams, fetchSubjectBySlug } from '@entities/exam/api/examApi';
import type { ExamListItem, ExamJobStatus } from '@entities/exam/model/types';
import { useJobPolling } from '@features/exam-generation/model/useJobPolling';

export interface ProblemItem {
  id: string;
  range: string;
  diff: string;
  count: number;
  score: string;
  description: string;
  tags: string[];
  createdAt?: string;
}

const DIFFICULTY_LABEL: Record<string, string> = {
  LOW: '낮음', MIDDLE: '중간', HIGH: '높음', INTERGRATE: '통합',
};

function examToItem(exam: ExamListItem): ProblemItem {
  const range = exam.startUnitNum === exam.endUnitNum
    ? `${exam.startUnitNum}단원`
    : `${exam.startUnitNum}단원~${exam.endUnitNum}단원`;
  return {
    id: exam.id,
    range,
    diff: DIFFICULTY_LABEL[exam.difficulty] ?? exam.difficulty,
    count: exam.questionCount,
    score: exam.totalScore != null ? `${exam.totalScore}점` : '미채점',
    description: exam.title,
    tags: exam.tags?.map((t) => t.tagName) ?? [],
    createdAt: exam.createdAt,
  };
}

export function useExamList(subject: string, onComplete: () => void) {
  const [items, setItems] = useState<ProblemItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<ProblemItem | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const { activeJobId, jobStatus, startJob, dismissJob } = useJobPolling(onComplete);

  function loadExams() {
    setLoading(true);
    fetchExams(subject)
      .then((exams) => {
        const mapped = exams.map(examToItem);
        setItems(mapped);
        setSelectedItem(mapped[0] ?? null);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => { loadExams(); }, [subject]);

  const filteredItems = items.filter((item) => {
    if (!searchQuery.trim()) return true;
    const unitNum = parseInt(searchQuery, 10);
    if (isNaN(unitNum)) return false;
    const match = item.range.match(/(\d+)단원/);
    if (!match) return false;
    const rangeMatch = item.range.match(/(\d+)단원~(\d+)단원/);
    if (rangeMatch) {
      const [, start, end] = rangeMatch.map(Number);
      return unitNum >= start && unitNum <= end;
    }
    return parseInt(match[1]) === unitNum;
  });

  return {
    items, filteredItems, loading, selectedItem, setSelectedItem,
    searchQuery, setSearchQuery, isModalOpen, setIsModalOpen,
    activeJobId, jobStatus, startJob, dismissJob, loadExams,
  };
}
