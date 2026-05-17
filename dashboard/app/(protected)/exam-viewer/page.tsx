'use client';

import React, { useState } from 'react';
import { VStack } from '@/components/general/VStack';
import { HStack } from '@/components/general/HStack';
import Typo from '@/components/general/Typo';
import { QuestionRenderer } from '@/components/exam/QuestionStem/QuestionRenderer';
import { getTemplateLabel, inferTemplate } from '@/utils/examParser';
import exam1Data from '@/data/exam.json';
import exam2Data from '@/data/ex2am.json';
import exam3Data from '@/data/exam3.json';
import exam4Data from '@/data/exam4.json';
import type { ExamQuestion } from '@/types/examQuestion';
import s from './page.module.scss';

const TABS = [
  { id: 'exam1', label: 'exam.json', title: '성공적인 직업생활 — 4단원', data: exam1Data as unknown as ExamQuestion[] },
  { id: 'exam2', label: 'ex2am.json', title: '성공적인 직업생활 — 8단원', data: exam2Data as unknown as ExamQuestion[] },
  { id: 'exam3', label: 'exam3.json', title: '성공적인 직업생활 — 8단원 (3회)', data: exam3Data as unknown as ExamQuestion[] },
  { id: 'exam4', label: 'exam4.json', title: '성공적인 직업생활 — 2단원', data: exam4Data as unknown as ExamQuestion[] },
];

export default function ExamViewerPage() {
  const [activeTab, setActiveTab] = useState('exam1');
  const [currentIndex, setCurrentIndex] = useState(0);

  const tab = TABS.find((t) => t.id === activeTab)!;
  const questions = tab.data;
  const current = questions[currentIndex];
  const total = questions.length;

  const handleTabChange = (id: string) => {
    setActiveTab(id);
    setCurrentIndex(0);
  };

  const goTo = (index: number) => {
    if (index >= 0 && index < total) setCurrentIndex(index);
  };

  const getTemplate = (q: ExamQuestion) =>
    q.metadata.recommended_template ?? inferTemplate(q.render_ready.stimulus_data) ?? '';

  return (
    <VStack gap={0} fullWidth fullHeight className={s.page}>
      {/* 헤더 */}
      <div className={s.header}>
        <HStack gap={0} align="center" justify="between" fullWidth>
          <VStack gap={4}>
            <Typo.BD size={16} color="primary">{tab.title}</Typo.BD>
            <HStack gap={12} align="center">
              <Typo.TH size={12} color="secondary">총 {total}문항</Typo.TH>
              <span className={s.divider}>|</span>
              <Typo.TH size={12} color="secondary">
                {currentIndex + 1}번 — {current.metadata.target_concept}
              </Typo.TH>
              {current.metadata.difficulty && (
                <>
                  <span className={s.divider}>|</span>
                  <span className={s.diffBadge} data-level={current.metadata.difficulty}>
                    {current.metadata.difficulty}
                  </span>
                </>
              )}
            </HStack>
          </VStack>
          <HStack gap={8} align="center">
            <button className={s.navBtn} onClick={() => goTo(currentIndex - 1)} disabled={currentIndex === 0}>← 이전</button>
            <span className={s.pageIndicator}>{currentIndex + 1} / {total}</span>
            <button className={s.navBtn} onClick={() => goTo(currentIndex + 1)} disabled={currentIndex === total - 1}>다음 →</button>
          </HStack>
        </HStack>

        {/* 탭 */}
        <HStack gap={0} fullWidth className={s.tabs}>
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`${s.tab} ${activeTab === t.id ? s.tabActive : ''}`}
              onClick={() => handleTabChange(t.id)}
            >
              {t.label}
            </button>
          ))}
        </HStack>
      </div>

      {/* 본문 */}
      <div className={s.body}>
        <HStack gap={20} align="start" fullWidth fullHeight>
          {/* 사이드바 */}
          <div className={s.sidebar}>
            <VStack gap={4} fullWidth>
              <Typo.SM size={12} color="secondary" className={s.sidebarTitle}>문항 목록</Typo.SM>
              {questions.map((q, index) => (
                <button
                  key={index}
                  className={`${s.sidebarItem} ${currentIndex === index ? s.sidebarItemActive : ''}`}
                  onClick={() => goTo(index)}
                >
                  <HStack gap={8} align="center" fullWidth>
                    <span className={s.sidebarNum}>{index + 1}</span>
                    <VStack gap={2}>
                      <span className={s.sidebarConcept}>{q.metadata.target_concept}</span>
                      <HStack gap={6} align="center">
                        <span className={s.sidebarTemplate}>{getTemplateLabel(getTemplate(q))}</span>
                        {q.metadata.difficulty && (
                          <span className={s.sidebarDiff} data-level={q.metadata.difficulty}>
                            {q.metadata.difficulty}
                          </span>
                        )}
                      </HStack>
                    </VStack>
                  </HStack>
                </button>
              ))}
            </VStack>
          </div>

          {/* 문항 렌더러 */}
          <div className={s.main}>
            <QuestionRenderer key={`${activeTab}-${currentIndex}`} question={current} questionNumber={currentIndex + 1} />
            <HStack gap={12} justify="between" fullWidth className={s.bottomNav}>
              <button
                className={`${s.bottomNavBtn} ${currentIndex === 0 ? s.bottomNavBtnDisabled : ''}`}
                onClick={() => goTo(currentIndex - 1)}
                disabled={currentIndex === 0}
              >← 이전 문항</button>
              <Typo.TH size={12} color="secondary">{currentIndex + 1} / {total}</Typo.TH>
              <button
                className={`${s.bottomNavBtn} ${currentIndex === total - 1 ? s.bottomNavBtnDisabled : ''}`}
                onClick={() => goTo(currentIndex + 1)}
                disabled={currentIndex === total - 1}
              >다음 문항 →</button>
            </HStack>
          </div>
        </HStack>
      </div>
    </VStack>
  );
}
