import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../lib/auth', () => ({
  API_BASE_URL: 'http://localhost:3001',
}));

import {
  fetchExams,
  fetchSubjectBySlug,
  pollExamJob,
  fetchExam,
  submitExam,
  saveExamAnswers,
} from '../examApi';

const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('examApi', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('fetchExams', () => {
    it('GET /exams 정상 호출', async () => {
      const mockExams = [
        { id: 'exam-1', title: '시험 1', difficulty: 'MIDDLE', questionCount: 10 },
      ];

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockExams),
      });

      const result = await fetchExams('success');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/exams?subject=success'),
        expect.any(Object),
      );
      expect(result).toEqual(mockExams);
    });

    it('subject 없이 호출', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
      });

      await fetchExams();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/exams',
        expect.any(Object),
      );
    });

    it('API 에러 throw', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ message: 'Server Error' }),
      });

      await expect(fetchExams()).rejects.toThrow('Server Error');
    });
  });

  describe('fetchSubjectBySlug', () => {
    it('GET /subjects/:slug', async () => {
      const mockSubject = { id: 'subj-1', slug: 'success', title: '성공적인 직업생활', units: [] };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSubject),
      });

      const result = await fetchSubjectBySlug('success');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/subjects/success',
        expect.any(Object),
      );
      expect(result.slug).toBe('success');
    });
  });

  describe('pollExamJob', () => {
    it('GET /exams/jobs/:id', async () => {
      const mockStatus = {
        jobId: 'job-1',
        status: 'running' as const,
        progress: 50,
        stage: 'generating',
        message: '문제 생성 중...',
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockStatus),
      });

      const result = await pollExamJob('job-1');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/exams/jobs/job-1',
        expect.any(Object),
      );
      expect(result.status).toBe('running');
    });
  });

  describe('fetchExam', () => {
    it('GET /exams/:id', async () => {
      const mockExam = {
        id: 'exam-1',
        title: '시험',
        difficulty: 'MIDDLE' as const,
        questionCount: 5,
        sourceType: 'ai' as const,
        items: [],
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockExam),
      });

      const result = await fetchExam('exam-1');
      expect(result.id).toBe('exam-1');
    });
  });

  describe('submitExam', () => {
    it('POST /exams/:id/submit - returns void on success', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({}),
      });

      // submitExam returns Promise<void> — should not throw
      await expect(submitExam('exam-1', [{ examItemId: 'i-1', answer: 3 }])).resolves.toBeUndefined();
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3001/exams/exam-1/submit',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('saveExamAnswers', () => {
    it('PATCH /exams/:id/answers', async () => {
      const mockResponse = { saved: 1 };
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockResponse),
      });

      const result = await saveExamAnswers('exam-1', [{ examItemId: 'i-1', answer: 3 }]);
      expect(result).toEqual(mockResponse);
    });
  });
});
