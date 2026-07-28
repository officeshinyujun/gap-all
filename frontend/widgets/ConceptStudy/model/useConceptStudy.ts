'use client';

import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import type { FrequencyConcept, FrequencyConceptItem, ConceptExplanation, StructuredConcept, ConceptBookmark } from '@entities/concept/model/types';
import { fetchFrequencyConcept, fetchConceptByName, fetchStructuredConcept, fetchConceptBookmarks, addConceptBookmark, removeConceptBookmark } from '@entities/concept/api/conceptApi';
import { fetchUnitId, updateStudyProgress } from '@entities/study/api/studyApi';

export type MainTab = 'concept' | 'overview';
export type SlideView = 'learn' | 'question';

const CACHE_VERSION = 'v14';

function getCacheKey(subject: string, unitNumber: number) {
  return `concept-${CACHE_VERSION}-${subject}-${unitNumber}`;
}

function readSession<T>(key: string, defaultValue: T): T {
  if (typeof window === 'undefined') return defaultValue;
  try {
    const cached = sessionStorage.getItem(key);
    return cached ? JSON.parse(cached) : defaultValue;
  } catch { return defaultValue; }
}

export function useConceptStudy(subject: string, unitNumber: number, chapter: string) {
  const navigate = useNavigate();
  const cacheKey = getCacheKey(subject, unitNumber);

  const [mainTab, setMainTabState] = useState<MainTab>(() => readSession(`${cacheKey}-mainTab`, 'concept') as MainTab);
  const [slideView, setSlideViewState] = useState<SlideView>(() => readSession(`${cacheKey}-slideView`, 'learn') as SlideView);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<FrequencyConcept | null>(() => readSession(`${cacheKey}-data`, null));
  const [currentIndex, setCurrentIndexState] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    return parseInt(sessionStorage.getItem(`${cacheKey}-index`) ?? '0', 10);
  });
  const [deepCache, setDeepCache] = useState<Record<string, ConceptExplanation>>(() => readSession(`${cacheKey}-deepCache`, {}));
  const [deepLoading, setDeepLoading] = useState(false);
  const [structured, setStructured] = useState<StructuredConcept | null>(() => readSession(`${cacheKey}-structured`, null));
  const [structuredLoading, setStructuredLoading] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [bookmarks, setBookmarks] = useState<ConceptBookmark[]>([]);
  const [bookmarkLoading, setBookmarkLoading] = useState<Record<string, boolean>>({});
  const [openAnalysis, setOpenAnalysis] = useState<Record<string, boolean>>({ solvingFlow: true, stimulusClues: true, optionAnalysis: true });

  // persist helpers
  const setMainTab = (tab: MainTab) => { setMainTabState(tab); sessionStorage.setItem(`${cacheKey}-mainTab`, JSON.stringify(tab)); };
  const setSlideView = (view: SlideView) => { setSlideViewState(view); sessionStorage.setItem(`${cacheKey}-slideView`, JSON.stringify(view)); };
  const persistIndex = (idx: number) => sessionStorage.setItem(`${cacheKey}-index`, String(idx));

  // data fetch
  useEffect(() => {
    let cancelled = false;
    const isCacheValid = (data?.concepts?.length ?? 0) > 0 && 'conceptHighlightV2' in (data?.concepts?.[0] ?? {});
    if (isCacheValid) { setLoading(false); }
    else {
      fetchFrequencyConcept(subject, unitNumber)
        .then((res) => { if (!cancelled) { setData(res); sessionStorage.setItem(`${cacheKey}-data`, JSON.stringify(res)); setLoading(false); } })
        .catch((err: Error) => { if (!cancelled) { setError(err.message); setLoading(false); } });
    }
    fetchConceptBookmarks().then(setBookmarks).catch(() => {});
    return () => { cancelled = true; };
  }, [subject, unitNumber]);

  // overview tab lazy load
  useEffect(() => {
    if (mainTab === 'overview' && !structured && !structuredLoading) {
      setStructuredLoading(true);
      fetchStructuredConcept(subject, unitNumber)
        .then((res) => { setStructured(res); if (res) sessionStorage.setItem(`${cacheKey}-structured`, JSON.stringify(res)); setStructuredLoading(false); })
        .catch(() => setStructuredLoading(false));
    }
  }, [mainTab]);

  // deepCache persist
  useEffect(() => {
    if (Object.keys(deepCache).length > 0) sessionStorage.setItem(`${cacheKey}-deepCache`, JSON.stringify(deepCache));
  }, [deepCache, cacheKey]);

  const concepts = data?.concepts ?? [];
  const current: FrequencyConceptItem | null = concepts[currentIndex] ?? null;
  const total = concepts.length;

  // deep info lazy load
  useEffect(() => {
    if (!current) return;
    const name = current.name;
    if (deepCache[name]) return;
    let cancelled = false;
    setDeepLoading(true);
    fetchConceptByName(subject, unitNumber, name)
      .then((res) => { if (!cancelled) { setDeepCache((prev) => ({ ...prev, [name]: res })); setDeepLoading(false); } })
      .catch(() => { if (!cancelled) setDeepLoading(false); });
    return () => { cancelled = true; };
  }, [current?.name, subject, unitNumber]);

  const toggleSection = (key: string) => setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  const toggleAnalysis = (key: string) => setOpenAnalysis((prev) => ({ ...prev, [key]: !prev[key] }));

  const isBookmarked = (name: string) => bookmarks.some((b) => b.conceptName === name);
  const handleBookmark = async (item: FrequencyConceptItem) => {
    const name = item.name;
    setBookmarkLoading((prev) => ({ ...prev, [name]: true }));
    try {
      const existing = bookmarks.find((b) => b.conceptName === name);
      if (existing) { await removeConceptBookmark(existing.id); setBookmarks((prev) => prev.filter((b) => b.id !== existing.id)); }
      else { const bm = await addConceptBookmark({ subjectSlug: subject, unitNumber, conceptName: name, description: item.description || undefined }); setBookmarks((prev) => [...prev, bm]); }
    } catch { /* ignore */ }
    setBookmarkLoading((prev) => ({ ...prev, [name]: false }));
  };

  const handlePrev = () => {
    if (slideView === 'question') {
      setSlideView('learn');
    } else if (currentIndex > 0) {
      const next = currentIndex - 1;
      setCurrentIndexState(next);
      persistIndex(next);
    }
  };
  const handleNext = () => {
    if (slideView === 'learn') {
      setSlideView('question');
    } else if (currentIndex < total - 1) {
      const next = currentIndex + 1;
      setCurrentIndexState(next);
      persistIndex(next);
      setSlideViewState('learn');
      sessionStorage.setItem(`${cacheKey}-slideView`, JSON.stringify('learn'));
    }
  };
  const handleComplete = async () => {
    try { const unitId = await fetchUnitId(subject, unitNumber); if (unitId) await updateStudyProgress(unitId, 'BASIC_CONCEPT', 100); } catch { /* ignore */ }
    navigate(`/study/${subject}/${chapter}/q1?count=10`);
  };

  const isFirst = currentIndex === 0 && slideView === 'learn';
  const isLast = currentIndex === total - 1 && slideView === 'question';
  const deep = current ? deepCache[current.name] : null;

  return {
    mainTab, setMainTab, slideView, setSlideView,
    loading, error, data, concepts, current, total, currentIndex,
    deepCache, deepLoading, deep,
    structured, structuredLoading, openSections, toggleSection,
    bookmarks, bookmarkLoading, isBookmarked, handleBookmark,
    openAnalysis, toggleAnalysis,
    handlePrev, handleNext, handleComplete, isFirst, isLast,
  };
}
