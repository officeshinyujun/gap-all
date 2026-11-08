import { examPdfImageHosts, isAllowedExamPdfRequest } from './exam-pdf.service';

describe('exam PDF rendering sandbox', () => {
  const hosts = examPdfImageHosts({ SUPABASE_URL: 'https://abc.supabase.co', EXAM_PDF_IMAGE_HOSTS: 'cdn.example.com, ' });

  it('collects image hosts from the storage URL and the extra list', () => {
    expect([...hosts].sort()).toEqual(['abc.supabase.co', 'cdn.example.com']);
  });

  it('allows only web fonts, storage images and data URIs', () => {
    expect(isAllowedExamPdfRequest('https://fonts.googleapis.com/css2?family=Noto+Serif+KR', 'stylesheet', hosts)).toBe(true);
    expect(isAllowedExamPdfRequest('https://fonts.gstatic.com/s/notoserif.woff2', 'font', hosts)).toBe(true);
    expect(isAllowedExamPdfRequest('https://abc.supabase.co/storage/v1/object/public/f1.png', 'image', hosts)).toBe(true);
    expect(isAllowedExamPdfRequest('data:image/png;base64,AAAA', 'image', hosts)).toBe(true);
  });

  it('blocks internal, non-https and non-image requests', () => {
    expect(isAllowedExamPdfRequest('http://abc.supabase.co/a.png', 'image', hosts)).toBe(false);
    expect(isAllowedExamPdfRequest('https://169.254.169.254/latest/meta-data', 'image', hosts)).toBe(false);
    expect(isAllowedExamPdfRequest('file:///etc/passwd', 'document', hosts)).toBe(false);
    expect(isAllowedExamPdfRequest('https://abc.supabase.co/rest/v1/users', 'fetch', hosts)).toBe(false);
    expect(isAllowedExamPdfRequest('https://fonts.googleapis.com/x', 'script', hosts)).toBe(false);
    expect(isAllowedExamPdfRequest('https://evil.example.com/x.png', 'image', hosts)).toBe(false);
  });
});
