'use client';

import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { VStack } from '@shared/ui/VStack';
import { HStack } from '@shared/ui/HStack';
import Typo from '@shared/ui/Typo';
import { QuestionRenderer } from '@shared/ui/QuestionStem/QuestionRenderer';
import { useConceptStudy } from '../model/useConceptStudy';
import s from '@/app/(main)/study/[subject]/[chapter]/concept/page.module.scss';

function parseUnitNumber(chapter: string): number {
  const match = chapter.match(/\d+/);
  return match ? parseInt(match[0], 10) : 1;
}

function highlightStimulus(text: string, quotes: string[]): React.ReactNode {
  if (!text || quotes.length === 0) return <span>{text}</span>;

  const sortedQuotes = [...quotes].sort((a, b) => b.length - a.length);
  const parts: { text: string; highlight: boolean }[] = [{ text, highlight: false }];

  for (const quote of sortedQuotes) {
    const newParts: { text: string; highlight: boolean }[] = [];
    for (const part of parts) {
      if (part.highlight) { newParts.push(part); continue; }
      const idx = part.text.indexOf(quote);
      if (idx === -1) { newParts.push(part); continue; }
      if (idx > 0) newParts.push({ text: part.text.slice(0, idx), highlight: false });
      newParts.push({ text: quote, highlight: true });
      if (idx + quote.length < part.text.length) newParts.push({ text: part.text.slice(idx + quote.length), highlight: false });
    }
    parts.splice(0, parts.length, ...newParts);
  }

  return (
    <>
      {parts.map((p, i) =>
        p.highlight
          ? <mark key={i} className={s.stimulusHighlight}>{p.text}</mark>
          : <span key={i}>{p.text}</span>
      )}
    </>
  );
}

