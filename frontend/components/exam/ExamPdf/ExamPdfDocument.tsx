import React from 'react';
import { Document, Page, View, Text } from '@react-pdf/renderer';
import { styles } from './styles';
import { PdfStimulusRenderer } from './PdfStimulusRenderer';
import type { ExamItem } from '@/lib/examApi';

const CIRCLED_NUMBERS = ['①', '②', '③', '④', '⑤'];

interface ExamPdfDocumentProps {
  title: string;
  subjectName: string;
  difficulty: string;
  unitRange: string;
  items: ExamItem[];
}

function QuestionBlock({ item }: { item: ExamItem }) {
  const q = item.question;
  const template = q.metadata.recommended_template;
  const options = q.render_ready.options_list ?? q.render_ready.options?.map((o) => o.text) ?? [];

  return (
    <View style={styles.questionBlock} wrap={false}>
      <Text style={styles.questionStem}>
        {item.orderIndex}. {q.render_ready.question_stem}
      </Text>
      <PdfStimulusRenderer template={template} data={q.render_ready.stimulus_data} />
      {q.combo_block && q.combo_block.items.length > 0 && (
        <View style={{ marginTop: 3, marginBottom: 3, padding: 4, borderWidth: 0.5, borderColor: '#999', borderStyle: 'solid', backgroundColor: '#f8f8f8' }}>
          <Text style={{ fontSize: 7, fontWeight: 700, textAlign: 'center', marginBottom: 2 }}>
            {q.combo_block.title}
          </Text>
          {q.combo_block.items.map((item) => (
            <Text key={item.key} style={{ fontSize: 6.5, lineHeight: 1.4, marginBottom: 1 }}>
              {item.key}. {item.text}
            </Text>
          ))}
        </View>
      )}
      {options.length > 0 && (
        <View style={{ marginTop: 4 }}>
          {options.map((opt, i) => (
            <Text key={i} style={styles.optionText}>
              {CIRCLED_NUMBERS[i] ?? `${i + 1}`} {opt}
            </Text>
          ))}
        </View>
      )}
    </View>
  );
}

function AnswerKeySection({ items }: { items: ExamItem[] }) {
  const COLS = 5;
  const rows: ExamItem[][] = [];
  for (let i = 0; i < items.length; i += COLS) {
    rows.push(items.slice(i, i + COLS));
  }

  return (
    <View break>
      <Text style={styles.answerKeyTitle}>정답표</Text>
      <View style={{ borderTopWidth: 0.5, borderTopColor: '#000', borderTopStyle: 'solid' as const, borderLeftWidth: 0.5, borderLeftColor: '#000', borderLeftStyle: 'solid' as const }}>
        {rows.map((row, ri) => (
          <React.Fragment key={ri}>
            <View style={styles.answerKeyRow}>
              <Text style={styles.answerKeyCellHeader}>문항</Text>
              {row.map((item) => (
                <Text key={item.id} style={styles.answerKeyCell}>{item.orderIndex}</Text>
              ))}
              {Array.from({ length: COLS - row.length }).map((_, i) => (
                <Text key={`empty-h-${i}`} style={styles.answerKeyCell} />
              ))}
            </View>
            <View style={styles.answerKeyRow}>
              <Text style={styles.answerKeyCellHeader}>정답</Text>
              {row.map((item) => (
                <Text key={item.id} style={styles.answerKeyCell}>
                  {item.question.correct_answer ?? '-'}
                </Text>
              ))}
              {Array.from({ length: COLS - row.length }).map((_, i) => (
                <Text key={`empty-a-${i}`} style={styles.answerKeyCell} />
              ))}
            </View>
          </React.Fragment>
        ))}
      </View>
    </View>
  );
}

export function ExamPdfDocument({ title, subjectName, difficulty, unitRange, items }: ExamPdfDocumentProps) {
  const sortedItems = [...items].sort((a, b) => a.orderIndex - b.orderIndex);

  const pages: { left: ExamItem[]; right: ExamItem[] }[] = [];
  let leftItems: ExamItem[] = [];
  let rightItems: ExamItem[] = [];
  const maxPerColumn = 2;

  for (let i = 0; i < sortedItems.length; i++) {
    if (leftItems.length < maxPerColumn) {
      leftItems.push(sortedItems[i]);
    } else if (rightItems.length < maxPerColumn) {
      rightItems.push(sortedItems[i]);
    } else {
      pages.push({ left: leftItems, right: rightItems });
      leftItems = [sortedItems[i]];
      rightItems = [];
    }
  }
  if (leftItems.length > 0 || rightItems.length > 0) {
    pages.push({ left: leftItems, right: rightItems });
  }

  return (
    <Document>
      {pages.map((page, pageIdx) => (
        <Page key={pageIdx} size="A4" style={styles.page}>
          {pageIdx === 0 && (
            <View style={styles.header}>
              <Text style={styles.headerTitle}>
                2024학년도 직업탐구 영역 ({subjectName}) 모의고사
              </Text>
              <Text style={styles.headerInfo}>
                {title} | 난이도: {difficulty} | 범위: {unitRange} | {items.length}문항
              </Text>
            </View>
          )}

          <View style={styles.columnsContainer}>
            <View style={styles.column}>
              {page.left.map((item) => (
                <QuestionBlock key={item.id} item={item} />
              ))}
            </View>
            <View style={styles.columnDivider} />
            <View style={styles.column}>
              {page.right.map((item) => (
                <QuestionBlock key={item.id} item={item} />
              ))}
            </View>
          </View>

          <Text style={styles.footer}>
            {pageIdx + 1} / {pages.length + 1}
          </Text>
        </Page>
      ))}

      <Page size="A4" style={styles.page}>
        <AnswerKeySection items={sortedItems} />
      </Page>
    </Document>
  );
}
