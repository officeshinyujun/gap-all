'use client';

import { useState } from 'react';
import type { FrequencyConcept } from '@entities/concept/model/types';
import { fetchFrequencyConcept } from '@entities/concept/api/conceptApi';

export function useExamHint(subject: string) {
  const [hintOpen, setHintOpen] = useState(false);
  const [hintData, setHintData] = useState<FrequencyConcept | null>(null);
  const [hintLoading, setHintLoading] = useState(false);

  async function openHint(unitNumber: number) {
    if (hintData) { setHintOpen(true); return; }
    setHintLoading(true);
    try {
      const data = await fetchFrequencyConcept(subject, unitNumber);
      setHintData(data);
      setHintOpen(true);
    } catch { /* ignore */ }
    setHintLoading(false);
  }

  function closeHint() { setHintOpen(false); }

  function resetHint() {
    setHintData(null);
    setHintOpen(false);
  }

  return { hintOpen, hintData, hintLoading, openHint, closeHint, resetHint };
}
