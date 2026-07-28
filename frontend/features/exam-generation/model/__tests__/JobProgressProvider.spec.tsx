import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { JobProgressProvider, useJobProgress } from '../JobProgressProvider';
import { pollExamJob } from '@entities/exam/api/examApi';

vi.mock('@entities/exam/api/examApi', () => ({
  pollExamJob: vi.fn(),
}));

function JobStateProbe() {
  const { activeJobId, jobStatus, startJob } = useJobProgress();

  return (
    <>
      <button onClick={() => startJob('job-1')}>start</button>
      <output data-testid="active-job-id">{activeJobId ?? 'none'}</output>
      <output data-testid="job-status">{jobStatus?.status ?? 'none'}</output>
    </>
  );
}

describe('JobProgressProvider', () => {
  it('releases the active job after a completed job while preserving its status', async () => {
    vi.mocked(pollExamJob).mockResolvedValue({
      jobId: 'job-1',
      status: 'completed',
      progress: 100,
      stage: 'completed',
      message: '완료',
      examId: 'exam-1',
    });

    render(
      <JobProgressProvider>
        <JobStateProbe />
      </JobProgressProvider>,
    );

    await act(async () => {
      screen.getByRole('button', { name: 'start' }).click();
    });

    await waitFor(() => {
      expect(screen.getByTestId('active-job-id')).toHaveTextContent('none');
      expect(screen.getByTestId('job-status')).toHaveTextContent('completed');
    });
    expect(sessionStorage.getItem('gap_active_job_id')).toBeNull();
  });
});
