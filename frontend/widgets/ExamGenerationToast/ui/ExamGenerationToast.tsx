'use client';

import React, { useEffect, useState } from 'react';
import { useJobProgress } from '@features/exam-generation/model/JobProgressProvider';
import type { ExamJobStatus, GenerationItemState } from '@entities/exam/model/types';
import { VStack } from '@shared/ui/VStack';
import { HStack } from '@shared/ui/HStack';
import { SPACING } from '@shared/constants/spacing';
import s from './ExamGenerationToast.module.scss';

const ITEM_LABELS: Record<GenerationItemState, string> = {
  queued: '대기',
  generating: '출제',
  verifying: '검토',
  accepted: '완성',
  failed: '제외',
  skipped: '중단',
};
const ITEM_ORDER: GenerationItemState[] = ['accepted', 'verifying', 'generating', 'queued', 'failed', 'skipped'];

function chipText(state: GenerationItemState, label: string): string {
  if (state === 'accepted') return '✓';
  if (state === 'failed') return '×';
  if (state === 'skipped') return '–';
  return label;
}

function titleFor(job: ExamJobStatus): string {
  if (job.status === 'completed') return '시험이 완성됐어요';
  if (job.status === 'canceled') return '생성을 취소했어요';
  if (job.status === 'failed') return '생성에 실패했어요';
  switch (job.sourceType) {
    case 'ai_generative':
      return 'AI가 문제를 출제하고 있어요';
    case 'ai_blueprint':
      return 'AI가 문제를 만들고 있어요';
    default:
      return '시험을 구성하고 있어요';
  }
}

