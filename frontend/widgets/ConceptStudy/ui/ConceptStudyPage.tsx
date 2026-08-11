'use client';

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { MarkdownWithTable } from '@/shared/ui/markdown-with-table';
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

function importanceLabel(
  patterns: readonly { frequency: number }[],
  index: number,
): string {
  const frequency = patterns[index]?.frequency ?? 0;
  const rank = patterns.filter((pattern) => pattern.frequency > frequency).length + 1;
  return patterns.filter((pattern) => pattern.frequency === frequency).length > 1
    ? `공동 ${rank}순위`
    : `${rank}순위`;
}

export function ConceptStudyPage() {
  const { subject = '', chapter = '' } = useParams();
  const unitNumber = parseUnitNumber(chapter);
  const navigate = useNavigate();
  const [relatedQuestionIndex, setRelatedQuestionIndex] = useState(0);

  const {
    mainTab, setMainTab, slideView, setSlideView,
    loading, error, data, concepts, current, total, currentIndex,
    studyInsights,
    structured, structuredLoading, openSections, toggleSection,
    bookmarks, bookmarkLoading, isBookmarked, handleBookmark,
    openAnalysis, toggleAnalysis,
    handlePrev, handleNext, handleComplete, isFirst, isLast,
  } = useConceptStudy(subject, unitNumber, chapter);

  const relatedQuestions = current?.relatedQuestions ?? [];
  const activeRelatedQuestion = relatedQuestions[relatedQuestionIndex];
  const v2 = activeRelatedQuestion ? activeRelatedQuestion.conceptHighlightV2 : current?.conceptHighlightV2;
  const sampleQuestion = activeRelatedQuestion
    ? {
        ...activeRelatedQuestion.question,
        correct_answer: activeRelatedQuestion.correct_answer,
        questionSource: activeRelatedQuestion.questionSource,
        questionNumber: activeRelatedQuestion.questionNumber ?? undefined,
        rawStimulus: activeRelatedQuestion.rawStimulus,
      }
    : current?.sampleQuestion;
  const questionSource = sampleQuestion
    ? (sampleQuestion.questionSource ?? sampleQuestion.metadata?.source_exam ?? '수능특강')
    : '';
  const questionExplanation = String(sampleQuestion?.explanation ?? sampleQuestion?.render_ready?.explanation ?? '');

  useEffect(() => {
    setRelatedQuestionIndex(0);
  }, [current?.name]);

  if (loading) return <div className={s.container}><div className={s.center}><div className={s.spinner} /></div></div>;
  if (error) return <div className={s.container}><div className={s.center}><span className={s.errorText}>{error}</span></div></div>;

  return (
    <div className={s.container}>
      <div className={s.header}>
        <button className={s.backButton} onClick={() => navigate(-1)}>
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
                   {(current.description || current.conceptDefinition) && (
                    <VStack gap={8} fullWidth>
                      <span className={s.sectionTitle}>개념 정의</span>
                      {current.conceptDefinition ? (
                        <VStack gap={14} fullWidth>
                          <div className={s.definitionSummary}>
                            <MarkdownWithTable className={s.markdownContent}>{current.conceptDefinition.summary}</MarkdownWithTable>
                          </div>
                          <div className={s.definitionSectionGrid}>
                            {current.conceptDefinition.sections.map((section, i) => (
                              <div key={i} className={s.definitionSectionCard}>
                                <span className={s.definitionCardTitle}>{section.title}</span>
                                <MarkdownWithTable className={s.markdownContent}>{section.description}</MarkdownWithTable>
                                {section.examples && section.examples.length > 0 && (
                                  <div className={s.definitionExamples}>
                                    {section.examples.map((example, j) => <span key={j} className={s.definitionExample}>{example}</span>)}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                          {current.conceptDefinition.comparison && (
                            <div className={s.definitionComparison}>
                              <table>
                                <thead><tr>{current.conceptDefinition.comparison.headers.map((header, i) => <th key={i}>{header}</th>)}</tr></thead>
                                <tbody>{current.conceptDefinition.comparison.rows.map((row, i) => <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>)}</tbody>
                              </table>
                            </div>
                          )}
                          {current.conceptDefinition.commonConfusions.length > 0 && (
                            <div className={s.definitionConfusion}>
                              <span className={s.definitionCardTitle}>헷갈리기 쉬운 구분</span>
                              {current.conceptDefinition.commonConfusions.map((item, i) => <MarkdownWithTable key={i} className={s.markdownContent}>{item}</MarkdownWithTable>)}
                            </div>
                          )}
                        </VStack>
                      ) : (
                        <MarkdownWithTable className={s.markdownContent}>{current.description}</MarkdownWithTable>
                      )}
                    </VStack>
                   )}

                  {current.subtopics && current.subtopics.length > 0 && (
                    <VStack gap={8} fullWidth>
                      <span className={s.sectionTitle}>세부 개념</span>
                      <ul className={s.bulletList}>
                        {current.subtopics.map((subtopic) => <li key={subtopic.name}>{subtopic.name}</li>)}
                      </ul>
                    </VStack>
                  )}

                  {current.examMustKnow && current.examMustKnow.reviewStatus !== 'review' && (
                    <VStack gap={10} fullWidth className={s.mustKnowSection}>
                      <HStack justify="between" align="center" fullWidth>
                        <span className={s.sectionTitle}>
                          {current.examMustKnow.reviewStatus === 'verified' ? '시험 전 꼭 외울 것' : '핵심 암기'}
                        </span>
                        <span className={s.mustKnowBadge}>
                          {current.examMustKnow.confidence === 'high' ? '기출 검증' : '교재 기준'}
                        </span>
                      </HStack>
                      <span className={s.mustKnowTitle}>{current.examMustKnow.title}</span>
                      {current.examMustKnow.summary && (
                        <MarkdownWithTable className={s.markdownContent}>{current.examMustKnow.summary}</MarkdownWithTable>
                      )}
                      {current.examMustKnow.headers && current.examMustKnow.rows && (
                        <div className={s.mustKnowTableWrap}>
                          <table className={s.mustKnowTable}>
                            <thead><tr>{current.examMustKnow.headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
                            <tbody>{current.examMustKnow.rows.map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody>
                          </table>
                        </div>
                      )}
                      {current.examMustKnow.mustRemember.length > 0 && (
                        <VStack gap={6} fullWidth>
                          <span className={s.mustKnowLabel}>반드시 기억</span>
                          <ul className={s.bulletList}>{current.examMustKnow.mustRemember.map((item) => <li key={item}>{item}</li>)}</ul>
                        </VStack>
                      )}
                      {current.examMustKnow.commonTraps.length > 0 && (
                        <VStack gap={6} fullWidth className={s.mustKnowTrap}>
                          <span className={s.mustKnowLabel}>자주 틀리는 구분</span>
                          <ul className={s.bulletList}>{current.examMustKnow.commonTraps.map((item) => <li key={item}>{item}</li>)}</ul>
                        </VStack>
                      )}
                    </VStack>
                  )}

                  {/* 섹션 2 — 출처 태그 */}
                  {current.sources.length > 0 && (
                    <div className={s.tagsRow}>
                      {current.sources.map((src, i) => <span key={i} className={s.examTag}>{src}</span>)}
                    </div>
                  )}
                </VStack>
              </div>
            )}

            {current && sampleQuestion && slideView === 'question' && (
              <div className={s.questionTwoCol}>
                 <div className={s.questionCol}>
                  {relatedQuestions.length > 1 && (
                    <HStack className={s.relatedQNav} justify="between" align="center" fullWidth>
                      <button
                        className={s.relatedQNavBtn}
                        onClick={() => setRelatedQuestionIndex((index) => Math.max(0, index - 1))}
                        disabled={relatedQuestionIndex === 0}
                        aria-label="이전 관련 문제"
                      >
                        ← 이전 문제
                      </button>
                      <span className={s.relatedQCount}>{relatedQuestionIndex + 1} / {relatedQuestions.length}</span>
                      <button
                        className={s.relatedQNavBtn}
                        onClick={() => setRelatedQuestionIndex((index) => Math.min(relatedQuestions.length - 1, index + 1))}
                        disabled={relatedQuestionIndex === relatedQuestions.length - 1}
                        aria-label="다음 관련 문제"
                      >
                        다음 문제 →
                      </button>
                    </HStack>
                  )}
                  {questionSource && (
                    <HStack justify="between" align="center" fullWidth className={s.questionSourceRow}>
                      <span className={s.questionSourceLabel}>유사 출제 문제</span>
                      <span className={s.questionSourceBadge}>
                        {questionSource}{sampleQuestion.questionNumber != null && ` ${sampleQuestion.questionNumber}번`}
                      </span>
                    </HStack>
                  )}
                  <QuestionRenderer
                    question={{
                      ...sampleQuestion,
                      // 문제 해설은 오른쪽 분석 패널에서 표시하므로 중복 렌더링하지 않는다.
                      explanation: '',
                      render_ready: { ...sampleQuestion.render_ready, explanation: '' },
                    }}
                    questionNumber={sampleQuestion.questionNumber ?? currentIndex + 1}
                    correctAnswer={sampleQuestion.correct_answer}
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
                                <VStack gap={8} fullWidth>
                                  {v2.stimulusClues.map((clue, i) => (
                                    <div key={i} className={s.clueBox}>
                                      <p className={s.clueQuote}><mark className={s.stimulusHighlight}>{clue.quote}</mark></p>
                                      <MarkdownWithTable className={s.clueWhy}>{clue.why}</MarkdownWithTable>
                                    </div>
                                  ))}
                                </VStack>
                              </VStack>
                            )}
                            {key === 'optionAnalysis' && v2 && (
                              <VStack gap={6} fullWidth>
                                {v2.optionAnalysis.map((opt: any, i: number) => {
                                  const label = opt.optionKey ?? (['①', '②', '③', '④', '⑤'][(opt.optionNum ?? 1) - 1] ?? String(opt.optionNum));
                                  return (
                                    <div key={i} className={`${s.optionAnalysisRow} ${opt.verdict === 'O' ? s.optionCorrectRow : s.optionWrongRow}`}>
                                      <HStack gap={8} align="start">
                                        <span className={s.optionAnalysisNum}>{label}</span>
                                        <span className={`${s.verdict} ${opt.verdict === 'O' ? s.verdictO : s.verdictX}`}>{opt.verdict}</span>
                                        <MarkdownWithTable className={s.optionReasoning}>{opt.reasoning}</MarkdownWithTable>
                                      </HStack>
                                    </div>
                                  );
                                })}
                              </VStack>
                            )}
                            {key === 'takeaway' && v2 && <MarkdownWithTable className={s.markdownContent}>{v2.takeaway}</MarkdownWithTable>}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {!v2 && (
                    <VStack gap={12} fullWidth>
                      <div className={s.analysisFallbackBox}>
                        <span className={s.analysisFallbackTitle}>이 개념이 문제에서 어떻게 나왔나</span>
                        <MarkdownWithTable className={s.markdownContent}>
                          {`${current.name}은(는) 이 대표 문제의 지문·보기·선택지를 판단하는 기준으로 출제되었습니다.`}
                        </MarkdownWithTable>
                      </div>
                      {questionExplanation && (
                        <div className={s.analysisFallbackBox}>
                          <span className={s.analysisFallbackTitle}>문제 해설</span>
                          <MarkdownWithTable className={s.markdownContent}>{questionExplanation}</MarkdownWithTable>
                        </div>
                      )}
                      {current.examTips.length > 0 && (
                        <div className={s.analysisFallbackBox}>
                          <span className={s.analysisFallbackTitle}>이 문제의 출제 포인트</span>
                          <VStack gap={6} fullWidth>
                            {current.examTips.map((tip, i) => (
                              <MarkdownWithTable key={i} className={s.markdownContent}>{tip}</MarkdownWithTable>
                            ))}
                          </VStack>
                        </div>
                      )}
                    </VStack>
                  )}
                </div>
              </div>
            )}
            {current && !sampleQuestion && slideView === 'question' && (
              <p className={s.noAnalysisText}>문제 데이터가 없습니다.</p>
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
              {studyInsights && studyInsights.patterns.length > 0 && (
                <VStack gap={10} fullWidth>
                  <span className={s.overviewSectionTitle}>이 단원에서 확인할 출제 포인트</span>
                  <VStack gap={10} fullWidth>
                    {studyInsights.patterns.map((pattern, patternIndex) => (
                      <div key={pattern.id} className={s.examPatternCard}>
                        <HStack justify="between" align="center" fullWidth>
                          <span className={s.examPatternTitle}>{pattern.title}</span>
                          <HStack gap={6} align="center">
                            <span className={s.examPatternImportance}>
                              {importanceLabel(studyInsights.patterns, patternIndex)}
                            </span>
                            <span className={s.examPatternCount}>
                              {pattern.confidence === 'high' ? '빈출' : '관련 사례'} · {pattern.frequency}문제
                            </span>
                          </HStack>
                        </HStack>
                        <p className={s.examPatternSummary}>{pattern.summary}</p>
                        {pattern.questionFormats.length > 0 && (
                          <div className={s.examPatternTags}>
                            {pattern.questionFormats.map((format) => <span key={format} className={s.examPatternTag}>{format}</span>)}
                          </div>
                        )}
                        {pattern.keyChecks.length > 0 && (
                          <div className={s.examPatternList}>
                            <span className={s.examPatternLabel}>문제에서 확인할 기준</span>
                            <ul className={s.bulletList}>{pattern.keyChecks.map((item) => <li key={item}>{item}</li>)}</ul>
                          </div>
                        )}
                        {pattern.commonTraps.length > 0 && (
                          <div className={s.examPatternTrap}>
                            <span className={s.examPatternLabel}>자주 헷갈리는 지점</span>
                            <ul className={s.bulletList}>{pattern.commonTraps.map((item) => <li key={item}>{item}</li>)}</ul>
                          </div>
                        )}
                        <span className={s.examPatternEvidence}>
                          근거 문제: {pattern.evidence.map((item) => `${item.source}${item.questionNumber ? ` ${item.questionNumber}번` : ''}`).join(', ')}
                        </span>
                      </div>
                    ))}
                  </VStack>
                </VStack>
              )}
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
                      {section.summary && <MarkdownWithTable className={s.markdownContent}>{section.summary}</MarkdownWithTable>}
                      {section.subsections.map((sub, ssi) => (
                        <VStack key={ssi} gap={0} fullWidth className={s.subAccordionGroup}>
                          <button className={s.subAccordionHeader} onClick={() => toggleSection(`s-${si}-${ssi}`)}>
                            <span>{sub.title}</span>
                            <span className={s.accordionChevron}>{openSections[`s-${si}-${ssi}`] ? '▲' : '▼'}</span>
                          </button>
                          {openSections[`s-${si}-${ssi}`] && (
                            <VStack gap={12} fullWidth className={s.subAccordionBody}>
                              {sub.explanation && <MarkdownWithTable className={s.markdownContent}>{sub.explanation}</MarkdownWithTable>}
                              {sub.keyPoints.length > 0 && <VStack gap={6} fullWidth><span className={s.sectionTitle}>핵심 포인트</span><ul className={s.bulletList}>{sub.keyPoints.map((p, i) => <li key={i}>{p}</li>)}</ul></VStack>}
                              {sub.table && <MarkdownWithTable className={s.markdownContent}>{sub.table}</MarkdownWithTable>}
                              {sub.visualGuide && <div className={s.tipBox}><MarkdownWithTable className={s.markdownContent}>{sub.visualGuide}</MarkdownWithTable></div>}
                              {sub.examPoints.length > 0 && <VStack gap={6} fullWidth><span className={s.sectionTitle}>시험 포인트</span><VStack gap={4} fullWidth>{sub.examPoints.map((p, i) => <div key={i} className={s.tipBox}><MarkdownWithTable className={s.markdownContent}>{p}</MarkdownWithTable></div>)}</VStack></VStack>}
                              {sub.pitfalls.length > 0 && <VStack gap={6} fullWidth><span className={s.sectionTitle}>주의 사항</span><VStack gap={6} fullWidth>{sub.pitfalls.map((p, i) => <div key={i} className={s.trapBox}><MarkdownWithTable className={s.markdownContent}>{p}</MarkdownWithTable></div>)}</VStack></VStack>}
                              {sub.supplementNote && <div className={s.logicBox}><MarkdownWithTable className={s.markdownContent}>{sub.supplementNote}</MarkdownWithTable></div>}
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
                  <VStack gap={6} fullWidth>{structured.closingSummary.map((summary, i) => <div key={i} className={s.tipBox}><MarkdownWithTable className={s.markdownContent}>{summary}</MarkdownWithTable></div>)}</VStack>
                </VStack>
              )}
            </VStack>
          )}
        </div>
      )}
    </div>
  );
}
