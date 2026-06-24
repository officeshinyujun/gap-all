'use client';

import React, { useEffect, useState } from 'react';
import { useJobProgress } from '@features/exam-generation/model/JobProgressProvider';
import s from './ExamGenerationToast.module.scss';

export function ExamGenerationToast() {
  const { jobStatus } = useJobProgress();
  const [visible, setVisible] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (jobStatus && !dismissed) {
      setVisible(true);
    }
  }, [jobStatus, dismissed]);

  useEffect(() => {
    if (jobStatus?.status === 'completed' || jobStatus?.status === 'failed') {
      const timer = setTimeout(() => setVisible(false), 10000);
      return () => clearTimeout(timer);
    }
  }, [jobStatus?.status]);

  if (!visible || !jobStatus || dismissed) return null;

  const isDone = jobStatus.status === 'completed' || jobStatus.status === 'failed';

  return (
    <div className={`${s.toast} ${visible ? s.visible : ''}`}>
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
        <button className={s.close} onClick={() => { setVisible(false); setDismissed(true); }}>
          ✕
        </button>
      </div>
    </div>
  );
}
