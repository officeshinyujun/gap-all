'use client';

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import type { ExamJobStatus } from '@entities/exam/model/types';
import { pollExamJob } from '@entities/exam/api/examApi';

interface JobProgressContextValue {
  activeJobId: string | null;
  jobStatus: ExamJobStatus | null;
  startJob: (jobId: string) => void;
  dismissJob: () => void;
}

const JobProgressContext = createContext<JobProgressContextValue>({
  activeJobId: null,
  jobStatus: null,
  startJob: () => {},
  dismissJob: () => {},
});

export function useJobProgress() {
  return useContext(JobProgressContext);
}

export function JobProgressProvider({ children }: { children: React.ReactNode }) {
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
        }
      } catch {
        setJobStatus((prev) =>
          prev ? { ...prev, status: 'failed', message: '오류 발생' } : null,
        );
        if (pollingRef.current) clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };

    poll();
    pollingRef.current = setInterval(poll, 2500);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [activeJobId]);

  const startJob = useCallback((jobId: string) => {
    setActiveJobId(jobId);
    setJobStatus({
      jobId,
      status: 'pending',
      progress: 0,
      stage: 'starting',
      message: '문제 생성을 시작합니다...',
    });
  }, []);

  const dismissJob = useCallback(() => {
    setActiveJobId(null);
    setJobStatus(null);
  }, []);

  return (
    <JobProgressContext.Provider value={{ activeJobId, jobStatus, startJob, dismissJob }}>
      {children}
    </JobProgressContext.Provider>
  );
}
