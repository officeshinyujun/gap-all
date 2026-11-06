import { useState } from 'react';
import { VStack } from '@shared/ui/VStack';
import { HStack } from '@shared/ui/HStack';
import { MarkdownWithTable } from '@/shared/ui/markdown-with-table';
import s from './style.module.scss';

const CHOICE_LABELS = ['①', '②', '③', '④', '⑤'];

/** 공부 화면 conceptHighlightV2와 문제 해설 conceptHighlightV2가 공유하는 단계별 분석 데이터 */
export interface ConceptAnalysisData {
  solvingFlow: { step: number; action: string }[];
  stimulusClues: { quote: string; why: string }[];
  optionAnalysis: ({ optionNum: number; verdict: string; reasoning: string } | { optionKey: string; verdict: string; reasoning: string })[];
  takeaway: string;
}

type SectionKey = 'solvingFlow' | 'stimulusClues' | 'optionAnalysis' | 'takeaway';

const SECTIONS: readonly { key: SectionKey; label: string }[] = [
  { key: 'solvingFlow', label: '풀이 흐름' },
  { key: 'stimulusClues', label: '지문 단서' },
  { key: 'optionAnalysis', label: '선택지 분석' },
  { key: 'takeaway', label: '핵심 교훈' },
];

const DEFAULT_OPEN: Record<SectionKey, boolean> = { solvingFlow: true, stimulusClues: true, optionAnalysis: true, takeaway: false };

function hasSection(data: ConceptAnalysisData, key: SectionKey): boolean {
  return key === 'takeaway' ? data.takeaway.trim() !== '' : data[key].length > 0;
}

/**
 * "이 개념이 문제에서 어떻게 나왔나" 패널: 풀이 흐름 → 지문 단서 → 선택지 분석 → 핵심 교훈 아코디언.
 * 개념 학습 화면과 문제 해설(리뷰) 화면이 같은 모양으로 쓴다.
 */
export function ConceptAnalysisPanel({
  data,
  title = '이 개념이 문제에서 어떻게 나왔나',
  className,
}: {
  data: ConceptAnalysisData;
  title?: string;
  className?: string;
}) {
  const [open, setOpen] = useState<Record<SectionKey, boolean>>(DEFAULT_OPEN);
  const toggle = (key: SectionKey) => setOpen((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <div className={`${s.panel} ${className ?? ''}`}>
      <span className={s.panelTitle}>{title}</span>
      {SECTIONS.filter(({ key }) => hasSection(data, key)).map(({ key, label }) => (
        <div key={key} className={s.accordion}>
          <button type="button" className={s.accordionHeader} onClick={() => toggle(key)} aria-expanded={open[key]}>
            <span>{label}</span>
            <span className={s.chevron}>{open[key] ? '▲' : '▼'}</span>
          </button>
          {open[key] && (
            <div className={s.accordionBody}>
              {key === 'solvingFlow' && (
                <VStack gap={6} fullWidth>
                  {data.solvingFlow.map((step, i) => (
                    <div key={i} className={s.solvingStep}>
                      <span className={s.stepNum}>{step.step}</span>
                      <span className={s.stepText}>{step.action}</span>
                    </div>
                  ))}
                </VStack>
              )}
              {key === 'stimulusClues' && (
                <VStack gap={8} fullWidth>
                  {data.stimulusClues.map((clue, i) => (
                    <div key={i} className={s.clueBox}>
                      <p className={s.clueQuote}><mark className={s.highlight}>{clue.quote}</mark></p>
                      <MarkdownWithTable className={s.clueWhy}>{clue.why}</MarkdownWithTable>
                    </div>
                  ))}
                </VStack>
              )}
              {key === 'optionAnalysis' && (
                <VStack gap={6} fullWidth>
                  {data.optionAnalysis.map((option, i) => {
                    const label = 'optionKey' in option ? option.optionKey : CHOICE_LABELS[option.optionNum - 1] ?? String(option.optionNum);
                    const correct = option.verdict === 'O';
                    return (
                      <div key={i} className={`${s.optionRow} ${correct ? s.optionCorrectRow : ''}`}>
                        <HStack gap={8} align="start">
                          <span className={s.optionNum}>{label}</span>
                          <span className={`${s.verdict} ${correct ? s.verdictO : s.verdictX}`}>{option.verdict}</span>
                          <MarkdownWithTable className={s.optionReasoning}>{option.reasoning}</MarkdownWithTable>
                        </HStack>
                      </div>
                    );
                  })}
                </VStack>
              )}
              {key === 'takeaway' && <MarkdownWithTable className={s.takeaway}>{data.takeaway}</MarkdownWithTable>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
