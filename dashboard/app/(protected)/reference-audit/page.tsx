'use client';

import { useEffect, useMemo, useState } from 'react';
import { VStack } from '@/components/general/VStack';
import { HStack } from '@/components/general/HStack';
import Typo from '@/components/general/Typo';
import { SPACING } from '@/constants/spacing';
import s from './page.module.scss';

// 원문 인증 결과 감사 화면.
// 인증 스크립트가 남긴 artifacts/reference-certification-v2.json 을 그대로 읽어,
// 저장되지 못한 원문과 그 사유를 확인한다.

type Item = {
  sourceKey: string;
  questionNumber: number;
  reasons: string[];
  subject: string;
  year: string;
  exam: string;
  file: string;
};

type Payload = {
  counts: { total: number; certified: number; blocked: number };
  reasonCount: Record<string, number>;
  totalReasons: number;
  items: Item[];
  artifact: string;
};

// 사유 코드가 생성 단계에서 무엇을 막는지
const WHY: Record<string, string> = {
  EMPTY_STIMULUS: '자료가 비어 있다. 판단 근거 없이 발문과 선택지만 남아, 무엇을 바꿔도 같은 문제가 나온다.',
  INCOMPLETE_TABLE: '표의 행과 열이 끝까지 읽히지 않았다. 셀 하나가 비면 정답의 전제가 달라진다.',
  INVALID_CHOICE_COUNT: '선택지 수가 다섯이 아니다. 정답 규칙을 세울 기준이 없다.',
  MISSING_OFFICIAL_EXPLANATION: '공식 해설이 없다. 정답이 왜 정답인지 확인할 근거가 없다.',
  PARSE_REFERENCE_REJECTED: '보기 항목이 선택지와 섞여 파싱이 거부됐다. 그대로 넘기면 빈 슬롯이 남는다.',
  LOCAL_REVIEW_REQUIRED: '자동 판정으로 확정하지 못해 직접 확인이 필요한 항목이다.',
};

export default function ReferenceAuditPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState('');
  const [reason, setReason] = useState<string | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => {
    fetch('/api/reference-audit')
      .then((r) => r.json())
      .then((d) => (d.error ? setErr(d.error) : setData(d)))
      .catch((e) => setErr(String(e)));
  }, []);

  const rows = useMemo(() => {
    if (!data) return [];
    return data.items.filter((it) => {
      if (reason && !it.reasons.includes(reason)) return false;
      if (q && !`${it.sourceKey}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [data, reason, q]);

  if (err) return <div className={s.empty}>{err}</div>;
  if (!data) return <div className={s.empty}>인증 결과를 불러오는 중…</div>;

  const pass = ((data.counts.certified / data.counts.total) * 100).toFixed(1);

  return (
    <VStack gap={SPACING.s20} style={{ width: '100%' }}>
      <VStack gap={SPACING.s4}>
        <Typo.BD size={24}>원문 인증 감사</Typo.BD>
        <Typo.MD size={12} color="secondary">
          인증 스크립트가 남긴 {data.artifact} 를 읽어, 저장되지 못한 원문과 그 사유를 확인합니다.
        </Typo.MD>
      </VStack>

      <div className={s.tiles}>
        <div className={s.tile}>
          <div className={s.tileNum}>{data.counts.total}</div>
          <div className={s.tileLabel}>검사한 원문</div>
        </div>
        <div className={s.tile}>
          <div className={s.tileNum}>{data.counts.certified}</div>
          <div className={s.tileLabel}>인증 통과 · {pass}%</div>
        </div>
        <div className={s.tile}>
          <div className={s.tileNum}>{data.counts.blocked}</div>
          <div className={s.tileLabel}>저장 보류</div>
        </div>
        <div className={s.tile}>
          <div className={s.tileNum}>{data.totalReasons}</div>
          <div className={s.tileLabel}>기록된 사유 (한 건에 여러 사유)</div>
        </div>
      </div>

      <div className={s.panel}>
        <VStack gap={SPACING.s12}>
          <HStack gap={SPACING.s12} align="center" justify="between" style={{ width: '100%' }}>
            <Typo.BD size={14}>사유별 보기</Typo.BD>
            <input
              className={s.search}
              placeholder="출처로 검색 (예: 2024, success)"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </HStack>

          <div className={s.chips}>
            <button
              className={`${s.chip} ${reason === null ? s.chipActive : ''}`}
              onClick={() => setReason(null)}
            >
              전체 <span className={s.chipCount}>{data.counts.blocked}</span>
            </button>
            {Object.entries(data.reasonCount)
              .sort((a, b) => b[1] - a[1])
              .map(([code, n]) => (
                <button
                  key={code}
                  className={`${s.chip} ${reason === code ? s.chipActive : ''}`}
                  onClick={() => setReason(reason === code ? null : code)}
                >
                  {code} <span className={s.chipCount}>{n}</span>
                </button>
              ))}
          </div>
        </VStack>
      </div>

      <div className={s.panel}>
        <table className={s.table}>
          <thead>
            <tr>
              <th style={{ width: 150 }}>과목 · 시험</th>
              <th style={{ width: 52 }}>문항</th>
              <th style={{ width: 210 }}>사유 코드</th>
              <th>생성 단계에서 무엇이 막히는가</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((it) => (
              <tr key={it.sourceKey}>
                <td>
                  {it.subject}
                  <div className={s.mono}>
                    {it.year} {it.exam}
                  </div>
                </td>
                <td>{it.questionNumber}</td>
                <td>
                  {it.reasons.map((r) => (
                    <span key={r} className={s.code}>
                      {r}
                    </span>
                  ))}
                </td>
                <td className={s.why}>
                  {it.reasons.map((r) => WHY[r]).filter(Boolean).join(' ') || '—'}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className={s.empty}>
                  조건에 맞는 항목이 없습니다.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </VStack>
  );
}
