import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ExamJobStatus } from '@entities/exam/model/types';
import { ExamGenerationToast } from './ExamGenerationToast';

const jobProgress = vi.hoisted(() => ({
  current: { jobStatus: null as ExamJobStatus | null, cancelJob: vi.fn() },
}));

vi.mock('@features/exam-generation/model/JobProgressProvider', () => ({
  useJobProgress: () => jobProgress.current,
}));

afterEach(cleanup);

function renderWith(jobStatus: ExamJobStatus) {
  jobProgress.current = { jobStatus, cancelJob: vi.fn() };
  return render(<ExamGenerationToast />);
}

describe('ExamGenerationToast', () => {
  it('shows activity, progress bar, per-question chips and a status legend for AI full generation', () => {
    renderWith({
      jobId: 'job-1',
      status: 'running',
      progress: 46.4,
      stage: 'candidate',
      message: '7번 문항 검토 중 (정답을 모르는 상태로 다시 풀기)',
      sourceType: 'ai_generative',
      createdAt: new Date(Date.now() - 125_000).toISOString(),
      itemStates: ['accepted', 'accepted', 'failed', 'verifying', 'generating', 'queued'],
    });

    expect(screen.getByText('AI가 문제를 출제하고 있어요')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('7번 문항 검토 중 (정답을 모르는 상태로 다시 풀기)');
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('46');
    expect(screen.getByText(/^02:0[5-6]$/)).toBeTruthy();

    const chips = screen.getByRole('list', { name: '문항별 진행 상태' }).querySelectorAll('li');
    expect(Array.from(chips).map((chip) => chip.getAttribute('title'))).toEqual([
      '1번 문항: 완성',
      '2번 문항: 완성',
      '3번 문항: 제외',
      '4번 문항: 검토',
      '5번 문항: 출제',
      '6번 문항: 대기',
    ]);
    expect(screen.getByText('완성 2')).toBeTruthy();
    expect(screen.getByText('제외 1')).toBeTruthy();
    expect(screen.getByRole('button', { name: '취소' })).toBeTruthy();
  });

  it('shows reserve items started after rejections and the skipped state', () => {
    renderWith({
      jobId: 'job-4',
      status: 'running',
      progress: 80,
      stage: 'candidate',
      message: '예비 1번 문항 검토 중 (정답을 모르는 상태로 다시 풀기)',
      sourceType: 'ai_generative',
      itemStates: ['accepted', 'skipped', 'accepted'],
      reserveStates: ['verifying'],
    });

    const reserves = screen.getByRole('list', { name: '예비 문항 진행 상태' }).querySelectorAll('li');
    expect(Array.from(reserves).map((chip) => chip.getAttribute('title'))).toEqual(['예비 1번 문항: 검토']);
    expect(screen.getByText('검토 1')).toBeTruthy();
    expect(screen.getByText('중단 1')).toBeTruthy();
  });

  it('falls back to the accepted counter when no per-question states are available', () => {
    renderWith({
      jobId: 'job-2',
      status: 'running',
      progress: 30,
      stage: 'candidate',
      message: 'AI 시험 생성 준비 중입니다.',
      sourceType: 'ai_blueprint',
      aiProgress: { stage: 'candidate', completed: 1, total: 5, attempt: 1, maxAttempts: 3, accepted: 1, rejected: 0 },
    });

    expect(screen.getByText('AI가 문제를 만들고 있어요')).toBeTruthy();
    expect(screen.getByText('1/5문항 검증 완료')).toBeTruthy();
    expect(screen.queryByRole('list', { name: '문항별 진행 상태' })).toBeNull();
  });

  it('summarizes a partial completion without the cancel button or progress bar', () => {
    renderWith({
      jobId: 'job-3',
      status: 'completed',
      progress: 100,
      stage: 'saving',
      message: '시험 생성이 완료되었습니다.',
      sourceType: 'ai_generative',
      shortfall: { requestedCount: 10, generatedCount: 9 },
      itemStates: Array(9).fill('accepted').concat(['failed']),
    });

    expect(screen.getByText('시험이 완성됐어요')).toBeTruthy();
    expect(screen.getByRole('status').textContent).toBe('검증을 통과한 9/10문항만 저장했어요');
    expect(screen.queryByRole('progressbar')).toBeNull();
    expect(screen.queryByRole('button', { name: '취소' })).toBeNull();
  });
});
