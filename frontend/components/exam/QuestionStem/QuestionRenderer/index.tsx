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
} from '../index';
import { parseStimulus, getTemplateLabel, inferTemplate } from '@/utils/examParser';
import type { ExamQuestion, ParsedStimulus } from '@/types/examQuestion';
import { getExplanationText, getOptionNumber, normalizeOptions } from '@/types/examQuestion';
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
  const { question_stem, stimulus_data, options, options_list } = render_ready;

  // exam3.json은 explanation이 render_ready 밖 최상위에 위치
  const explanation = question.explanation ?? render_ready.explanation;

  // options 또는 options_list 통일
  const normalizedOptions = normalizeOptions(options, options_list);

  // recommended_template 없으면 자동 추론
  const resolvedTemplate = metadata.recommended_template ?? inferTemplate(stimulus_data) ?? '';
  const parsed = parseStimulus(resolvedTemplate, stimulus_data);

  const renderStimulus = (parsed: ParsedStimulus | null) => {
    if (!parsed) return null;

    switch (parsed.template) {
      case 'TPL_COMPARATIVE_MATRIX': {
        const raw = parsed.data;
        const rowIds = raw.rows.map((r) => String(r.id));
        const chipsAreRowLabels = raw.selection_chips.every((chip) =>
          rowIds.includes(chip)
        );

        if (chipsAreRowLabels) {
          const labeledRows = raw.rows.map((row) => ({
            ...row,
            cells: [String(row.id), ...row.cells],
          }));
          const labeledHeaders = [
            { id: '_label', label: '구분' },
            ...raw.headers,
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
      case 'TPL_FORMAL_DOCUMENT':
        return <TPLFormalDocument data={parsed.data} />;
      case 'TPL_CONVERSATIONAL_FLOW':
        return <TPLConversationalFlow data={parsed.data} />;
      case 'TPL_CASE_DIAGNOSTIC_FRAME':
        return (
          <TPLCaseDiagnosticFrame
            data={{
              ...parsed.data,
              check_items: parsed.data.check_items.map((item) => ({
                ...item,
                is_checked: false,
              })),
            }}
          />
        );
      case 'TPL_SEQUENTIAL_WORKFLOW':
        return <TPLSequentialWorkflow data={parsed.data} />;
      case 'TPL_INSTRUCTIONAL_SCENE':
        return <TPLInstructionalScene data={parsed.data} />;
      case 'TPL_DIGITAL_FORUM_INTERFACE':
        return <TPLDigitalForumInterface data={parsed.data} />;
      case 'TPL_QUANTITATIVE_CHART':
        return <TPLQuantitativeChart data={parsed.data} />;
      case 'TPL_PROMOTIONAL_CANVAS':
        return <TPLPromotionalCanvas data={parsed.data} />;
      case 'TPL_PLAIN_TEXT':
        return (
          <div className={s.stimulusPlainText}>
            {parsed.data.split('\n').filter(Boolean).map((line, i) => (
              <p key={i}>{line}</p>
            ))}
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <VStack gap={20} fullWidth className={flat ? s.wrapperFlat : s.wrapper}>
      <HStack gap={12} align="center" fullWidth>
        <div className={s.questionNumber}>{questionNumber}</div>
        <div className={s.questionStemText}>{question_stem}</div>
      </HStack>


      <div className={s.stimulus}>
        {renderStimulus(parsed)}
      </div>

      {question.combo_block && question.combo_block.items.length > 0 && (
        <VStack gap={4} fullWidth className={s.comboBlock}>
          <div className={s.comboBlockTitle}>{question.combo_block.title}</div>
          {question.combo_block.items.map((item) => (
            <div key={item.key} className={s.comboBlockItem}>
              {item.key}. {item.text}
            </div>
          ))}
        </VStack>
      )}

      {/* 선택지 */}
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
