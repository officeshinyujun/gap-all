'use client';

import React from 'react';
import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import { QuestionRenderer } from '@/components/exam/QuestionStem/QuestionRenderer';
import type { ExamItem } from '@/lib/examApi';

interface ExamPdfCaptureProps {
  title: string;
  subjectName: string;
  difficulty: string;
  unitRange: string;
  items: ExamItem[];
  onComplete?: () => void;
}

export async function generateExamPdf(props: ExamPdfCaptureProps) {
  const container = document.createElement('div');
  container.style.position = 'absolute';
  container.style.left = '-9999px';
  container.style.top = '0';
  container.style.width = '280px';
  container.style.background = '#fff';
  container.style.padding = '8px';
  container.style.boxSizing = 'border-box';
  container.style.fontSize = '9px';
  document.body.appendChild(container);

  const { createRoot } = await import('react-dom/client');

  const root = createRoot(container);
  root.render(
    <ExamPdfContent {...props} />
  );

  await new Promise((r) => setTimeout(r, 800));

  try {
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 7;
    const gap = 3;
    const colWidth = (pageWidth - margin * 2 - gap) / 2;
    const usableHeight = pageHeight - margin * 2;

    const headerEl = container.querySelector('[data-pdf-header]') as HTMLElement;
    let headerHeight = 0;
    if (headerEl) {
      const headerCanvas = await html2canvas(headerEl, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const headerImg = headerCanvas.toDataURL('image/png');
      const fullWidth = pageWidth - margin * 2;
      headerHeight = (headerCanvas.height / headerCanvas.width) * fullWidth;
      pdf.addImage(headerImg, 'PNG', margin, margin, fullWidth, headerHeight);
      headerHeight += 3;
    }

    const questions = container.querySelectorAll('[data-pdf-question]');
    const questionImages: { img: string; height: number }[] = [];

    for (const questionEl of questions) {
      const canvas = await html2canvas(questionEl as HTMLElement, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const imgData = canvas.toDataURL('image/png');
      const imgHeight = (canvas.height / canvas.width) * colWidth;
      questionImages.push({ img: imgData, height: imgHeight });
    }

    let leftY = margin + headerHeight;
    let rightY = margin + headerHeight;

    for (const { img, height } of questionImages) {
      if (leftY + height <= pageHeight - margin) {
        pdf.addImage(img, 'PNG', margin, leftY, colWidth, height);
        leftY += height + 1.5;
      } else if (rightY + height <= pageHeight - margin) {
        pdf.addImage(img, 'PNG', margin + colWidth + gap, rightY, colWidth, height);
        rightY += height + 1.5;
      } else {
        pdf.addPage();
        leftY = margin;
        rightY = margin;
        pdf.addImage(img, 'PNG', margin, leftY, colWidth, height);
        leftY += height + 1.5;
      }
    }

    const answerEl = container.querySelector('[data-pdf-answers]') as HTMLElement;
    if (answerEl) {
      pdf.addPage();
      const answerCanvas = await html2canvas(answerEl, { scale: 2, useCORS: true, backgroundColor: '#ffffff' });
      const answerImg = answerCanvas.toDataURL('image/png');
      const fullWidth = pageWidth - margin * 2;
      const answerHeight = (answerCanvas.height / answerCanvas.width) * fullWidth;
      pdf.addImage(answerImg, 'PNG', margin, margin, fullWidth, answerHeight);
    }

    pdf.save(`${props.title}.pdf`);
  } finally {
    root.unmount();
    document.body.removeChild(container);
    props.onComplete?.();
  }
}

function ExamPdfContent({ title, subjectName, difficulty, unitRange, items }: ExamPdfCaptureProps) {
  const sortedItems = [...items].sort((a, b) => a.orderIndex - b.orderIndex);

  return (
    <div style={{ fontFamily: "'Noto Sans KR', sans-serif", color: '#101013' }}>
      <div data-pdf-header style={{ textAlign: 'center', borderBottom: '2px solid #000', paddingBottom: 12, marginBottom: 20 }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
          2024학년도 직업탐구 영역 ({subjectName}) 모의고사
        </h1>
        <p style={{ fontSize: 11, color: '#555', margin: '4px 0 0' }}>
          {title} | 난이도: {difficulty} | 범위: {unitRange} | {items.length}문항
        </p>
      </div>

      {sortedItems.map((item) => (
        <div key={item.id} data-pdf-question style={{ marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid #ccc' }}>
          <QuestionRenderer
            question={item.question}
            questionNumber={item.orderIndex}
            selectedOption={null}
          />
        </div>
      ))}

      <div data-pdf-answers style={{ padding: 20 }}>
        <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, textAlign: 'center' }}>정답표</h2>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ border: '1px solid #333', padding: '6px 12px', background: '#f5f5f5' }}>문항</th>
              {sortedItems.map((item) => (
                <th key={item.id} style={{ border: '1px solid #333', padding: '6px 12px', background: '#f5f5f5' }}>
                  {item.orderIndex}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ border: '1px solid #333', padding: '6px 12px', fontWeight: 700, background: '#f5f5f5' }}>정답</td>
              {sortedItems.map((item) => (
                <td key={item.id} style={{ border: '1px solid #333', padding: '6px 12px', textAlign: 'center' }}>
                  {item.question.correct_answer ?? '-'}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
