'use client';

import { useState, useEffect } from 'react';
import { VStack } from '@/components/general/VStack';
import { HStack } from '@/components/general/HStack';
import Typo from '@/components/general/Typo';
import { SPACING } from '@/constants/spacing';
import { HeaderActions } from '@/components/general/HeaderActions';
import { fetchConceptBookmarks, removeConceptBookmark, fetchConceptByName, type ConceptBookmark, type ConceptExplanation } from '@/lib/studyQuizApi';
import s from './page.module.scss';

export default function ConceptListPage() {
  const [bookmarks, setBookmarks] = useState<ConceptBookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [conceptDetail, setConceptDetail] = useState<ConceptExplanation | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

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

  const subjectName = (slug: string) => {
    if (slug === 'success') return '성공적인 직업생활';
    if (slug === 'industry') return '공업 일반';
    return slug;
  };

  return (
    <VStack gap={SPACING.s16} fullWidth className={s.pageWrapper}>
      <HStack justify="between" align="center" fullWidth>
        <VStack gap={SPACING.s6}>
          <Typo.SM size={24} color="primary">개념리스트</Typo.SM>
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
        <VStack gap={SPACING.s12} fullWidth>
          {bookmarks.map((bookmark) => (
            <VStack key={bookmark.id} className={s.bookmarkCard} fullWidth style={{ padding: SPACING.s16 }} gap={SPACING.s12}>
              <HStack justify="between" align="center" fullWidth>
                <VStack gap={SPACING.s4} style={{ cursor: 'pointer', flex: 1 }} onClick={() => handleExpand(bookmark)}>
                  <Typo.SM size={14} color="primary">{bookmark.conceptName}</Typo.SM>
                  <Typo.MD size={12} color="secondary">
                    {subjectName(bookmark.subjectSlug)} · {bookmark.unitNumber}단원
                  </Typo.MD>
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
                      <Typo.MD size={12} color="primary" style={{ lineHeight: 1.7 }}>{conceptDetail.description}</Typo.MD>
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
                    <Typo.MD size={12} color="secondary">상세 설명을 찾을 수 없습니다.</Typo.MD>
                  )}
                </VStack>
              )}
            </VStack>
          ))}
        </VStack>
      )}
    </VStack>
  );
}
