'use client';

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import type { ExamGenerationMode, ExamJobStatus } from '@entities/exam/model/types';
import { cancelExamJob, pollExamJob } from '@entities/exam/api/examApi';

interface JobProgressContextValue {
  activeJobId: string | null;
  jobStatus: ExamJobStatus | null;
  startJob: (jobId: string, sourceType?: ExamGenerationMode) => void;
  dismissJob: () => void;
  cancelJob: () => Promise<void>;
}

const JobProgressContext = createContext<JobProgressContextValue>({
  activeJobId: null,
  jobStatus: null,
  startJob: () => {},
  dismissJob: () => {},
  cancelJob: async () => {},
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
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);

  useEffect(() => {
    if (!activeJobId) return;

    let cancelled = false;

    const schedule = (delay: number, poll: () => void) => {
      if (!cancelled) pollingRef.current = setTimeout(poll, delay);
    };

    const poll = async () => {
      try {
        const status = await pollExamJob(activeJobId);
        if (cancelled) return;
        retryCountRef.current = 0;
        setJobStatus(status);
        if (
          status.status === 'completed' ||
          status.status === 'failed' ||
          status.status === 'canceled'
        ) {
          if (pollingRef.current) clearTimeout(pollingRef.current);
          pollingRef.current = null;
          sessionStorage.removeItem(STORAGE_KEY);
          setActiveJobId(null);
        } else {
          schedule(2500, poll);
        }
      } catch {
        if (cancelled) return;
        retryCountRef.current += 1;
        setJobStatus((prev) =>
          prev
            ? {
                ...prev,
                message: '생성 상태를 다시 확인하고 있습니다...',
                errorMessage: undefined,
              }
            : null,
        );
        schedule(Math.min(1000 * 2 ** retryCountRef.current, 10000), poll);
      }
    };

    poll();

    return () => {
      cancelled = true;
      if (pollingRef.current) {
        clearTimeout(pollingRef.current);
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

  const startJob = useCallback((jobId: string, sourceType?: ExamGenerationMode) => {
    saveActiveJobId(jobId);
    setJobStatus({
      jobId,
      status: 'pending',
      progress: 0,
      stage: 'starting',
      message: '문제 생성을 시작합니다...',
      sourceType,
    });
  }, [saveActiveJobId]);

  const dismissJob = useCallback(() => {
    saveActiveJobId(null);
    setJobStatus(null);
  }, [saveActiveJobId]);

  const cancelJob = useCallback(async () => {
    if (!activeJobId) return;
    const status = await cancelExamJob(activeJobId);
    setJobStatus(status);
    saveActiveJobId(null);
  }, [activeJobId, saveActiveJobId]);

  return (
    <JobProgressContext.Provider
      value={{ activeJobId, jobStatus, startJob, dismissJob, cancelJob }}
    >
      {children}
    </JobProgressContext.Provider>
  );
}
