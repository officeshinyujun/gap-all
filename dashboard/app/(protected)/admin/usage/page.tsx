'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { VStack } from '@/components/general/VStack';
import { HStack } from '@/components/general/HStack';
import Typo from '@/components/general/Typo';
import { useAuth } from '@/contexts/AuthContext';
import { SPACING } from '@/constants/spacing';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import s from './page.module.scss';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? 'http://localhost:3001';

// ── 타입 ──────────────────────────────────────────────────────

interface DbRow {
  date: string;
  source: 'chat' | 'exam_step1' | 'exam_step2';
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  nRequests: number;
}

interface OpenAIRow {
  date: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  nRequests: number;
}

interface UsageResponse {
  available: boolean;
  startDate: string;
  endDate: string;
  db: DbRow[];
  openai: OpenAIRow[] | null;
  openaiError: string | null;
}

// ── 헬퍼 ──────────────────────────────────────────────────────

const SOURCE_LABEL: Record<string, string> = {
  chat: '채팅',
  exam_step1: '시험생성 Step1',
  exam_step2: '시험생성 Step2',
};

function sumRows(rows: { promptTokens: number; completionTokens: number; totalTokens: number; nRequests: number }[]) {
  return rows.reduce(
    (acc, r) => ({
      promptTokens: acc.promptTokens + r.promptTokens,
      completionTokens: acc.completionTokens + r.completionTokens,
      totalTokens: acc.totalTokens + r.totalTokens,
      nRequests: acc.nRequests + r.nRequests,
    }),
    { promptTokens: 0, completionTokens: 0, totalTokens: 0, nRequests: 0 },
  );
}

// ── 컴포넌트 ──────────────────────────────────────────────────

