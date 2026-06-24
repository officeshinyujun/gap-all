'use client';

import { useState, useEffect, useMemo } from 'react';
import { fetchUnitsWithProgress, fetchUnitConcepts } from '@entities/study/api/studyApi';
import type { ApiUnit } from '@entities/study/model/types';

export function useStudySubject(subject: string) {
  const [units, setUnits] = useState<ApiUnit[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUnitId, setSelectedUnitId] = useState<string>('');
  const [tags, setTags] = useState<string[]>([]);
  const [showMobileDetail, setShowMobileDetail] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    fetchUnitsWithProgress(subject)
      .then((data) => {
        setUnits(data.units);
        if (data.units.length > 0) setSelectedUnitId(data.units[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [subject]);

  const selectedUnit = units.find((u) => u.id === selectedUnitId) ?? units[0];
  const unitNumber = selectedUnit?.unitNumber ?? 1;

  useEffect(() => {
    if (!selectedUnit) return;
    fetchUnitConcepts(subject, selectedUnit.unitNumber)
      .then((concepts) => setTags(concepts.slice(0, 7)))
      .catch(() => setTags([]));
  }, [subject, selectedUnit?.unitNumber]);

  function handleUnitClick(unitId: string) {
    setSelectedUnitId(unitId);
    if (isMobile) setShowMobileDetail(true);
  }

  function handleCloseMobileDetail() {
    setIsClosing(true);
    setTimeout(() => { setShowMobileDetail(false); setIsClosing(false); }, 240);
  }

  return {
    units, loading, selectedUnit, unitNumber, tags,
    selectedUnitId, setSelectedUnitId,
    showMobileDetail, isClosing, isMobile,
    handleUnitClick, handleCloseMobileDetail,
  };
}