function formatElapsed(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** 서버 시작 시각이 있으면 그것을, 없으면 카드가 처음 보인 시각을 기준으로 경과 시간을 잰다. */
function useElapsed(job: ExamJobStatus | null, isDone: boolean): string | null {
  const [firstSeenAt, setFirstSeenAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const jobId = job?.jobId;

  useEffect(() => {
    setFirstSeenAt(jobId ? Date.now() : null);
  }, [jobId]);

  useEffect(() => {
    if (!jobId || isDone) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [jobId, isDone]);

  if (!job) return null;
  const startedAt = job.createdAt ? Date.parse(job.createdAt) : firstSeenAt;
  if (startedAt === null || Number.isNaN(startedAt)) return null;
  const endedAt = isDone && job.updatedAt ? Date.parse(job.updatedAt) : now;
  return formatElapsed(endedAt - startedAt);
}

export function ExamGenerationToast() {
  const { jobStatus, cancelJob } = useJobProgress();
  const [collapsed, setCollapsed] = useState(false);
  const [hasShown, setHasShown] = useState(false);

  const isDone =
    jobStatus?.status === 'completed' ||
    jobStatus?.status === 'failed' ||
    jobStatus?.status === 'canceled';
  const elapsed = useElapsed(jobStatus, Boolean(isDone));

  useEffect(() => {
    if (jobStatus) {
      setHasShown(true);
    }
  }, [jobStatus]);

  useEffect(() => {
    if (isDone) {
      const timer = setTimeout(() => setHasShown(false), 10000);
      return () => clearTimeout(timer);
    }
  }, [isDone]);

  if (!hasShown || !jobStatus) return null;

  const items = jobStatus.itemStates ?? [];
  const reserves = jobStatus.reserveStates ?? [];
  const counts = [...items, ...reserves].reduce<Record<GenerationItemState, number>>(
    (acc, state) => ({ ...acc, [state]: acc[state] + 1 }),
    { queued: 0, generating: 0, verifying: 0, accepted: 0, failed: 0, skipped: 0 },
  );
  const progress = Math.max(0, Math.min(100, Math.round(jobStatus.progress)));
  const shortfallMessage =
    jobStatus.shortfall && jobStatus.shortfall.generatedCount < jobStatus.shortfall.requestedCount
      ? `검증을 통과한 ${jobStatus.shortfall.generatedCount}/${jobStatus.shortfall.requestedCount}문항만 저장했어요`
      : null;
  const detailMessage =
    shortfallMessage ??
    (jobStatus.status === 'failed' ? jobStatus.errorMessage ?? jobStatus.message : jobStatus.message);
  const diagnosticLabel =
    jobStatus.status === 'failed' && jobStatus.errorCode
      ? [jobStatus.errorStage, jobStatus.errorCode].filter(Boolean).join(' · ')
      : '';
  const fallbackCounter =
    items.length === 0 && jobStatus.aiProgress && !isDone
      ? `${jobStatus.aiProgress.accepted}/${jobStatus.aiProgress.total}문항 검증 완료`
      : '';
  const statusClass =
    jobStatus.status === 'completed'
      ? s.success
      : jobStatus.status === 'failed'
        ? s.error
        : jobStatus.status === 'canceled'
          ? s.muted
          : '';

  return (
    <>
      {/* 토글 탭 (접었을 때만 보임) */}
      <button
        className={`${s.tab} ${collapsed ? s.tabVisible : s.tabHidden}`}
        onClick={() => setCollapsed(!collapsed)}
        aria-label={collapsed ? '생성 진행 카드 펼치기' : '생성 진행 카드 접기'}
      >
        {collapsed ? (isDone ? '✓' : `${progress}%`) : '>'}
      </button>

      <div className={`${s.toast} ${collapsed ? s.toastHidden : s.toastVisible}`}>
        <VStack gap={SPACING.s10} className={`${s.card} ${statusClass}`}>
          <HStack align="center" gap={SPACING.s10} fullWidth>
            {isDone ? (
              <span className={s.icon} aria-hidden>
                {jobStatus.status === 'completed' ? '✓' : jobStatus.status === 'failed' ? '!' : '■'}
              </span>
            ) : (
              <span className={s.spinner} aria-hidden />
            )}
            <div className={s.title}>{titleFor(jobStatus)}</div>
            {elapsed && <span className={s.elapsed}>{elapsed}</span>}
            <HStack align="center" gap={SPACING.s4} className={s.actions}>
              {!isDone && (
                <button className={s.cancel} onClick={() => void cancelJob()}>
                  취소
                </button>
              )}
              <button className={s.toggle} onClick={() => setCollapsed(true)} aria-label="접기">
                &gt;
              </button>
            </HStack>
          </HStack>

          {detailMessage && (
            <div className={s.activity} role="status" aria-live="polite">
              {detailMessage}
            </div>
          )}

          {!isDone && (
            <HStack align="center" gap={SPACING.s8} fullWidth>
              <div
                className={s.bar}
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
              >
                <div className={s.barFill} style={{ width: `${progress}%` }} />
              </div>
              <span className={s.percent}>{progress}%</span>
            </HStack>
          )}

          {items.length > 0 && (
            <>
              <HStack as="ol" wrap="wrap" gap={SPACING.s6} className={s.items} aria-label="문항별 진행 상태">
                {items.map((state, index) => (
                  <li
                    key={index}
                    className={`${s.item} ${s[`item_${state}`]}`}
                    title={`${index + 1}번 문항: ${ITEM_LABELS[state]}`}
                  >
                    {chipText(state, String(index + 1))}
                  </li>
                ))}
              </HStack>
              {reserves.length > 0 && (
                <HStack align="center" gap={SPACING.s6} className={s.reserveRow}>
                  <span className={s.reserveLabel}>예비</span>
                  <HStack as="ol" wrap="wrap" gap={SPACING.s6} className={s.items} aria-label="예비 문항 진행 상태">
                    {reserves.map((state, index) => (
                      <li
                        key={index}
                        className={`${s.item} ${s.reserveItem} ${s[`item_${state}`]}`}
                        title={`예비 ${index + 1}번 문항: ${ITEM_LABELS[state]}`}
                      >
                        {chipText(state, `예${index + 1}`)}
                      </li>
                    ))}
                  </HStack>
                </HStack>
              )}
              <HStack wrap="wrap" gap={SPACING.s10} className={s.legend}>
                {ITEM_ORDER.filter((state) => counts[state] > 0).map((state) => (
                  <HStack as="span" key={state} align="center" gap={SPACING.s4}>
                    <span className={`${s.dot} ${s[`item_${state}`]}`} aria-hidden />
                    {ITEM_LABELS[state]} {counts[state]}
                  </HStack>
                ))}
              </HStack>
            </>
          )}

          {fallbackCounter && <div className={s.meta}>{fallbackCounter}</div>}
          {diagnosticLabel && <div className={s.meta}>{diagnosticLabel}</div>}
        </VStack>
      </div>
    </>
  );
}
