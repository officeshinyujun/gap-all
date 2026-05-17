'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { VStack } from '@/components/general/VStack';
import { HStack } from '@/components/general/HStack';
import Typo from '@/components/general/Typo';
import { useAuth } from '@/contexts/AuthContext';
import { API_BASE_URL } from '@/lib/auth';
import s from './page.module.scss';

interface AdminUser {
  id: string;
  email: string;
  name: string;
  role: string;
  createdAt: string;
}

type ConfirmAction = { type: 'delete'; user: AdminUser };

export default function AdminUsersPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmAction | null>(null);
  const [processing, setProcessing] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/users`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('유저 목록 조회 실패');
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

  async function handleRoleChange(userId: string, currentRole: string) {
    const newRole = currentRole === 'admin' ? 'user' : 'admin';
    if (!window.confirm(`역할을 ${newRole}로 변경하시겠습니까?`)) return;
    try {
      const res = await fetch(`${API_BASE_URL}/admin/users/${userId}/role`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) throw new Error('역할 변경 실패');
      setUsers((prev) => prev.map((u) => u.id === userId ? { ...u, role: newRole } : u));
    } catch (e) {
      setError(e instanceof Error ? e.message : '역할 변경 실패');
    }
  }

  async function handlePasswordReset(userId: string) {
    const newPw = prompt('새 비밀번호를 입력하세요 (8자 이상):');
    if (!newPw || newPw.length < 8) { alert('8자 이상 입력해주세요.'); return; }
    try {
      const res = await fetch(`${API_BASE_URL}/admin/users/${userId}/password`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: newPw }),
      });
      if (!res.ok) throw new Error('비밀번호 초기화 실패');
      alert('비밀번호가 초기화되었습니다.');
    } catch (e) {
      alert(e instanceof Error ? e.message : '초기화 실패');
    }
  }

  async function handleConfirm() {
    if (!confirm) return;
    setProcessing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/admin/users/${confirm.user.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('삭제 실패');
      setUsers((prev) => prev.filter((u) => u.id !== confirm.user.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : '처리 실패');
    } finally {
      setProcessing(false);
      setConfirm(null);
    }
  }

  if (isLoading || loading) return (
    <VStack gap={16} align="center" justify="center" fullWidth fullHeight>
      <div className={s.spinner} />
    </VStack>
  );

  return (
    <VStack gap={20} fullWidth className={s.page}>
      <HStack gap={0} align="center" justify="between" fullWidth>
        <VStack gap={4}>
          <Typo.BD size={20} color="primary">가입 유저 목록</Typo.BD>
          <Typo.TH size={12} color="secondary">총 {users.length}명</Typo.TH>
        </VStack>
        <button className={s.refreshBtn} onClick={fetchUsers}>새로고침</button>
      </HStack>

      {error && <div className={s.errorBox}><Typo.MD size={12} color="wrong">{error}</Typo.MD></div>}

      <div className={s.tableWrapper}>
        <table className={s.table}>
          <thead>
            <tr>
              <th className={s.th}>이름</th>
              <th className={s.th}>이메일</th>
              <th className={s.th}>역할</th>
              <th className={s.th}>가입일</th>
              <th className={s.th}>관리</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td className={s.td}>{u.name}</td>
                <td className={s.td}>{u.email}</td>
                <td className={s.td}>
                  <span className={u.role === 'admin' ? s.badgeAdmin : s.badgeUser}>{u.role}</span>
                </td>
                <td className={s.tdMeta}>{new Date(u.createdAt).toLocaleDateString('ko-KR')}</td>
                <td className={s.td}>
                  <HStack gap={6}>
                    <button
                      className={`${s.actionBtn} ${s.btnRole}`}
                      onClick={() => handleRoleChange(u.id, u.role)}
                    >
                      {u.role === 'admin' ? '→ user' : '→ admin'}
                    </button>
                    <button
                      className={`${s.actionBtn} ${s.btnReset}`}
                      onClick={() => handlePasswordReset(u.id)}
                    >
                      PW 초기화
                    </button>
                    <button
                      className={`${s.actionBtn} ${s.btnDelete}`}
                      onClick={() => setConfirm({ type: 'delete', user: u })}
                    >
                      삭제
                    </button>
                  </HStack>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 확인 모달 */}
      {confirm && (
        <div className={s.confirmOverlay} onClick={() => setConfirm(null)}>
          <div className={s.confirmModal} onClick={(e) => e.stopPropagation()}>
            <VStack gap={8}>
              <Typo.BD size={16} color="primary">유저 삭제</Typo.BD>
              <Typo.MD size={12} color="secondary">
                <strong>{confirm.user.name}</strong> ({confirm.user.email}) 유저를 삭제하시겠습니까?<br />
                이 작업은 되돌릴 수 없습니다.
              </Typo.MD>
            </VStack>
            <div className={s.confirmButtons}>
              <button className={s.btnCancel} onClick={() => setConfirm(null)}>취소</button>
              <button
                className={s.btnConfirmDelete}
                onClick={handleConfirm}
                disabled={processing}
              >
                {processing ? '처리 중...' : confirm.type === 'delete' ? '삭제' : '변경'}
              </button>
            </div>
          </div>
        </div>
      )}
    </VStack>
  );
}
