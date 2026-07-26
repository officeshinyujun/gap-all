'use client';

import React, { useState } from 'react';
import { VStack } from '@/components/general/VStack';
import { HStack } from '@/components/general/HStack';
import Typo from '@/components/general/Typo';
import { SelectionChip } from '../_shared/SelectionChip';
import {
  TPLComparativeMatrix,
  TPLFormalDocument,
  TPLConversationalFlow,
  TPLCaseDiagnosticFrame,
  TPLSequentialWorkflow,
  TPLInstructionalScene,
  TPLDigitalForumInterface,
  TPLQuantitativeChart,
  TPLPromotionalCanvas,
  TPLArticle,
  TPLStatistics,
  TPLIncidentReport,
  TPLAnnouncement,
  TPLReport,
} from '../index';
import { parseStimulus, getTemplateLabel, inferTemplate } from '@shared/utils/examParser';
import type { ExamQuestion, ParsedStimulus } from '@/types/examQuestion';
import { getExplanationText, getOptionNumber, normalizeOptions } from '@/types/examQuestion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import s from './index.module.scss';

export interface QuestionRendererProps {
  question: ExamQuestion;
  questionNumber: number;
  onSelect?: (optionNumber: number) => void;
  selectedOption?: number | null;
  correctAnswer?: number | null;
  showExplanation?: boolean;
  flat?: boolean;
}

function renderPlainTextFallback(data: unknown, className?: string): React.ReactNode {
  const text = typeof data === 'string' ? data
    : data && typeof data === 'object' ? JSON.stringify(data, null, 2)
    : String(data ?? '');
  if (!text.trim()) return null;
  return (
    <div className={className ?? s.stimulusPlainText}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
    </div>
  );
}

class StimulusErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: React.ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