export default function AdminUsagePage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [usage, setUsage] = useState<UsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'db' | 'openai'>('db');

  const fetchUsage = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/admin/openai-usage`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('사용량 조회 실패');
      setUsage(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoading && user) {
      if (user.role !== 'admin') { router.replace('/'); return; }
      void fetchUsage();
    }
  }, [isLoading, user, router, fetchUsage]);

  const dailyData = useMemo(() => {
    // 항상 최근 7일 표시 (데이터 없는 날도 0으로)
    const byDate = new Map<string, number>();
    if (usage?.db) {
      for (const row of usage.db) {
        byDate.set(row.date, (byDate.get(row.date) ?? 0) + row.totalTokens);
      }
    }
    const result = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      result.push({ date: dateStr.slice(5), tokens: byDate.get(dateStr) ?? 0 });
    }
    return result;
  }, [usage]);

  const sourceData = useMemo(() => {
    if (!usage?.db) return [];
    const bySource = new Map<string, number>();
    for (const row of usage.db) {
      const label = SOURCE_LABEL[row.source] ?? row.source;
      bySource.set(label, (bySource.get(label) ?? 0) + row.totalTokens);
    }
    return [...bySource.entries()].map(([name, value]) => ({ name, value }));
  }, [usage]);

  const COLORS = ['#3333CC', '#5555CC', '#7777CC', '#9999CC', '#BBBBCC', '#DDDDEE'];

  if (isLoading || loading) return (
    <VStack gap={16} align="center" justify="center" fullWidth fullHeight>
      <div className={s.spinner} />
    </VStack>
  );

  const dbRows = usage?.db ?? [];
  const openaiRows = usage?.openai ?? [];

  const dbTotal = sumRows(dbRows);
  const openaiTotal = sumRows(openaiRows);

  // 날짜별 집계 (DB)
  const dbByDate = Object.entries(
    dbRows.reduce<Record<string, typeof dbTotal>>((acc, r) => {
      if (!acc[r.date]) acc[r.date] = { promptTokens: 0, completionTokens: 0, totalTokens: 0, nRequests: 0 };
      acc[r.date].promptTokens += r.promptTokens;
      acc[r.date].completionTokens += r.completionTokens;
      acc[r.date].totalTokens += r.totalTokens;
      acc[r.date].nRequests += r.nRequests;
      return acc;
    }, {}),
  ).sort(([a], [b]) => b.localeCompare(a));

  return (
    <VStack gap={20} fullWidth className={s.page}>
      {/* 헤더 */}
      <HStack gap={0} align="center" justify="between" fullWidth>
        <VStack gap={4}>
          <Typo.BD size={20} color="primary">API 사용량</Typo.BD>
          <Typo.TH size={12} color="secondary">
            {usage ? `${usage.startDate} ~ ${usage.endDate} (최근 7일)` : 'OpenAI API 사용량'}
          </Typo.TH>
        </VStack>
        <button className={s.refreshBtn} onClick={fetchUsage}>새로고침</button>
      </HStack>

      {error && (
        <div className={s.errorBox}>
          <Typo.MD size={12} color="wrong">{error}</Typo.MD>
        </div>
      )}

      {/* 요약 카드 */}
      <HStack gap={12} fullWidth>
        <div className={s.summaryCard}>
          <Typo.TH size={12} color="secondary">총 요청 수 (DB)</Typo.TH>
          <Typo.BD size={24} color="primary">{dbTotal.nRequests.toLocaleString()}</Typo.BD>
        </div>
        <div className={s.summaryCard}>
          <Typo.TH size={12} color="secondary">입력 토큰 (DB)</Typo.TH>
          <Typo.BD size={24} color="primary">{dbTotal.promptTokens.toLocaleString()}</Typo.BD>
        </div>
        <div className={s.summaryCard}>
          <Typo.TH size={12} color="secondary">출력 토큰 (DB)</Typo.TH>
          <Typo.BD size={24} color="primary">{dbTotal.completionTokens.toLocaleString()}</Typo.BD>
        </div>
        <div className={s.summaryCard}>
          <Typo.TH size={12} color="secondary">총 토큰 (DB)</Typo.TH>
          <Typo.BD size={24} color="primary">{dbTotal.totalTokens.toLocaleString()}</Typo.BD>
        </div>
      </HStack>

      {usage && usage.db.length > 0 && (
        <HStack gap={SPACING.s16} fullWidth style={{ height: 250 }}>
          <VStack gap={SPACING.s8} style={{ flex: 1 }}>
            <Typo.MD size={14} color="primary">일별 토큰 사용량</Typo.MD>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={dailyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E2E9" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="tokens" fill="#3333CC" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </VStack>

          <VStack gap={SPACING.s8} style={{ flex: 1 }}>
            <Typo.MD size={14} color="primary">소스별 분포</Typo.MD>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={sourceData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E2E9" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" fill="#3333CC" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </VStack>
        </HStack>
      )}

      {/* 탭 */}
      <VStack gap={0} fullWidth>
        <div className={s.tabBar}>
          <button
            className={`${s.tab} ${tab === 'db' ? s.tabActive : ''}`}
            onClick={() => setTab('db')}
          >
            DB 기반 추적
          </button>
          <button
            className={`${s.tab} ${tab === 'openai' ? s.tabActive : ''}`}
            onClick={() => setTab('openai')}
          >
            OpenAI API
          </button>
        </div>

        {/* DB 탭 */}
        {tab === 'db' && (
          <VStack gap={20} fullWidth style={{ paddingTop: 16 }}>
            {dbRows.length === 0 ? (
              <div className={s.infoBox}>
                <Typo.TH size={12} color="secondary">아직 기록된 사용량이 없습니다. API 호출 후 다시 확인해주세요.</Typo.TH>
              </div>
            ) : (
              <>
                {/* 날짜별 요약 */}
                <VStack gap={8} fullWidth>
                  <Typo.SM size={14} color="primary">날짜별 요약</Typo.SM>
                  <div className={s.tableWrapper}>
                    <table className={s.table}>
                      <thead>
                        <tr>
                          <th className={s.th}>날짜</th>
                          <th className={s.th}>요청 수</th>
                          <th className={s.th}>입력 토큰</th>
                          <th className={s.th}>출력 토큰</th>
                          <th className={s.th}>합계</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dbByDate.map(([date, totals]) => (
                          <tr key={date}>
                            <td className={s.tdMeta}>{date}</td>
                            <td className={s.td}>{totals.nRequests.toLocaleString()}</td>
                            <td className={s.td}>{totals.promptTokens.toLocaleString()}</td>
                            <td className={s.td}>{totals.completionTokens.toLocaleString()}</td>
                            <td className={s.td}>{totals.totalTokens.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </VStack>

                {/* 소스별 상세 */}
                <VStack gap={8} fullWidth>
                  <Typo.SM size={14} color="primary">소스별 상세</Typo.SM>
                  <div className={s.tableWrapper}>
                    <table className={s.table}>
                      <thead>
                        <tr>
                          <th className={s.th}>날짜</th>
                          <th className={s.th}>소스</th>
                          <th className={s.th}>모델</th>
                          <th className={s.th}>요청 수</th>
                          <th className={s.th}>입력 토큰</th>
                          <th className={s.th}>출력 토큰</th>
                          <th className={s.th}>합계</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dbRows.map((r, i) => (
                          <tr key={i}>
                            <td className={s.tdMeta}>{r.date}</td>
                            <td className={s.td}>
                              <span className={s.sourceBadge} data-source={r.source}>
                                {SOURCE_LABEL[r.source] ?? r.source}
                              </span>
                            </td>
                            <td className={s.tdMeta}>{r.model}</td>
                            <td className={s.td}>{r.nRequests.toLocaleString()}</td>
                            <td className={s.td}>{r.promptTokens.toLocaleString()}</td>
                            <td className={s.td}>{r.completionTokens.toLocaleString()}</td>
                            <td className={s.td}>{r.totalTokens.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </VStack>
              </>
            )}
          </VStack>
        )}

        {/* OpenAI API 탭 */}
        {tab === 'openai' && (
          <VStack gap={12} fullWidth style={{ paddingTop: 16 }}>
            {usage?.openaiError && (
              <div className={s.infoBox}>
                <Typo.TH size={12} color="secondary">OpenAI API: {usage.openaiError}</Typo.TH>
              </div>
            )}
            {openaiRows.length === 0 && !usage?.openaiError && (
              <div className={s.infoBox}>
                <Typo.TH size={12} color="secondary">OpenAI API에서 반환된 데이터가 없습니다.</Typo.TH>
              </div>
            )}
            {openaiRows.length > 0 && (
              <>
                {/* OpenAI 요약 카드 */}
                <HStack gap={12} fullWidth>
                  <div className={s.summaryCard}>
                    <Typo.TH size={12} color="secondary">총 요청 수</Typo.TH>
                    <Typo.BD size={24} color="primary">{openaiTotal.nRequests.toLocaleString()}</Typo.BD>
                  </div>
                  <div className={s.summaryCard}>
                    <Typo.TH size={12} color="secondary">입력 토큰</Typo.TH>
                    <Typo.BD size={24} color="primary">{openaiTotal.promptTokens.toLocaleString()}</Typo.BD>
                  </div>
                  <div className={s.summaryCard}>
                    <Typo.TH size={12} color="secondary">출력 토큰</Typo.TH>
                    <Typo.BD size={24} color="primary">{openaiTotal.completionTokens.toLocaleString()}</Typo.BD>
                  </div>
                  <div className={s.summaryCard}>
                    <Typo.TH size={12} color="secondary">총 토큰</Typo.TH>
                    <Typo.BD size={24} color="primary">{openaiTotal.totalTokens.toLocaleString()}</Typo.BD>
                  </div>
                </HStack>

                <div className={s.tableWrapper}>
                  <table className={s.table}>
                    <thead>
                      <tr>
                        <th className={s.th}>날짜</th>
                        <th className={s.th}>모델</th>
                        <th className={s.th}>요청 수</th>
                        <th className={s.th}>입력 토큰</th>
                        <th className={s.th}>출력 토큰</th>
                        <th className={s.th}>합계</th>
                      </tr>
                    </thead>
                    <tbody>
                      {openaiRows.map((r, i) => (
                        <tr key={i}>
                          <td className={s.tdMeta}>{r.date}</td>
                          <td className={s.tdMeta}>{r.model}</td>
                          <td className={s.td}>{r.nRequests.toLocaleString()}</td>
                          <td className={s.td}>{r.promptTokens.toLocaleString()}</td>
                          <td className={s.td}>{r.completionTokens.toLocaleString()}</td>
                          <td className={s.td}>{r.totalTokens.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </VStack>
        )}
      </VStack>
    </VStack>
  );
}
