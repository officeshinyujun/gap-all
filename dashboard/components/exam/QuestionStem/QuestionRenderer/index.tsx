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
}

export const QuestionRenderer: React.FC<QuestionRendererProps> = ({
  question,
  questionNumber,
  onSelect,
  selectedOption: externalSelected,
}) => {
  const [internalSelected, setInternalSelected] = useState<number | null>(null);
  const [showExplanation, setShowExplanation] = useState(false);

  const selectedOption = externalSelected !== undefined ? externalSelected : internalSelected;

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
        // selection_chips가 rows[].id와 매칭되면 행 레이블 역할 → 표 안에 표시
        // 매칭되지 않으면 정답 힌트 → 마스킹
        const chipsAreRowLabels = raw.selection_chips.every((chip) =>
          rowIds.includes(chip)
        );

        if (chipsAreRowLabels) {
          // 각 행의 cells[0]을 chip 레이블로 교체하여 표시
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
              label={question_stem}
            />
          );
        }

        return (
          <TPLComparativeMatrix
            data={{ ...raw, selection_chips: [] }}
            label={question_stem}
          />
        );
      }
      case 'TPL_FORMAL_DOCUMENT':
        return <TPLFormalDocument data={parsed.data} label={question_stem} />;
      case 'TPL_CONVERSATIONAL_FLOW':
        return <TPLConversationalFlow data={parsed.data} label={question_stem} />;
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
            label={question_stem}
          />
        );
      case 'TPL_SEQUENTIAL_WORKFLOW':
        return <TPLSequentialWorkflow data={parsed.data} label={question_stem} />;
      case 'TPL_INSTRUCTIONAL_SCENE':
        return <TPLInstructionalScene data={parsed.data} label={question_stem} />;
      case 'TPL_DIGITAL_FORUM_INTERFACE':
        return <TPLDigitalForumInterface data={parsed.data} label={question_stem} />;
      case 'TPL_QUANTITATIVE_CHART':
        return <TPLQuantitativeChart data={parsed.data} label={question_stem} />;
      case 'TPL_PROMOTIONAL_CANVAS':
        return <TPLPromotionalCanvas data={parsed.data} label={question_stem} />;
      default:
        return null;
    }
  };

  return (
    <VStack gap={20} fullWidth className={s.wrapper}>
      {/* 문제 번호 + 메타 */}
      <HStack gap={12} align="center" fullWidth>
        <div className={s.questionNumber}>{questionNumber}</div>
        <HStack gap={8} align="center">
          <span className={s.metaTag}>{metadata.unit_name}</span>
          <span className={s.metaTag}>{getTemplateLabel(resolvedTemplate)}</span>
          <span className={s.metaTagLight}>{metadata.target_concept}</span>
          {metadata.difficulty && (
            <span className={s.difficultyBadge} data-level={metadata.difficulty}>
              {metadata.difficulty}
            </span>
          )}
        </HStack>
      </HStack>

      {/* 지문 컴포넌트 */}
      <div className={s.stimulus}>
        {renderStimulus(parsed)}
      </div>

      {/* 보기 블록 */}
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
          return (
            <button
              key={num}
              className={`${s.optionRow} ${selectedOption === num ? s.optionSelected : ''}`}
              onClick={() => handleSelect(num)}
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

      {/* 해설 토글 */}
      <VStack gap={8} fullWidth>
        <button
          className={s.explanationToggle}
          onClick={() => setShowExplanation((v) => !v)}
        >
          {showExplanation ? '해설 닫기 ▲' : '해설 보기 ▼'}
        </button>
        {showExplanation && (
          <div className={s.explanationBox}>
            <Typo.SM size={12} color="secondary" as="p" className={s.explanationText}>
              {explanation ? getExplanationText(explanation) : '해설이 없습니다.'}
            </Typo.SM>
          </div>
        )}
      </VStack>
    </VStack>
  );
};
