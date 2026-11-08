import { afterEach, describe, expect, it, vi } from 'vitest';
import { downloadExamPdf, examPdfFileName } from './exportExam';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('exam PDF download', () => {
  it('posts the exam-paper HTML to the server and downloads the returned PDF', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Blob(['%PDF-1.7'], { type: 'application/pdf' }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    const createObjectURL = vi.fn().mockReturnValue('blob:exam');
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() }));
    const clicks: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push(this.download);
    });

    await downloadExamPdf('exam-1', {
      title: '성공적인 직업생활 16~18단원',
      subjectName: '성공적인 직업생활',
      difficulty: 'HIGH',
      unitRange: '16~18단원',
      items: [],
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/exams\/exam-1\/pdf$/);
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(JSON.parse(init.body).html).toContain('직업탐구 영역');
    expect(createObjectURL).toHaveBeenCalled();
    expect(clicks).toEqual(['성공적인 직업생활 16~18단원.pdf']);
  });

  it('surfaces server errors instead of downloading', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: 'PDF 생성 엔진을 실행할 수 없습니다.' }), { status: 503 })));
    await expect(downloadExamPdf('exam-1', { title: 't', subjectName: 's', difficulty: 'd', unitRange: 'u', items: [] }))
      .rejects.toThrow('PDF 생성 엔진을 실행할 수 없습니다.');
  });

  it('removes characters that file systems reject', () => {
    expect(examPdfFileName('공업 일반 7/10단원: "계산"')).toBe('공업 일반 7 10단원 계산.pdf');
    expect(examPdfFileName('')).toBe('시험지.pdf');
  });
});
