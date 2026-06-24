'use client';

import { useState } from 'react';
import type { ConceptBookmark, FrequencyConceptItem } from '@entities/concept/model/types';
import {
  fetchConceptBookmarks,
  addConceptBookmark,
  removeConceptBookmark,
} from '@entities/concept/api/conceptApi';

export function useConceptBookmark() {
  const [bookmarks, setBookmarks] = useState<ConceptBookmark[]>([]);
  const [bookmarkLoading, setBookmarkLoading] = useState<Record<string, boolean>>({});

  async function loadBookmarks() {
    try {
      const data = await fetchConceptBookmarks();
      setBookmarks(data);
    } catch { /* ignore */ }
  }

  function isBookmarked(name: string) {
    return bookmarks.some((b) => b.conceptName === name);
  }

  async function toggleBookmark(item: FrequencyConceptItem, subjectSlug: string, unitNumber: number) {
    const name = item.name;
    setBookmarkLoading((prev) => ({ ...prev, [name]: true }));
    try {
      const existing = bookmarks.find((b) => b.conceptName === name);
      if (existing) {
        await removeConceptBookmark(existing.id);
        setBookmarks((prev) => prev.filter((b) => b.id !== existing.id));
      } else {
        const bm = await addConceptBookmark({
          subjectSlug,
          unitNumber,
          conceptName: name,
          description: item.description || undefined,
        });
        setBookmarks((prev) => [...prev, bm]);
      }
    } catch { /* ignore */ }
    setBookmarkLoading((prev) => ({ ...prev, [name]: false }));
  }

  return { bookmarks, bookmarkLoading, loadBookmarks, isBookmarked, toggleBookmark };
}
