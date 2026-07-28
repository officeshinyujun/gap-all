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

const STORAGE_KEY = 'gap_active_job_id';

export function JobProgressProvider({ children }: { children: React.ReactNode }) {
  const [activeJobId, setActiveJobId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return sessionStorage.getItem(STORAGE_KEY);
  });
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
          sessionStorage.removeItem(STORAGE_KEY);
          setActiveJobId(null);
        }
      } catch {
        setJobStatus((prev) =>
          prev ? { ...prev, status: 'failed', message: '오류 발생', errorMessage: '오류 발생' } : null,
        );
        if (pollingRef.current) clearInterval(pollingRef.current);
        pollingRef.current = null;
        // 오류 발생 시에도 jobId 제거
        sessionStorage.removeItem(STORAGE_KEY);
        setActiveJobId(null);
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

  const saveActiveJobId = useCallback((jobId: string | null) => {
    setActiveJobId(jobId);
    if (typeof window !== 'undefined') {
      if (jobId) sessionStorage.setItem(STORAGE_KEY, jobId);
      else sessionStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const startJob = useCallback((jobId: string) => {
    saveActiveJobId(jobId);
    setJobStatus({
      jobId,
      status: 'pending',
      progress: 0,
      stage: 'starting',
      message: '문제 생성을 시작합니다...',
    });
  }, [saveActiveJobId]);

  const dismissJob = useCallback(() => {
    saveActiveJobId(null);
    setJobStatus(null);
  }, [saveActiveJobId]);

  return (
    <JobProgressContext.Provider value={{ activeJobId, jobStatus, startJob, dismissJob }}>
      {children}
    </JobProgressContext.Provider>
  );
}
