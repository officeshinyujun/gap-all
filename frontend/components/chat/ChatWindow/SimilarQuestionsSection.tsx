import { QuestionRenderer } from '@shared/ui/QuestionStem/QuestionRenderer';
import { HighlightedStimulus } from '@shared/utils/highlightStimulus';
import type { SimilarQuestion } from '@shared/types/chat';
import s from './SimilarQuestionsSection.module.scss';

interface Props {
  questions: SimilarQuestion[];
  messageId: string;
  expandedCards: Set<string>;
  explanationOpen: Set<string>;
  onToggleCard: (key: string) => void;
  onToggleExplanation: (key: string) => void;
}

export function SimilarQuestionsSection({
  questions,
  messageId,
  expandedCards,
  explanationOpen,
  onToggleCard,
  onToggleExplanation,
}: Props) {
  return (
    <div className={s.section}>
      <div className={s.title}>
        📚 유사 문제 ({questions[0].conceptName})
      </div>
      <div className={s.cards}>
        {questions.map((sq, i) => {
          const cardKey = `${messageId}-${i}`;
          const isExpanded = expandedCards.has(cardKey);
          return (
            <SimilarQuestionCard
              key={cardKey}
              sq={sq}
              cardKey={cardKey}
              index={i}
              isExpanded={isExpanded}
              isExplanationOpen={explanationOpen.has(cardKey)}
              onToggleCard={() => onToggleCard(cardKey)}
              onToggleExplanation={() => onToggleExplanation(cardKey)}
            />
          );
        })}
      </div>
    </div>
  );
}

function SimilarQuestionCard({
  sq,
  cardKey,
  index,
  isExpanded,
  isExplanationOpen,
  onToggleCard,
  onToggleExplanation,
}: {
  sq: SimilarQuestion;
  cardKey: string;
  index: number;
  isExpanded: boolean;
  isExplanationOpen: boolean;
  onToggleCard: () => void;
  onToggleExplanation: () => void;
}) {
  const sourceLabel = sq.sourceExam
    ? sq.sourceExam
        .replace('학년도 대학수학능력시험 성공적인 직업생활', '수능')
        .replace('학년도 대학수학능력시험 직업탐구 영역(성공적인 직업생활)', '수능')
    : '유사 문제';

  return (
    <div className={s.card}>
      <button className={s.cardHeader} onClick={onToggleCard}>
        <div>
          <div className={s.source}>
            {sourceLabel}{sq.questionNumber ? ` ${sq.questionNumber}번` : ''}
          </div>
          <div className={s.concept}>{sq.conceptName}</div>
        </div>
        <span className={s.chevron}>{isExpanded ? '▲' : '▼'}</span>
      </button>
      {isExpanded && (
        <div className={s.cardBody}>
          <QuestionRenderer
            question={sq.question as any}
            questionNumber={index + 1}
            correctAnswer={sq.question.correct_answer ?? undefined}
            flat
          />
          <ConceptExplanation
            sq={sq}
            cardKey={cardKey}
            isOpen={isExplanationOpen}
            onToggle={onToggleExplanation}
          />
        </div>
      )}
    </div>
  );
}

function ConceptExplanation({
  sq,
  cardKey,
  isOpen,
  onToggle,
}: {
  sq: SimilarQuestion;
  cardKey: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const v2 = sq.conceptHighlightV2;
  if (!v2) return null;

  const hasClues = v2.stimulusClues?.length > 0;
  const hasFlow = v2.solvingFlow?.length > 0;
  const hasOptions = v2.optionAnalysis?.length > 0;
  const hasTakeaway = !!v2.takeaway;
  const hasSimilarity = (sq.matchedConcepts?.length ?? 0) > 0;
  if (!hasClues && !hasFlow && !hasOptions && !hasTakeaway && !hasSimilarity) return null;

  const hasCombo = (sq.question?.combo_block?.items?.length ?? 0) > 0;
  const markers = hasCombo ? ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ'] : ['①', '②', '③', '④', '⑤'];

  return (
    <>
      <button className={s.explanationBtn} onClick={onToggle}>
        {isOpen ? '▲ 해설 닫기' : '▼ 해설 보기'}
      </button>
      {isOpen && (
        <div className={s.explanationPanel}>
          {hasSimilarity && (
            <div>
              <div className={s.sectionTitle}>📎 이 문제와의 공통점</div>
              {sq.matchedConcepts?.map((inputConcept, i) => (
                <div key={i} className={s.similarityRow}>
                  <span className={s.similarityIcon}>↔</span>
                  <span className={s.similarityText}>
                    <strong>내 문제:</strong> 《{inputConcept}》 ↔ <strong>이 문제:</strong> 《{sq.conceptName}》
                  </span>
                </div>
              ))}
            </div>
          )}
          {hasClues && (
            <div>
              <div className={s.sectionTitle}>지문 단서</div>
              {sq.question?.rawStimulus && (
                <div className={s.rawStimulusBox}>
                  <HighlightedStimulus
                    text={sq.question.rawStimulus}
                    quotes={v2.stimulusClues!.map((c) => c.quote)}
                    highlightClassName={s.stimulusHighlight}
                  />
                </div>
              )}
              <div className={s.clueList}>
                {v2.stimulusClues!.map((clue, i) => (
                  <div key={i} className={s.clueBox}>
                    <span className={s.clueQuote}>
                      <mark className={s.stimulusHighlight}>{clue.quote}</mark>
                    </span>
                    <span className={s.clueWhy}>{clue.why}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {hasFlow && (
            <div>
              <div className={s.sectionTitle}>풀이 흐름</div>
              {v2.solvingFlow.map((step, i) => (
                <div key={i} className={s.solvingStep}>
                  <span className={s.stepNum}>{step.step}.</span>
                  <span className={s.stepText}>{step.action}</span>
                </div>
              ))}
            </div>
          )}
          {hasOptions && (
            <div>
              <div className={s.sectionTitle}>선택지 분석</div>
              {v2.optionAnalysis.map((opt, i) => (
                <div
                  key={i}
                  className={`${s.optionRow} ${opt.verdict === 'O' ? s.optionCorrectRow : s.optionWrongRow}`}
                >
                  <span className={s.optionLabel}>{markers[opt.optionNum - 1] ?? opt.optionNum}</span>
                  <span className={opt.verdict === 'O' ? s.verdictO : s.verdictX}>{opt.verdict}</span>
                  <span className={s.optionReasoning}>{opt.reasoning}</span>
                </div>
              ))}
            </div>
          )}
          {hasTakeaway && (
            <div>
              <div className={s.sectionTitle}>핵심 교훈</div>
              <div className={s.takeawayText}>{v2.takeaway}</div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
