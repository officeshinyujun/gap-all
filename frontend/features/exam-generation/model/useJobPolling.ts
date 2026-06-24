'use client';

import { useState, useEffect, useRef } from 'react';
import type { ExamJobStatus } from '@entities/exam/model/types';
import { pollExamJob } from '@entities/exam/api/examApi';

export function useJobPolling(onComplete: () => void) {
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<ExamJobStatus | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!activeJobId) return;

    const poll = async () => {
      try {
        const status = await pollExamJob(activeJobId);
        setJobStatus(status);
        if (status.status === 'completed' || status.status === 'failed') {
          if (pollingRef.current) clearInterval(pollingRef.current);
          pollingRef.current = null;
          if (status.status === 'completed') {
            setActiveJobId(null);
            setJobStatus(null);
            onComplete();
          }
        }
      } catch {
        setJobStatus((prev) => prev ? { ...prev, status: 'failed', message: '폴링 중 오류 발생' } : null);
        if (pollingRef.current) clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };

    poll();
    pollingRef.current = setInterval(poll, 2500);
    return () => {
      if (pollingRef.current) { clearInterval(pollingRef.current); pollingRef.current = null; }
    };
  }, [activeJobId]);

  function startJob(jobId: string) {
    setActiveJobId(jobId);
    setJobStatus({ jobId, status: 'pending', progress: 0, stage: 'starting', message: '문제 생성을 시작합니다...' });
  }

  function dismissJob() {
    setActiveJobId(null);
    setJobStatus(null);
  }

  return { activeJobId, jobStatus, startJob, dismissJob };
}
