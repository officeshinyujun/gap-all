import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { apiFetchResponse } from '@shared/lib/apiClient';
import { ExamPrintSheet, type ExamPrintSheetProps } from './ExamPrintSheet';
import { EXAM_PRINT_CSS, EXAM_PRINT_FONTS_URL } from './examPrintStyles';

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char);
}

/** 서버 PDF 렌더러에 보낼 완성된 시험지 HTML 문서 */
export function buildExamPrintHtml(props: ExamPrintSheetProps): string {
  const body = renderToStaticMarkup(<ExamPrintSheet {...props} />);
  return [
    '<!doctype html>',
    '<html lang="ko">',
    '<head>',
    '<meta charset="utf-8" />',
    `<title>${escapeHtml(props.title)}</title>`,
    '<link rel="preconnect" href="https://fonts.googleapis.com" />',
    '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />',
    `<link rel="stylesheet" href="${EXAM_PRINT_FONTS_URL}" />`,
    `<style>${EXAM_PRINT_CSS}</style>`,
    '</head>',
    `<body>${body}</body>`,
    '</html>',
  ].join('');
}

/** 시험지 PDF 파일 이름: 운영체제에서 쓸 수 없는 문자를 뺀다. */
export function examPdfFileName(title: string): string {
  const safe = title.replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
  return `${safe || '시험지'}.pdf`;
}

/**
 * 시험지를 서버에서 PDF로 만들어 바로 내려받는다.
 * 시험지 HTML은 여기서 만들고(앱 문항 렌더러와 같은 데이터·모양), 서버는 Chromium으로 PDF만 만든다.
 */
export async function downloadExamPdf(examId: string, props: ExamPrintSheetProps): Promise<void> {
  const res = await apiFetchResponse(`/exams/${encodeURIComponent(examId)}/pdf`, {
    method: 'POST',
    body: JSON.stringify({ html: buildExamPrintHtml(props) }),
  });
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = examPdfFileName(props.title);
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    // 다운로드가 시작될 시간을 둔 뒤 해제한다.
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}
