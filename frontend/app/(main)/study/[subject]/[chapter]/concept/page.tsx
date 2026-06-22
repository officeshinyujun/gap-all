'use client';

import { use, useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  fetchFrequencyConcept,
  fetchConceptByName,
  fetchStructuredConcept,
  fetchConceptBookmarks,
  addConceptBookmark,
  removeConceptBookmark,
  updateStudyProgress,
} from '@/lib/studyQuizApi';
import type {
  FrequencyConcept,
  FrequencyConceptItem,
  ConceptExplanation,
  StructuredConcept,
  ConceptBookmark,
} from '@/lib/studyQuizApi';
import { fetchUnitId } from '@/lib/studyApi';
import { VStack } from '@/components/general/VStack';
import { HStack } from '@/components/general/HStack';
import Typo from '@/components/general/Typo';
import { QuestionRenderer } from '@/components/exam/QuestionStem/QuestionRenderer';
import s from './page.module.scss';

type MainTab = 'concept' | 'overview';
type SlideView = 'learn' | 'question';

function parseUnitNumber(chapter: string): number {
  const match = chapter.match(/\d+/);
  return match ? parseInt(match[0], 10) : 1;
}

export default function ConceptPage({
  params,
}: {
  params: Promise<{ subject: string; chapter: string }>;
}) {
  const { subject, chapter } = use(params);
  const unitNumber = parseUnitNumber(chapter);
  const router = useRouter();

  const CACHE_VERSION = 'v4';
  const cacheKey = `concept-${CACHE_VERSION}-${subject}-${unitNumber}`;

  const [mainTab, setMainTab] = useState<MainTab>(() => {
    if (typeof window === 'undefined') return 'concept';
    return (sessionStorage.getItem(`${cacheKey}-mainTab`) as MainTab) ?? 'concept';
  });
  const [slideView, setSlideView] = useState<SlideView>(() => {
    if (typeof window === 'undefined') return 'learn';
    return (sessionStorage.getItem(`${cacheKey}-slideView`) as SlideView) ?? 'learn';
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<FrequencyConcept | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const cached = sessionStorage.getItem(`${cacheKey}-data`);
      return cached ? (JSON.parse(cached) as FrequencyConcept) : null;
    } catch { return null; }
  });
  const [currentIndex, setCurrentIndex] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    return parseInt(sessionStorage.getItem(`${cacheKey}-index`) ?? '0', 10);
  });

  const [deepCache, setDeepCache] = useState<Record<string, ConceptExplanation>>(() => {
    if (typeof window === 'undefined') return {};
    try {
      const cached = sessionStorage.getItem(`${cacheKey}-deepCache`);
      return cached ? JSON.parse(cached) : {};
    } catch { return {}; }
  });
  const [deepLoading, setDeepLoading] = useState(false);

  const [structured, setStructured] = useState<StructuredConcept | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const cached = sessionStorage.getItem(`${cacheKey}-structured`);
      return cached ? JSON.parse(cached) : null;
    } catch { return null; }
  });
  const [structuredLoading, setStructuredLoading] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  const [bookmarks, setBookmarks] = useState<ConceptBookmark[]>([]);
  const [bookmarkLoading, setBookmarkLoading] = useState<Record<string, boolean>>({});
  const [openAnalysis, setOpenAnalysis] = useState<Record<string, boolean>>({ solvingFlow: true });

  useEffect(() => {
    let cancelled = false;
    const isCacheValid = (data?.concepts?.length ?? 0) > 0 &&
      'conceptHighlightV2' in (data?.concepts?.[0] ?? {});

    if (isCacheValid) {
      setLoading(false);
    } else {
      fetchFrequencyConcept(subject, unitNumber)
        .then((res) => {
          if (!cancelled) {
            setData(res);
            sessionStorage.setItem(`${cacheKey}-data`, JSON.stringify(res));
            setLoading(false);
          }
        })
        .catch((err: Error) => {
          if (!cancelled) {
            setError(err.message);
            setLoading(false);
          }
        });
    }
    fetchConceptBookmarks()
      .then(setBookmarks)
      .catch(() => {});
    return () => { cancelled = true; };
  }, [subject, unitNumber]);

  useEffect(() => {
    sessionStorage.setItem(`${cacheKey}-index`, String(currentIndex));
  }, [currentIndex, cacheKey]);

  useEffect(() => {
    sessionStorage.setItem(`${cacheKey}-slideView`, slideView);
  }, [slideView, cacheKey]);

  useEffect(() => {
    sessionStorage.setItem(`${cacheKey}-mainTab`, mainTab);
  }, [mainTab, cacheKey]);

  useEffect(() => {
    if (Object.keys(deepCache).length > 0) {
      sessionStorage.setItem(`${cacheKey}-deepCache`, JSON.stringify(deepCache));
    }
  }, [deepCache, cacheKey]);

  useEffect(() => {
    if (structured) {
      sessionStorage.setItem(`${cacheKey}-structured`, JSON.stringify(structured));
    }
  }, [structured, cacheKey]);

  const concepts = data?.concepts ?? [];
  const current: FrequencyConceptItem | null = concepts[currentIndex] ?? null;
  const total = concepts.length;

  useEffect(() => {
    if (!current) return;
    const name = current.name;
    if (deepCache[name]) return;
    let cancelled = false;
    setDeepLoading(true);
    fetchConceptByName(subject, unitNumber, name)
      .then((res) => {
        if (!cancelled) {
          setDeepCache((prev) => ({ ...prev, [name]: res }));
          setDeepLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setDeepLoading(false);
      });
    return () => { cancelled = true; };
  }, [current?.name, subject, unitNumber]);

  const handleTabOverview = useCallback(() => {
    setMainTab('overview');
    if (structured || structuredLoading) return;
    setStructuredLoading(true);
    fetchStructuredConcept(subject, unitNumber)
      .then((res) => {
        setStructured(res);
        setStructuredLoading(false);
      })
      .catch(() => setStructuredLoading(false));
  }, [structured, structuredLoading, subject, unitNumber]);

  const toggleSection = (key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const isBookmarked = (name: string) =>
    bookmarks.some((b) => b.conceptName === name);

  const handleBookmark = async (item: FrequencyConceptItem) => {
    const name = item.name;
    setBookmarkLoading((prev) => ({ ...prev, [name]: true }));
    try {
      const existing = bookmarks.find((b) => b.conceptName === name);
      if (existing) {
        await removeConceptBookmark(existing.id);
        setBookmarks((prev) => prev.filter((b) => b.id !== existing.id));
      } else {
        const bm = await addConceptBookmark({
          subjectSlug: subject,
          unitNumber,
          conceptName: name,
          description: item.description || undefined,
        });
        setBookmarks((prev) => [...prev, bm]);
      }
    } catch { /* ignore */ }
    setBookmarkLoading((prev) => ({ ...prev, [name]: false }));
  };

  const handlePrev = () => {
    if (slideView === 'question') {
      setSlideView('learn');
    } else if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      setSlideView('learn');
    }
  };

  const handleNext = () => {
    if (slideView === 'learn') {
      setSlideView('question');
    } else if (currentIndex < total - 1) {
      setCurrentIndex(currentIndex + 1);
      setSlideView('learn');
    }
  };

  const handleComplete = async () => {
    try {
      const unitId = await fetchUnitId(subject, unitNumber);
      if (unitId) await updateStudyProgress(unitId, 'BASIC_CONCEPT', 100);
    } catch { /* ignore */ }
    router.push(`/study/${subject}/${chapter}/q1?count=10`);
  };

  const isFirst = currentIndex === 0 && slideView === 'learn';
  const isLast = currentIndex === total - 1 && slideView === 'question';

  if (loading) {
    return (
      <div className={s.container}>
        <div className={s.center}><div className={s.spinner} /></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={s.container}>
        <div className={s.center}><span className={s.errorText}>{error}</span></div>
      </div>
    );
  }

  const deep = current ? deepCache[current.name] : null;
  const v2 = current?.conceptHighlightV2;
  const questionSource = current?.sampleQuestion.questionSource
    ?? current?.sampleQuestion.metadata?.source_exam;

  const toggleAnalysis = (key: string) =>
    setOpenAnalysis((prev) => ({ ...prev, [key]: !prev[key] }));

  const analysisExplanation = v2?.takeaway ?? null;

  return (
    <div className={s.container}>
      {/* 헤더 1행 */}
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
          onClick={mainTab === 'overview' ? () => setMainTab('concept') : handleTabOverview}
          aria-label="단원 개요"
          title="단원 개요"
        >
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <rect x="2" y="3" width="12" height="1.5" rx="0.75" fill="currentColor"/>
            <rect x="2" y="7" width="8" height="1.5" rx="0.75" fill="currentColor"/>
            <rect x="2" y="11" width="10" height="1.5" rx="0.75" fill="currentColor"/>
          </svg>
        </button>
      </div>

      {/* 헤더 2행 — 빈출 개념 탭일 때만 */}
      {mainTab === 'concept' && (
        <div className={s.subHeader}>
          <div className={s.slideViewToggle}>
            <button
              className={`${s.slideViewBtn} ${slideView === 'learn' ? s.slideViewBtnActive : ''}`}
              onClick={() => setSlideView('learn')}
            >
              개념 학습
            </button>
            <button
              className={`${s.slideViewBtn} ${slideView === 'question' ? s.slideViewBtnActive : ''}`}
              onClick={() => setSlideView('question')}
            >
              문제 적용
            </button>
          </div>
          <span className={s.headerCount}>{currentIndex + 1} / {total}</span>
        </div>
      )}

      {mainTab === 'concept' ? (
        <>
          <div className={s.slideArea}>
            {current && slideView === 'learn' && (
              <div className={s.learnView}>
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
                      <path
                        d="M3 2.5A1.5 1.5 0 0 1 4.5 1h7A1.5 1.5 0 0 1 13 2.5v12l-5-3-5 3v-12Z"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinejoin="round"
                        fill={isBookmarked(current.name) ? 'currentColor' : 'none'}
                      />
                    </svg>
                  </button>
                </HStack>

                {current.description && (
                  <div className={s.descriptionBox}>
                    <span className={s.sectionTitle}>개념 정의</span>
                    <p className={s.descriptionText}>{current.description}</p>
                  </div>
                )}

                {current.conceptContent && (
                  <div className={s.markdownContent}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {current.conceptContent}
                    </ReactMarkdown>
                  </div>
                )}

                {current.keyPoints.length > 0 && (
                  <VStack gap={6} fullWidth>
                    <span className={s.sectionTitle}>핵심 포인트</span>
                    <ul className={s.bulletList}>
                      {current.keyPoints.map((p, i) => <li key={i}>{p}</li>)}
                    </ul>
                  </VStack>
                )}

                {current.examTips.length > 0 && (
                  <VStack gap={6} fullWidth>
                    <span className={s.sectionTitle}>시험 출제 팁</span>
                    <VStack gap={6} fullWidth>
                      {current.examTips.map((tip, i) => (
                        <div key={i} className={s.tipBox}>{tip}</div>
                      ))}
                    </VStack>
                  </VStack>
                )}

                {deepLoading && (
                  <div className={s.deepLoading}>
                    <div className={s.spinnerSmall} />
                    <span>심화 정보 로딩 중...</span>
                  </div>
                )}

                {!deepLoading && deep?.found && (
                  <>
                    {deep.trapPoints.length > 0 && (
                      <VStack gap={6} fullWidth>
                        <span className={s.sectionTitle}>함정 포인트</span>
                        <VStack gap={6} fullWidth>
                          {deep.trapPoints.map((t, i) => (
                            <div key={i} className={s.trapBox}>{t}</div>
                          ))}
                        </VStack>
                      </VStack>
                    )}
                    {deep.logicFlow && (
                      <VStack gap={6} fullWidth>
                        <span className={s.sectionTitle}>풀이 흐름</span>
                        <div className={s.logicBox}>{deep.logicFlow}</div>
                      </VStack>
                    )}
                    {deep.bulletPoints.length > 0 && (
                      <VStack gap={6} fullWidth>
                        <span className={s.sectionTitle}>추가 정리</span>
                        <ul className={s.bulletList}>
                          {deep.bulletPoints.map((p, i) => <li key={i}>{p}</li>)}
                        </ul>
                      </VStack>
                    )}
                  </>
                )}

                {current.sources.length > 0 && (
                  <div className={s.tagsRow}>
                    {current.sources.map((src, i) => (
                      <span key={i} className={s.examTag}>{src}</span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {current && slideView === 'question' && (
              <div className={s.questionTwoCol}>
                {/* 좌측 — 문제 고정 */}
                <div className={s.questionCol}>
                  {questionSource && (
                    <HStack justify="between" align="center" fullWidth className={s.questionSourceRow}>
                      <span className={s.questionSourceLabel}>유사 출제 문제</span>
                      <span className={s.questionSourceBadge}>
                        {questionSource}
                        {current.sampleQuestion.questionNumber != null && ` ${current.sampleQuestion.questionNumber}번`}
                      </span>
                    </HStack>
                  )}
                  <QuestionRenderer
                    question={{
                      ...current.sampleQuestion,
                      explanation: current.sampleQuestion.explanation
                        ?? current.sampleQuestion.render_ready?.explanation
                        ?? (analysisExplanation ? analysisExplanation : undefined),
                    }}
                    questionNumber={currentIndex + 1}
                    correctAnswer={current.sampleQuestion.correct_answer}
                    flat
                  />
                </div>

                {/* 우측 — 분석 아코디언 */}
                <div className={s.analysisPanel}>
                  <span className={s.analysisPanelTitle}>이 개념이 문제에서 어떻게 나왔나</span>

                  {/* 풀이 흐름 */}
                  {v2 && v2.solvingFlow.length > 0 && (
                    <div className={s.analysisAccordion}>
                      <button
                        className={s.analysisAccordionHeader}
                        onClick={() => toggleAnalysis('solvingFlow')}
                      >
                        <span>풀이 흐름</span>
                        <span className={s.analysisChevron}>{openAnalysis['solvingFlow'] ? '▲' : '▼'}</span>
                      </button>
                      {openAnalysis['solvingFlow'] && (
                        <VStack gap={6} fullWidth className={s.analysisAccordionBody}>
                          {v2.solvingFlow.map((step, i) => (
                            <div key={i} className={s.solvingStep}>
                              <span className={s.stepNum}>{step.step}</span>
                              <span className={s.stepText}>{step.action}</span>
                            </div>
                          ))}
                        </VStack>
                      )}
                    </div>
                  )}

                  {/* 지문 단서 */}
                  {v2 && v2.stimulusClues.length > 0 && (
                    <div className={s.analysisAccordion}>
                      <button
                        className={s.analysisAccordionHeader}
                        onClick={() => toggleAnalysis('stimulusClues')}
                      >
                        <span>지문 단서</span>
                        <span className={s.analysisChevron}>{openAnalysis['stimulusClues'] ? '▲' : '▼'}</span>
                      </button>
                      {openAnalysis['stimulusClues'] && (
                        <VStack gap={8} fullWidth className={s.analysisAccordionBody}>
                          {v2.stimulusClues.map((clue, i) => (
                            <div key={i} className={s.clueBox}>
                              <p className={s.clueQuote}>"{clue.quote}"</p>
                              <p className={s.clueWhy}>{clue.why}</p>
                            </div>
                          ))}
                        </VStack>
                      )}
                    </div>
                  )}

                  {/* 선택지 분석 */}
                  {v2 && v2.optionAnalysis.length > 0 && (
                    <div className={s.analysisAccordion}>
                      <button
                        className={s.analysisAccordionHeader}
                        onClick={() => toggleAnalysis('optionAnalysis')}
                      >
                        <span>선택지 분석</span>
                        <span className={s.analysisChevron}>{openAnalysis['optionAnalysis'] ? '▲' : '▼'}</span>
                      </button>
                      {openAnalysis['optionAnalysis'] && (
                        <VStack gap={6} fullWidth className={s.analysisAccordionBody}>
                          {v2.optionAnalysis.map((opt, i) => (
                            <div key={i} className={`${s.optionAnalysisRow} ${opt.verdict === 'O' ? s.optionCorrectRow : s.optionWrongRow}`}>
                              <HStack gap={8} align="start">
                                <span className={s.optionAnalysisNum}>{'①②③④⑤'[opt.optionNum - 1] ?? opt.optionNum}</span>
                                <span className={`${s.verdict} ${opt.verdict === 'O' ? s.verdictO : s.verdictX}`}>{opt.verdict}</span>
                                <span className={s.optionReasoning}>{opt.reasoning}</span>
                              </HStack>
                            </div>
                          ))}
                        </VStack>
                      )}
                    </div>
                  )}

                  {/* 핵심 교훈 */}
                  {v2 && v2.takeaway && (
                    <div className={s.analysisAccordion}>
                      <button
                        className={s.analysisAccordionHeader}
                        onClick={() => toggleAnalysis('takeaway')}
                      >
                        <span>핵심 교훈</span>
                        <span className={s.analysisChevron}>{openAnalysis['takeaway'] ? '▲' : '▼'}</span>
                      </button>
                      {openAnalysis['takeaway'] && (
                        <div className={s.analysisAccordionBody}>
                          <p className={s.takeawayText}>{v2.takeaway}</p>
                        </div>
                      )}
                    </div>
                  )}

                  {!v2 && (
                    <p className={s.noAnalysisText}>분석 데이터가 없습니다.</p>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className={s.footer}>
            <button
              className={s.navButton}
              onClick={handlePrev}
              disabled={isFirst}
            >
              ← 이전
            </button>
            <span className={s.footerHint}>
              {slideView === 'learn' ? '개념 학습' : '문제 적용'}
            </span>
            {isLast ? (
              <button
                className={`${s.navButton} ${s.navButtonNext}`}
                onClick={handleComplete}
              >
                빈칸 문제 풀기 →
              </button>
            ) : (
              <button
                className={`${s.navButton} ${s.navButtonPrimary}`}
                onClick={handleNext}
              >
                {slideView === 'learn' ? '문제 보기 →' : '다음 개념 →'}
              </button>
            )}
          </div>
        </>
      ) : (
        <div className={s.overviewArea}>
          {structuredLoading ? (
            <div className={s.center}><div className={s.spinner} /></div>
          ) : !structured ? (
            <div className={s.center}>
              <span className={s.errorText}>단원 개요 데이터가 없습니다.</span>
            </div>
          ) : (
            <VStack gap={24} fullWidth>
              {structured.learningObjectives.length > 0 && (
                <VStack gap={10} fullWidth>
                  <span className={s.overviewSectionTitle}>학습 목표</span>
                  <ul className={s.bulletList}>
                    {structured.learningObjectives.map((obj, i) => (
                      <li key={i}>{obj}</li>
                    ))}
                  </ul>
                </VStack>
              )}

              {structured.sections.map((section, si) => (
                <VStack key={si} gap={0} fullWidth className={s.accordionGroup}>
                  <button
                    className={s.accordionHeader}
                    onClick={() => toggleSection(`s-${si}`)}
                  >
                    <span>{section.title}</span>
                    <span className={s.accordionChevron}>
                      {openSections[`s-${si}`] ? '▲' : '▼'}
                    </span>
                  </button>

                  {openSections[`s-${si}`] && (
                    <VStack gap={0} fullWidth>
                      {section.summary && (
                        <p className={s.sectionSummary}>{section.summary}</p>
                      )}
                      {section.subsections.map((sub, ssi) => (
                        <VStack key={ssi} gap={0} fullWidth className={s.subAccordionGroup}>
                          <button
                            className={s.subAccordionHeader}
                            onClick={() => toggleSection(`s-${si}-${ssi}`)}
                          >
                            <span>{sub.title}</span>
                            <span className={s.accordionChevron}>
                              {openSections[`s-${si}-${ssi}`] ? '▲' : '▼'}
                            </span>
                          </button>

                          {openSections[`s-${si}-${ssi}`] && (
                            <VStack gap={12} fullWidth className={s.subAccordionBody}>
                              {sub.explanation && (
                                <p className={s.subText}>{sub.explanation}</p>
                              )}
                              {sub.keyPoints.length > 0 && (
                                <VStack gap={6} fullWidth>
                                  <span className={s.sectionTitle}>핵심 포인트</span>
                                  <ul className={s.bulletList}>
                                    {sub.keyPoints.map((p, i) => <li key={i}>{p}</li>)}
                                  </ul>
                                </VStack>
                              )}
                              {sub.table && (
                                <div className={s.markdownContent}>
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{sub.table}</ReactMarkdown>
                                </div>
                              )}
                              {sub.visualGuide && (
                                <div className={s.tipBox}>{sub.visualGuide}</div>
                              )}
                              {sub.examPoints.length > 0 && (
                                <VStack gap={6} fullWidth>
                                  <span className={s.sectionTitle}>시험 포인트</span>
                                  <ul className={s.bulletList}>
                                    {sub.examPoints.map((p, i) => <li key={i}>{p}</li>)}
                                  </ul>
                                </VStack>
                              )}
                              {sub.pitfalls.length > 0 && (
                                <VStack gap={6} fullWidth>
                                  <span className={s.sectionTitle}>주의 사항</span>
                                  <VStack gap={6} fullWidth>
                                    {sub.pitfalls.map((p, i) => (
                                      <div key={i} className={s.trapBox}>{p}</div>
                                    ))}
                                  </VStack>
                                </VStack>
                              )}
                              {sub.supplementNote && (
                                <div className={s.logicBox}>{sub.supplementNote}</div>
                              )}
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
                  <VStack gap={6} fullWidth>
                    {structured.closingSummary.map((summary, i) => (
                      <div key={i} className={s.tipBox}>{summary}</div>
                    ))}
                  </VStack>
                </VStack>
              )}
            </VStack>
          )}
        </div>
      )}
    </div>
  );
}
