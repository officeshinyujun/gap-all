'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Typo from '@/components/general/Typo';
import { useAuth } from '@/contexts/AuthContext';
import { apiFetch } from '@/lib/api';
import s from './page.module.scss';

interface AdminExam {
  id: string;
  title: string;
  difficulty: string;
  questionCount: number;
  totalScore: number | null;
  sourceType: string | null;
  createdAt: string;
  subject: { slug: string; title: string } | null;
  user: { id: string; email: string; name: string } | null;
}

export default function AdminExamsPage() {
  const { user, isLoading } = useAuth();
  const [exams, setExams] = useState<AdminExam[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchExams = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setExams(await apiFetch<AdminExam[]>('/admin/exams'));
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoading && user?.role === 'admin') {
      fetchExams();
    }
  }, [isLoading, user, fetchExams]);

  if (isLoading || loading) {
    return <Typo.MD>로딩 중...</Typo.MD>;
  }

  if (user?.role !== 'admin') {
    return <Typo.MD>관리자만 접근할 수 있습니다.</Typo.MD>;
  }

  if (error) {
    return (
      <div>
        <Typo.MD color="red">{error}</Typo.MD>
        <button onClick={fetchExams} style={{ marginTop: 8 }}>재시도</button>
      </div>
    );
  }

  const sourceLabel = (t: string | null) => {
    switch (t) {
      case 'ai_blueprint': return 'AI Blueprint';
      case 'ai': return 'AI';
      case 'reference': return 'Reference';
      case 'simply_reference': return 'Simply Ref';
      default: return t ?? '-';
    }
  };

  return (
    <div>
      <Typo.BD size={20} style={{ marginBottom: 16 }}>시험 생성 내역</Typo.BD>
      <Typo.MD style={{ marginBottom: 12 }}>
        총 {exams.length}개 시험
      </Typo.MD>
      <table className={s.table}>
        <thead>
          <tr>
            <th>사용자</th>
            <th>과목</th>
            <th>시험명</th>
            <th>출처</th>
            <th>난이도</th>
            <th>문항수</th>
            <th>생성일</th>
          </tr>
        </thead>
        <tbody>
          {exams.map((exam) => (
            <tr key={exam.id}>
              <td>
                <div>{exam.user?.name ?? '-'}</div>
                <div style={{ fontSize: 12, color: '#888' }}>{exam.user?.email ?? ''}</div>
              </td>
              <td>{exam.subject?.title ?? '-'}</td>
              <td>{exam.title}</td>
              <td>{sourceLabel(exam.sourceType)}</td>
              <td>{exam.difficulty}</td>
              <td>{exam.questionCount}</td>
              <td>{new Date(exam.createdAt).toLocaleDateString('ko-KR')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