export function ConceptStudyPage({
  params,
}: {
  params: Promise<{ subject: string; chapter: string }>;
}) {
  const { subject, chapter } = use(params);
  const unitNumber = parseUnitNumber(chapter);
  const router = useRouter();

  const {
    mainTab, setMainTab, slideView, setSlideView,
    loading, error, data, concepts, current, total, currentIndex,
    deepLoading, deep,
    structured, structuredLoading, openSections, toggleSection,
    bookmarks, bookmarkLoading, isBookmarked, handleBookmark,
    openAnalysis, toggleAnalysis,
    handlePrev, handleNext, handleComplete, isFirst, isLast,
  } = useConceptStudy(subject, unitNumber, chapter);

  const [keyPointsOpen, setKeyPointsOpen] = useState(false);

  const v2 = current?.conceptHighlightV2;
  const questionSource = current?.sampleQuestion.questionSource ?? current?.sampleQuestion.metadata?.source_exam;
  const analysisExplanation = v2?.takeaway ?? null;

  if (loading) return <div className={s.container}><div className={s.center}><div className={s.spinner} /></div></div>;
  if (error) return <div className={s.container}><div className={s.center}><span className={s.errorText}>{error}</span></div></div>;

  return (
    <div className={s.container}>
      <div className={s.header}>
        <button className={s.backButton} onClick={() => router.back()}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 12L6 8L10 4" stroke="#5C6370" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <span className={s.headerTitle}>
          {data?.unitTitle ? `${unitNumber}단원 · ${data.unitTitle}` : `${unitNumber}단원 · 빈출 개념`}
        </span>
        <button
          className={`${s.overviewIconBtn} ${mainTab === 'overview' ? s.overviewIconBtnActive : ''}`}
          onClick={() => setMainTab(mainTab === 'overview' ? 'concept' : 'overview')}
          aria-label="단원 개요"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="2" y="3" width="12" height="1.5" rx="0.75" fill="currentColor"/>
            <rect x="2" y="7" width="8" height="1.5" rx="0.75" fill="currentColor"/>
            <rect x="2" y="11" width="10" height="1.5" rx="0.75" fill="currentColor"/>
          </svg>
        </button>
      </div>

      {mainTab === 'concept' && (
        <div className={s.subHeader}>
          <div className={s.slideViewToggle}>
            <button className={`${s.slideViewBtn} ${slideView === 'learn' ? s.slideViewBtnActive : ''}`} onClick={() => setSlideView('learn')}>개념 학습</button>
            <button className={`${s.slideViewBtn} ${slideView === 'question' ? s.slideViewBtnActive : ''}`} onClick={() => setSlideView('question')}>문제 적용</button>
          </div>
          <span className={s.headerCount}>{currentIndex + 1} / {total}</span>
        </div>
      )}

      {mainTab === 'concept' && (
        <>
          <div className={s.slideArea}>
            {current && slideView === 'learn' && (
              <div className={s.learnView}>
                <VStack gap={20} fullWidth>
                  {/* 헤더 */}
                  <HStack gap={10} align="center" justify="between" fullWidth>
                    <HStack gap={10} align="center">
                      <span className={s.rankBadge}>{current.rank}</span>
                      <Typo.BD size={16}>{current.name}</Typo.BD>
                      <span className={s.frequencyLabel}>{current.frequency}회 출제</span>
                    </HStack>
                    <button
                      className={`${s.bookmarkBtn} ${isBookmarked(current.name) ? s.bookmarkBtnActive : ''}`}
                      onClick={() => handleBookmark(current)}
                      disabled={bookmarkLoading[current.name]}
                      aria-label={isBookmarked(current.name) ? '북마크 제거' : '북마크 추가'}
                    >
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                        <path d="M3 2.5A1.5 1.5 0 0 1 4.5 1h7A1.5 1.5 0 0 1 13 2.5v12l-5-3-5 3v-12Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill={isBookmarked(current.name) ? 'currentColor' : 'none'} />
                      </svg>
                    </button>
                  </HStack>

                  {/* 섹션 1 — 개념 정의 */}
                  {current.description && (
                    <VStack gap={8} fullWidth>
                      <span className={s.sectionTitle}>개념 정의</span>
                      <div className={s.markdownContent}>
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>{current.description}</ReactMarkdown>
                      </div>
                    </VStack>
                  )}

                  {/* 섹션 2 — 핵심 포인트 (토글, 기본 닫힘) */}
                  {current.keyPoints.length > 0 && (
                    <VStack gap={8} fullWidth>
                      <button
                        className={s.keyPointsToggle}
                        onClick={() => setKeyPointsOpen((prev) => !prev)}
                      >
                        <span className={s.sectionTitle}>핵심 포인트 ({current.keyPoints.length})</span>
                        <span className={s.accordionChevron}>{keyPointsOpen ? '▲' : '▼'}</span>
                      </button>
                      {keyPointsOpen && (
                        <div className={s.keyPointsGrid}>
                          {current.keyPoints.map((point, i) => (
                            <div key={i} className={s.keyPointCard}>
                              <p>{point}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </VStack>
                  )}

                  {/* 섹션 3 — 오답 주의 및 실제 출제 포인트 */}
                  {(() => {
                    const items = [
                      ...current.examTips,
                      ...(deep?.found ? deep.trapPoints : []),
                      ...(v2?.takeaway ? [v2.takeaway] : []),
                    ];
                    if (items.length === 0) return null;
                    return (
                      <VStack gap={8} fullWidth>
                        <span className={s.sectionTitle}>⚠️ 오답 주의 및 실제 출제 포인트</span>
                        <VStack gap={6} fullWidth>
                          {items.map((item, i) => (
                            <div key={i} className={s.trapBox}>{item}</div>
                          ))}
                        </VStack>
                      </VStack>
                    );
                  })()}

                  {/* 섹션 4 — 출처 태그 */}
                  {current.sources.length > 0 && (
                    <div className={s.tagsRow}>
                      {current.sources.map((src, i) => <span key={i} className={s.examTag}>{src}</span>)}
                    </div>
                  )}
                </VStack>
              </div>
            )}

            {current && slideView === 'question' && (
              <div className={s.questionTwoCol}>
                <div className={s.questionCol}>
                  {questionSource && (
                    <HStack justify="between" align="center" fullWidth className={s.questionSourceRow}>
                      <span className={s.questionSourceLabel}>유사 출제 문제</span>
                      <span className={s.questionSourceBadge}>
                        {questionSource}{current.sampleQuestion.questionNumber != null && ` ${current.sampleQuestion.questionNumber}번`}
                      </span>
                    </HStack>
                  )}
                  <QuestionRenderer
                    question={{ ...current.sampleQuestion, explanation: current.sampleQuestion.explanation ?? current.sampleQuestion.render_ready?.explanation ?? (analysisExplanation || undefined) }}
                    questionNumber={currentIndex + 1}
                    correctAnswer={current.sampleQuestion.correct_answer}
                    flat
                  />
                </div>
                <div className={s.analysisPanel}>
                  <span className={s.analysisPanelTitle}>이 개념이 문제에서 어떻게 나왔나</span>
                  {(['solvingFlow', 'stimulusClues', 'optionAnalysis', 'takeaway'] as const).map((key) => {
                    const labels: Record<string, string> = { solvingFlow: '풀이 흐름', stimulusClues: '지문 단서', optionAnalysis: '선택지 분석', takeaway: '핵심 교훈' };
                    const hasData = v2 && (key === 'solvingFlow' ? v2.solvingFlow.length > 0 : key === 'stimulusClues' ? v2.stimulusClues.length > 0 : key === 'optionAnalysis' ? v2.optionAnalysis.length > 0 : !!v2.takeaway);
                    if (!hasData) return null;
                    return (
                      <div key={key} className={s.analysisAccordion}>
                        <button className={s.analysisAccordionHeader} onClick={() => toggleAnalysis(key)}>
                          <span>{labels[key]}</span>
                          <span className={s.analysisChevron}>{openAnalysis[key] ? '▲' : '▼'}</span>
                        </button>
                        {openAnalysis[key] && (
                          <div className={s.analysisAccordionBody}>
                            {key === 'solvingFlow' && v2 && (
                              <VStack gap={6} fullWidth>
                                {v2.solvingFlow.map((step, i) => <div key={i} className={s.solvingStep}><span className={s.stepNum}>{step.step}</span><span className={s.stepText}>{step.action}</span></div>)}
                              </VStack>
                            )}
                            {key === 'stimulusClues' && v2 && (
                              <VStack gap={12} fullWidth>
                                {/* 원본 지문 + 하이라이팅 */}
                                {current?.sampleQuestion.rawStimulus && (
                                  <div className={s.rawStimulusBox}>
                                    {highlightStimulus(
                                      current.sampleQuestion.rawStimulus,
                                      v2.stimulusClues.map(c => c.quote)
                                    )}
                                  </div>
                                )}
                                {/* 단서 분석 */}
                                <VStack gap={8} fullWidth>
                                  {v2.stimulusClues.map((clue, i) => (
                                    <div key={i} className={s.clueBox}>
                                      <p className={s.clueQuote}><mark className={s.stimulusHighlight}>{clue.quote}</mark></p>
                                      <p className={s.clueWhy}>{clue.why}</p>
                                    </div>
                                  ))}
                                </VStack>
                              </VStack>
                            )}
                            {key === 'optionAnalysis' && v2 && (
                              <VStack gap={6} fullWidth>
                                {v2.optionAnalysis.map((opt, i) => {
                                  const hasComboBlock = !!current?.sampleQuestion?.combo_block?.items?.length;
                                  const label = hasComboBlock
                                    ? (['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ'][opt.optionNum - 1] ?? String(opt.optionNum))
                                    : (['①', '②', '③', '④', '⑤'][opt.optionNum - 1] ?? String(opt.optionNum));
                                  return (
                                    <div key={i} className={`${s.optionAnalysisRow} ${opt.verdict === 'O' ? s.optionCorrectRow : s.optionWrongRow}`}>
                                      <HStack gap={8} align="start">
                                        <span className={s.optionAnalysisNum}>{label}</span>
                                        <span className={`${s.verdict} ${opt.verdict === 'O' ? s.verdictO : s.verdictX}`}>{opt.verdict}</span>
                                        <span className={s.optionReasoning}>{opt.reasoning}</span>
                                      </HStack>
                                    </div>
                                  );
                                })}
                              </VStack>
                            )}
                            {key === 'takeaway' && v2 && <p className={s.takeawayText}>{v2.takeaway}</p>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {!v2 && <p className={s.noAnalysisText}>분석 데이터가 없습니다.</p>}
                </div>
              </div>
            )}
          </div>

          <div className={s.footer}>
            <button className={s.navButton} onClick={handlePrev} disabled={isFirst}>← 이전</button>
            <span className={s.footerHint}>{slideView === 'learn' ? '개념 학습' : '문제 적용'}</span>
            {isLast ? (
              <button className={`${s.navButton} ${s.navButtonNext}`} onClick={handleComplete}>빈칸 문제 풀기 →</button>
            ) : (
              <button className={`${s.navButton} ${s.navButtonPrimary}`} onClick={handleNext}>{slideView === 'learn' ? '문제 보기 →' : '다음 개념 →'}</button>
            )}
          </div>
        </>
      )}

      {mainTab === 'overview' && (
        <div className={s.overviewArea}>
          {structuredLoading ? (
            <div className={s.center}><div className={s.spinner} /></div>
          ) : !structured ? (
            <div className={s.center}><span className={s.errorText}>단원 개요 데이터가 없습니다.</span></div>
          ) : (
            <VStack gap={24} fullWidth>
              {structured.learningObjectives.length > 0 && (
                <VStack gap={10} fullWidth>
                  <span className={s.overviewSectionTitle}>학습 목표</span>
                  <ul className={s.bulletList}>{structured.learningObjectives.map((obj, i) => <li key={i}>{obj}</li>)}</ul>
                </VStack>
              )}
              {structured.sections.map((section, si) => (
                <VStack key={si} gap={0} fullWidth className={s.accordionGroup}>
                  <button className={s.accordionHeader} onClick={() => toggleSection(`s-${si}`)}>
                    <span>{section.title}</span>
                    <span className={s.accordionChevron}>{openSections[`s-${si}`] ? '▲' : '▼'}</span>
                  </button>
                  {openSections[`s-${si}`] && (
                    <VStack gap={0} fullWidth>
                      {section.summary && <p className={s.sectionSummary}>{section.summary}</p>}
                      {section.subsections.map((sub, ssi) => (
                        <VStack key={ssi} gap={0} fullWidth className={s.subAccordionGroup}>
                          <button className={s.subAccordionHeader} onClick={() => toggleSection(`s-${si}-${ssi}`)}>
                            <span>{sub.title}</span>
                            <span className={s.accordionChevron}>{openSections[`s-${si}-${ssi}`] ? '▲' : '▼'}</span>
                          </button>
                          {openSections[`s-${si}-${ssi}`] && (
                            <VStack gap={12} fullWidth className={s.subAccordionBody}>
                              {sub.explanation && <p className={s.subText}>{sub.explanation}</p>}
                              {sub.keyPoints.length > 0 && <VStack gap={6} fullWidth><span className={s.sectionTitle}>핵심 포인트</span><ul className={s.bulletList}>{sub.keyPoints.map((p, i) => <li key={i}>{p}</li>)}</ul></VStack>}
                              {sub.table && <div className={s.markdownContent}><ReactMarkdown remarkPlugins={[remarkGfm]}>{sub.table}</ReactMarkdown></div>}
                              {sub.visualGuide && <div className={s.tipBox}>{sub.visualGuide}</div>}
                              {sub.examPoints.length > 0 && <VStack gap={6} fullWidth><span className={s.sectionTitle}>시험 포인트</span><ul className={s.bulletList}>{sub.examPoints.map((p, i) => <li key={i}>{p}</li>)}</ul></VStack>}
                              {sub.pitfalls.length > 0 && <VStack gap={6} fullWidth><span className={s.sectionTitle}>주의 사항</span><VStack gap={6} fullWidth>{sub.pitfalls.map((p, i) => <div key={i} className={s.trapBox}>{p}</div>)}</VStack></VStack>}
                              {sub.supplementNote && <div className={s.logicBox}>{sub.supplementNote}</div>}
                            </VStack>
                          )}
                        </VStack>
                      ))}
                    </VStack>
                  )}
                </VStack>
              ))}
              {structured.closingSummary.length > 0 && (
                <VStack gap={10} fullWidth>
                  <span className={s.overviewSectionTitle}>마무리 정리</span>
                  <VStack gap={6} fullWidth>{structured.closingSummary.map((summary, i) => <div key={i} className={s.tipBox}>{summary}</div>)}</VStack>
                </VStack>
              )}
            </VStack>
          )}
        </div>
      )}
    </div>
  );
}
