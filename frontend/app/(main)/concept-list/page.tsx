'use client';

import { useState, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { VStack } from '@/components/general/VStack';
import { HStack } from '@/components/general/HStack';
import Typo from '@shared/ui/Typo';
import { SPACING } from '@shared/constants/spacing';
import { HeaderActions } from '@shared/ui/HeaderActions';
import { fetchConceptBookmarks, removeConceptBookmark, fetchConceptByName, type ConceptBookmark, type ConceptExplanation } from '@/lib/studyQuizApi';
import s from './page.module.scss';

const SUBJECTS = [
  { slug: 'success', name: '성직' },
  { slug: 'industry', name: '공일' },
] as const;

export default function ConceptListPage() {
  const [bookmarks, setBookmarks] = useState<ConceptBookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [conceptDetail, setConceptDetail] = useState<ConceptExplanation | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [query, setQuery] = useState('');

  useEffect(() => {
    fetchConceptBookmarks()
      .then(setBookmarks)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleExpand(bookmark: ConceptBookmark) {
    if (expandedId === bookmark.id) {
      setExpandedId(null);
      setConceptDetail(null);
      return;
    }
    setExpandedId(bookmark.id);
    setDetailLoading(true);
    try {
      const data = await fetchConceptByName(bookmark.subjectSlug, bookmark.unitNumber, bookmark.conceptName);
      setConceptDetail(data);
    } catch {
      setConceptDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleRemove(id: string) {
    try {
      await removeConceptBookmark(id);
      setBookmarks((prev) => prev.filter((b) => b.id !== id));
      if (expandedId === id) {
        setExpandedId(null);
        setConceptDetail(null);
      }
    } catch {}
  }

  const filteredBookmarks = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    if (!normalizedQuery) return bookmarks;

    return bookmarks.filter(({ conceptName, description }) =>
      `${conceptName} ${description ?? ''}`.toLocaleLowerCase().includes(normalizedQuery),
    );
  }, [bookmarks, query]);

  const groupedBookmarks = useMemo(() => SUBJECTS.map((subject) => {
    const byUnit = new Map<number, ConceptBookmark[]>();

    filteredBookmarks
      .filter((bookmark) => bookmark.subjectSlug === subject.slug)
      .forEach((bookmark) => {
        const unitBookmarks = byUnit.get(bookmark.unitNumber) ?? [];
        unitBookmarks.push(bookmark);
        byUnit.set(bookmark.unitNumber, unitBookmarks);
      });

    return {
      ...subject,
      units: [...byUnit.entries()].sort(([a], [b]) => a - b),
    };
  }).filter(({ units }) => units.length > 0), [filteredBookmarks]);

  return (
    <VStack gap={SPACING.s16} fullWidth className={s.pageWrapper}>
      <HStack justify="between" align="center" fullWidth className={s.pageHeader}>
        <VStack gap={SPACING.s6}>
          <Typo.SM size={20} color="primary">개념리스트</Typo.SM>
          <Typo.MD size={12} color="secondary">저장한 개념을 다시 확인하세요</Typo.MD>
        </VStack>
        <HeaderActions />
      </HStack>

      {loading && (
        <VStack align="center" justify="center" fullWidth style={{ padding: SPACING.s24 }}>
          <Typo.MD size={14} color="secondary">불러오는 중...</Typo.MD>
        </VStack>
      )}

      {!loading && bookmarks.length === 0 && (
        <VStack align="center" justify="center" fullWidth style={{ padding: SPACING.s24 }}>
          <Typo.MD size={16} color="secondary">저장한 개념이 없습니다</Typo.MD>
          <Typo.MD size={14} color="secondary">복습 중 개념을 저장해보세요</Typo.MD>
        </VStack>
      )}

      {!loading && bookmarks.length > 0 && (
        <>
          <input
            aria-label="저장한 개념 검색"
            className={s.searchInput}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="개념 검색"
          />

          {groupedBookmarks.length === 0 ? (
            <VStack align="center" justify="center" fullWidth className={s.noResults}>
              <Typo.MD size={14} color="secondary">검색 결과가 없습니다</Typo.MD>
            </VStack>
          ) : (
            <VStack gap={SPACING.s20} fullWidth>
              {groupedBookmarks.map(({ slug, name, units }) => (
                <VStack key={slug} gap={SPACING.s12} fullWidth>
                  <Typo.SM as="h2" size={14} color="primary" className={s.subjectTitle}>{name}</Typo.SM>
                  {units.map(([unitNumber, unitBookmarks]) => (
                    <VStack key={unitNumber} gap={SPACING.s8} fullWidth>
                      <Typo.MD as="h3" size={12} color="secondary" className={s.unitTitle}>{unitNumber}단원</Typo.MD>
                      {unitBookmarks.map((bookmark) => {
                        const savedDescription = bookmark.description?.trim();

                        return (
                        <VStack key={bookmark.id} className={s.bookmarkCard} fullWidth style={{ padding: SPACING.s12 }} gap={SPACING.s8}>
                          <HStack justify="between" align="center" fullWidth>
                            <VStack gap={SPACING.s4} style={{ cursor: 'pointer', flex: 1 }} onClick={() => handleExpand(bookmark)}>
                              <Typo.SM size={12} color="primary">{bookmark.conceptName}</Typo.SM>
                            </VStack>
                            <button className={s.removeButton} onClick={() => handleRemove(bookmark.id)}>
                              <Typo.MD size={12} color="secondary">삭제</Typo.MD>
                            </button>
                          </HStack>

                          {expandedId === bookmark.id && (
                            <VStack gap={SPACING.s8} fullWidth className={s.detailSection}>
                              {detailLoading && <Typo.MD size={12} color="secondary">로딩 중...</Typo.MD>}
                              {!detailLoading && conceptDetail && conceptDetail.found && (
                                <>
                                  <div className={s.markdownContent}>
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{conceptDetail.description}</ReactMarkdown>
                                  </div>
                                  {conceptDetail.bulletPoints.length > 0 && (
                                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                                      {conceptDetail.bulletPoints.map((bp, i) => (
                                        <li key={i} style={{ fontSize: 12, color: 'var(--text-primary)', lineHeight: 1.7 }}>{bp}</li>
                                      ))}
                                    </ul>
                                  )}
                                  {conceptDetail.trapPoints.length > 0 && (
                                    <VStack gap={SPACING.s4}>
                                      <Typo.SM size={12} color="wrong">주의</Typo.SM>
                                      <ul style={{ margin: 0, paddingLeft: 20 }}>
                                        {conceptDetail.trapPoints.map((tp, i) => (
                                          <li key={i} style={{ fontSize: 12, color: 'var(--text-wrong)', lineHeight: 1.7 }}>{tp}</li>
                                        ))}
                                      </ul>
                                    </VStack>
                                  )}
                                </>
                              )}
                              {!detailLoading && (!conceptDetail || !conceptDetail.found) && (
                                savedDescription ? (
                                  <div className={s.markdownContent}>
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{savedDescription}</ReactMarkdown>
                                  </div>
                                ) : (
                                  <Typo.MD size={12} color="secondary">상세 설명을 찾을 수 없습니다.</Typo.MD>
                                )
                              )}
                            </VStack>
                          )}
                        </VStack>
                        );
                      })}
                    </VStack>
                  ))}
                </VStack>
              ))}
            </VStack>
          )}
        </>
      )}
    </VStack>
  );
}