export const QuestionRenderer: React.FC<QuestionRendererProps> = ({
  question,
  questionNumber,
  onSelect,
  selectedOption: externalSelected,
  correctAnswer: correctAnswerProp,
  showExplanation: showExplanationProp,
  flat,
}) => {
  const [internalSelected, setInternalSelected] = useState<number | null>(null);
  const [explanationVisible, setExplanationVisible] = useState(showExplanationProp ?? false);

  const selectedOption = externalSelected !== undefined ? externalSelected : internalSelected;
  const isReviewMode = correctAnswerProp != null;

  function handleSelect(num: number) {
    if (externalSelected === undefined) setInternalSelected(num);
    onSelect?.(num);
  }

  const { metadata, render_ready } = question;
  const { question_stem: raw_stem, stimulus_data, options, options_list } = render_ready;
  const question_stem = raw_stem.replace(/^\d+\.\s*/, '');

  const explanation = question.explanation ?? render_ready.explanation;

  const normalizedOptions = normalizeOptions(options, options_list);

  const resolvedTemplate = metadata.recommended_template || inferTemplate(stimulus_data) || '';
  const parsed = parseStimulus(resolvedTemplate, stimulus_data);

  const renderStimulus = (parsed: ParsedStimulus | null) => {
    if (!parsed) return renderPlainTextFallback(stimulus_data);

    switch (parsed.template) {
      case 'TPL_COMPARATIVE_MATRIX': {
        const raw = parsed.data;
        if (!raw) return renderPlainTextFallback(stimulus_data);
        const rows = raw.rows ?? [];
        const headers = raw.headers ?? [];
        if (!rows.length || !headers.length) return renderPlainTextFallback(stimulus_data);
        const rowIds = rows.map((r) => String(r.id));
        const chipsAreRowLabels = raw.selection_chips?.every((chip) =>
          rowIds.includes(chip)
        );

        if (chipsAreRowLabels) {
          const labeledRows = rows.map((row) => ({
            ...row,
            cells: [String(row.id), ...(row.cells ?? [])],
          }));
          const labeledHeaders = [
            { id: '_label', label: '구분' },
            ...headers,
          ];
          return (
            <TPLComparativeMatrix
              data={{ ...raw, headers: labeledHeaders, rows: labeledRows, selection_chips: [] }}
            />
          );
        }

        return (
          <TPLComparativeMatrix
            data={{ ...raw, selection_chips: [] }}
          />
        );
      }
      case 'TPL_FORMAL_DOCUMENT': {
        const raw = parsed.data;
        if (!raw || !raw.paragraphs?.length) return renderPlainTextFallback(stimulus_data);
        return <TPLFormalDocument data={raw} />;
      }
      case 'TPL_CONVERSATIONAL_FLOW': {
        const raw = parsed.data;
        if (!raw || !raw.messages?.length) return renderPlainTextFallback(stimulus_data);
        return <TPLConversationalFlow data={raw} />;
      }
      case 'TPL_CASE_DIAGNOSTIC_FRAME': {
        const raw = parsed.data;
        if (!raw) return renderPlainTextFallback(stimulus_data);
        return (
          <TPLCaseDiagnosticFrame
            data={{
              ...raw,
              case_profile: raw.case_profile ?? { name: '', context: '' },
              check_items: Array.isArray(raw.check_items)
                ? raw.check_items.map((item) => ({
                    ...item,
                    is_checked: false,
                  }))
                : [],
            }}
          />
        );
      }
      case 'TPL_SEQUENTIAL_WORKFLOW': {
        const raw = parsed.data;
        if (!raw || !raw.steps?.length) return renderPlainTextFallback(stimulus_data);
        return <TPLSequentialWorkflow data={raw} />;
      }
      case 'TPL_INSTRUCTIONAL_SCENE': {
        const raw = parsed.data;
        if (!raw || !raw.instructor?.text) return renderPlainTextFallback(stimulus_data);
        return <TPLInstructionalScene data={raw} />;
      }
      case 'TPL_DIGITAL_FORUM_INTERFACE': {
        const raw = parsed.data;
        if (!raw || !raw.main_post?.content) return renderPlainTextFallback(stimulus_data);
        return <TPLDigitalForumInterface data={raw} />;
      }
      case 'TPL_QUANTITATIVE_CHART': {
        const raw = parsed.data;
        if (!raw || !raw.datasets?.length || !raw.axes?.length) return renderPlainTextFallback(stimulus_data);
        return <TPLQuantitativeChart data={raw} />;
      }
      case 'TPL_PROMOTIONAL_CANVAS': {
        const raw = parsed.data;
        if (!raw || (!raw.slogan && !raw.bullets?.length)) return renderPlainTextFallback(stimulus_data);
        return <TPLPromotionalCanvas data={raw} />;
      }
      case 'TPL_ARTICLE': {
        const raw = parsed.data;
        if (!raw || !raw.body_paragraphs?.length) return renderPlainTextFallback(stimulus_data);
        return <TPLArticle data={raw} />;
      }
      case 'TPL_STATISTICS': {
        const raw = parsed.data;
        if (!raw || !raw.data_entries?.length) return renderPlainTextFallback(stimulus_data);
        return <TPLStatistics data={raw} />;
      }
      case 'TPL_INCIDENT_REPORT': {
        const raw = parsed.data;
        if (!raw || !raw.overview) return renderPlainTextFallback(stimulus_data);
        return <TPLIncidentReport data={raw} />;
      }
      case 'TPL_ANNOUNCEMENT': {
        const raw = parsed.data;
        if (!raw || !raw.title || !raw.details?.length) return renderPlainTextFallback(stimulus_data);
        return <TPLAnnouncement data={raw} />;
      }
      case 'TPL_REPORT': {
        const raw = parsed.data;
        if (!raw || !raw.sections?.length) return renderPlainTextFallback(stimulus_data);
        return <TPLReport data={raw} />;
      }
      case 'TPL_PLAIN_TEXT':
        if (!parsed.data || (typeof parsed.data === 'string' && !parsed.data.trim())) {
          return renderPlainTextFallback(stimulus_data);
        }
        return (
          <div className={s.stimulusPlainText}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {parsed.data}
            </ReactMarkdown>
          </div>
        );
      default:
        return renderPlainTextFallback(stimulus_data);
    }
  };

  return (
    <VStack gap={20} fullWidth className={flat ? s.wrapperFlat : s.wrapper}>
      <HStack gap={12} align="center" fullWidth>
        <div className={s.questionNumber}>{questionNumber}</div>
        <div className={s.questionStemText}>{question_stem}</div>
      </HStack>

      <div className={s.stimulus}>
        <StimulusErrorBoundary fallback={renderPlainTextFallback(stimulus_data)}>
          {renderStimulus(parsed)}
        </StimulusErrorBoundary>
      </div>

      {question.combo_block && question.combo_block.items?.length > 0 && (
        <VStack gap={4} fullWidth className={s.comboBlock}>
          <div className={s.comboBlockTitle}>{question.combo_block.title}</div>
          {question.combo_block.items.map((item) => (
            <div key={item.key} className={s.comboBlockItem}>
              {item.key}. {item.text}
            </div>
          ))}
        </VStack>
      )}

      <VStack gap={8} fullWidth className={s.optionsSection}>
        {normalizedOptions.map((option) => {
          const num = getOptionNumber(option);
          const isCorrect = isReviewMode && num === correctAnswerProp;
          const isWrong = isReviewMode && selectedOption === num && num !== correctAnswerProp;
          return (
            <button
              key={num}
              className={`${s.optionRow} ${selectedOption === num ? s.optionSelected : ''} ${isCorrect ? s.optionCorrect : ''} ${isWrong ? s.optionWrong : ''}`}
              onClick={() => !isReviewMode && handleSelect(num)}
              disabled={isReviewMode}
            >
              <HStack gap={10} align="center">
                <SelectionChip
                  number={num as 1 | 2 | 3 | 4 | 5}
                  selected={selectedOption === num}
                />
                <span className={s.optionText}>{option.text}</span>
              </HStack>
            </button>
          );
        })}
      </VStack>

      {isReviewMode && explanation && getExplanationText(explanation) && (
        <VStack gap={12} fullWidth>
          <div className={s.explanationDivider} />
          <div className={s.explanationBox}>
            <Typo.SM size={14} color="primary" style={{ fontWeight: 600, marginBottom: 8 }}>해설</Typo.SM>
            <Typo.SM size={12} color="secondary" as="p" className={s.explanationText}>
              {getExplanationText(explanation)}
            </Typo.SM>
          </div>
        </VStack>
      )}
    </VStack>
  );
};
