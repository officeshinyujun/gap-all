'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { VStack } from '@/components/general/VStack';
import { HStack } from '@/components/general/HStack';
import Typo from '@/components/general/Typo';
import { useAuth } from '@/contexts/AuthContext';
import { API_BASE_URL } from '@/lib/auth';
import s from './page.module.scss';

interface UserProgressSummary {
  id: string;
  name: string;
  email: string;
  role: string;
  totalProgress: number;
  completedProgress: number;
}

interface ProgressDetail {
  id: string;
  unitNumber: number;
  unitTitle: string;
  subjectTitle: string;
  studyMode: string;
  progressPercent: number;
  lastStudiedAt: string;
}

const STUDY_MODE_LABEL: Record<string, string> = {
  BASIC_CONCEPT: '기초 개념',
  BLANK_FILL: '빈칸 문제',
  INTERACTIVE_QUIZ: '양방향 개념',
  PRACTICE_EXAM: '실전 문제',
  REVIEW_INCORRECT: '오답 재풀이',
};

export default function AdminProgressPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<UserProgressSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [details, setDetails] = useState<ProgressDetail[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [confirmReset, setConfirmReset] = useState<UserProgressSummary | null>(null);
  const [resetting, setResetting] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/progress`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('진척도 목록 조회 실패');
      setUsers(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoading && user) {
      if (user.role !== 'admin') { router.replace('/'); return; }
      void fetchUsers();
    }
  }, [isLoading, user, router, fetchUsers]);

  async function loadDetail(userId: string) {
    setSelectedUserId(userId);
    setDetailLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/progress/${userId}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('상세 조회 실패');
      const data = await res.json();
      setDetails(data.progress ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : '상세 조회 실패');
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleReset() {
    if (!confirmReset) return;
    setResetting(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/progress/${confirmReset.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('초기화 실패');
      setUsers((prev) => prev.map((u) =>
        u.id === confirmReset.id ? { ...u, totalProgress: 0, completedProgress: 0 } : u
      ));
      if (selectedUserId === confirmReset.id) setDetails([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : '초기화 실패');
    } finally {
      setResetting(false);
      setConfirmReset(null);
    }
  }

  if (isLoading || loading) return (
    <VStack gap={16} align="center" justify="center" fullWidth fullHeight>
      <div className={s.spinner} />
    </VStack>
  );

  const selectedUser = users.find((u) => u.id === selectedUserId);

  return (
    <VStack gap={20} fullWidth className={s.page}>
      <HStack gap={0} align="center" justify="between" fullWidth>
        <VStack gap={4}>
          <Typo.BD size={20} color="primary">학습 진척도 관리</Typo.BD>
          <Typo.TH size={12} color="secondary">유저별 학습 진척도를 조회하고 초기화합니다.</Typo.TH>
        </VStack>
        <button className={s.refreshBtn} onClick={fetchUsers}>새로고침</button>
      </HStack>

      {error && <div className={s.errorBox}><Typo.MD size={12} color="wrong">{error}</Typo.MD></div>}

      <HStack gap={20} align="start" fullWidth>
        {/* 유저 목록 */}
        <div className={s.userList}>
          <div className={s.tableWrapper}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th className={s.th}>유저</th>
                  <th className={s.th}>완료</th>
                  <th className={s.th}>관리</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr
                    key={u.id}
                    className={`${s.row} ${selectedUserId === u.id ? s.rowActive : ''}`}
                    onClick={() => loadDetail(u.id)}
                  >
                    <td className={s.td}>
                      <VStack gap={2}>
                        <span className={s.userName}>{u.name}</span>
                        <span className={s.userEmail}>{u.email}</span>
                      </VStack>
                    </td>
                    <td className={s.td}>
                      <span className={s.progressBadge}>
                        {u.completedProgress}/{u.totalProgress}
                      </span>
                    </td>
                    <td className={s.td}>
                      <button
                        className={s.resetBtn}
                        onClick={(e) => { e.stopPropagation(); setConfirmReset(u); }}
                        disabled={u.totalProgress === 0}
                      >
                        초기화
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* 상세 진척도 */}
        <div className={s.detailPanel}>
          {!selectedUserId && (
            <VStack align="center" justify="center" fullHeight style={{ minHeight: 200 }}>
              <Typo.TH size={12} color="secondary">유저를 선택하면 상세 진척도를 볼 수 있습니다.</Typo.TH>
            </VStack>
          )}
          {selectedUserId && detailLoading && (
            <VStack align="center" justify="center" style={{ minHeight: 200 }}>
              <div className={s.spinner} />
            </VStack>
          )}
          {selectedUserId && !detailLoading && (
            <VStack gap={12} fullWidth>
              <Typo.SM size={14} color="primary">{selectedUser?.name}의 학습 기록</Typo.SM>
              {details.length === 0 ? (
                <Typo.TH size={12} color="secondary">학습 기록이 없습니다.</Typo.TH>
              ) : (
                <div className={s.tableWrapper}>
                  <table className={s.table}>
                    <thead>
                      <tr>
                        <th className={s.th}>과목</th>
                        <th className={s.th}>단원</th>
                        <th className={s.th}>학습 모드</th>
                        <th className={s.th}>진척도</th>
                        <th className={s.th}>최근 학습</th>
                      </tr>
                    </thead>
                    <tbody>
                      {details.map((d) => (
                        <tr key={d.id}>
                          <td className={s.tdMeta}>{d.subjectTitle}</td>
                          <td className={s.td}>{d.unitNumber}단원</td>
                          <td className={s.td}>{STUDY_MODE_LABEL[d.studyMode] ?? d.studyMode}</td>
                          <td className={s.td}>
                            <span className={d.progressPercent === 100 ? s.complete : s.inProgress}>
                              {d.progressPercent}%
                            </span>
                          </td>
                          <td className={s.tdMeta}>
                            {new Date(d.lastStudiedAt).toLocaleDateString('ko-KR')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </VStack>
          )}
        </div>
      </HStack>

      {/* 초기화 확인 모달 */}
      {confirmReset && (
        <div className={s.confirmOverlay} onClick={() => setConfirmReset(null)}>
          <div className={s.confirmModal} onClick={(e) => e.stopPropagation()}>
            <VStack gap={8}>
              <Typo.BD size={16} color="primary">진척도 초기화</Typo.BD>
              <Typo.MD size={12} color="secondary">
                <strong>{confirmReset.name}</strong>의 모든 학습 진척도를 초기화하시겠습니까?<br />
                이 작업은 되돌릴 수 없습니다.
              </Typo.MD>
            </VStack>
            <div className={s.confirmButtons}>
              <button className={s.btnCancel} onClick={() => setConfirmReset(null)}>취소</button>
              <button className={s.btnConfirmReset} onClick={handleReset} disabled={resetting}>
                {resetting ? '초기화 중...' : '초기화'}
              </button>
            </div>
          </div>
        </div>
      )}
    </VStack>
  );
}
