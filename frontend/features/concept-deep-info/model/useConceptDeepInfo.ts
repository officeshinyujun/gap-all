'use client';

import { useState, useEffect } from 'react';
import type { ConceptExplanation } from '@entities/concept/model/types';
import { fetchConceptByName } from '@entities/concept/api/conceptApi';

export function useConceptDeepInfo(
  conceptName: string | null,
  subjectSlug: string,
  unitNumber: number,
) {
  const [deepCache, setDeepCache] = useState<Record<string, ConceptExplanation>>({});
  const [deepLoading, setDeepLoading] = useState(false);

  useEffect(() => {
    if (!conceptName) return;
    if (deepCache[conceptName]) return;
    let cancelled = false;
    setDeepLoading(true);
    fetchConceptByName(subjectSlug, unitNumber, conceptName)
      .then((res) => {
        if (!cancelled) {
          setDeepCache((prev) => ({ ...prev, [conceptName]: res }));
          setDeepLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setDeepLoading(false);
      });
    return () => { cancelled = true; };
  }, [conceptName, subjectSlug, unitNumber]);

  return {
    deepCache,
    deepLoading,
    current: conceptName ? deepCache[conceptName] ?? null : null,
  };
}
