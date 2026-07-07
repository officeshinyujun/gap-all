'use client';

import React, { useEffect, useState } from 'react';
import { useJobProgress } from '@features/exam-generation/model/JobProgressProvider';
import s from './ExamGenerationToast.module.scss';

export function ExamGenerationToast() {
  const { jobStatus } = useJobProgress();
  const [collapsed, setCollapsed] = useState(false);
  const [hasShown, setHasShown] = useState(false);

  useEffect(() => {
    if (jobStatus) {
      setHasShown(true);
    }
  }, [jobStatus]);

  useEffect(() => {
    if (jobStatus?.status === 'completed' || jobStatus?.status === 'failed') {
      const timer = setTimeout(() => setHasShown(false), 10000);
      return () => clearTimeout(timer);
    }
  }, [jobStatus?.status]);

  if (!hasShown || !jobStatus) return null;

  const isDone = jobStatus.status === 'completed' || jobStatus.status === 'failed';

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
            <div className={s.title}>{jobStatus.message}</div>
            {!isDone && (
              <div className={s.progress}>{jobStatus.progress}%</div>
            )}
          </div>
          <button className={s.toggle} onClick={() => setCollapsed(true)}>
            &gt;
          </button>
        </div>
      </div>
    </>
  );
}
