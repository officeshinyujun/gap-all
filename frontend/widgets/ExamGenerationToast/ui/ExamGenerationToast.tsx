'use client';

import React, { useEffect, useState } from 'react';
import { useJobProgress } from '@features/exam-generation/model/JobProgressProvider';
import s from './ExamGenerationToast.module.scss';

export function ExamGenerationToast() {
  const { jobStatus, cancelJob } = useJobProgress();
  const [collapsed, setCollapsed] = useState(false);
  const [hasShown, setHasShown] = useState(false);

  useEffect(() => {
    if (jobStatus) {
      setHasShown(true);
    }
  }, [jobStatus]);

  useEffect(() => {
    if (
      jobStatus?.status === 'completed' ||
      jobStatus?.status === 'failed' ||
      jobStatus?.status === 'canceled'
    ) {
      const timer = setTimeout(() => setHasShown(false), 10000);
      return () => clearTimeout(timer);
    }
  }, [jobStatus?.status]);

  if (!hasShown || !jobStatus) return null;

  const isDone =
    jobStatus.status === 'completed' ||
    jobStatus.status === 'failed' ||
    jobStatus.status === 'canceled';
  const displayMessage = jobStatus.shortfall &&
    jobStatus.shortfall.generatedCount < jobStatus.shortfall.requestedCount
    ? `검증 가능한 문항이 부족해 ${jobStatus.shortfall.generatedCount}/${jobStatus.shortfall.requestedCount}문항만 생성됨`
    : jobStatus.status === 'failed'
      ? jobStatus.errorMessage ?? jobStatus.message
      : jobStatus.message;
  const diagnosticLabel = jobStatus.status === 'failed' && jobStatus.errorCode
    ? [jobStatus.errorStage, jobStatus.errorCode].filter(Boolean).join(' · ')
    : '';
  const aiProgressLabel = jobStatus.aiProgress
    ? `${jobStatus.aiProgress.accepted}/${jobStatus.aiProgress.total}문항 검증 완료`
    : '';

  return (
    <>
      {/* 토글 탭 (항상 보임) */}
      <button
        className={`${s.tab} ${collapsed ? s.tabVisible : s.tabHidden}`}
        onClick={() => setCollapsed(!collapsed)}
      >
        {collapsed ? '<' : '>'}
      </button>

      {/* 토스트 본문 */}
      <div className={`${s.toast} ${collapsed ? s.toastHidden : s.toastVisible}`}>
        <div className={s.body}>
          {isDone ? (
            <span className={s.icon}>✅</span>
          ) : (
            <span className={s.spinner} />
          )}
          <div className={s.text}>
            <div className={s.title}>{displayMessage}</div>
            {diagnosticLabel && (
              <div className={s.progress}>{diagnosticLabel}</div>
            )}
            {aiProgressLabel && !isDone && (
              <div className={s.progress}>{aiProgressLabel}</div>
            )}
            {!isDone && (
              <div className={s.progress}>{jobStatus.progress}%</div>
            )}
          </div>
          <div className={s.actions}>
            {!isDone && (
              <button className={s.cancel} onClick={() => void cancelJob()}>
                취소
              </button>
            )}
            <button className={s.toggle} onClick={() => setCollapsed(true)}>
              &gt;
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
