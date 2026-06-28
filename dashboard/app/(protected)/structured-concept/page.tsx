'use client';

import { useState } from 'react';
import { VStack } from '@/components/general/VStack';
import { HStack } from '@/components/general/HStack';
import Typo from '@/components/general/Typo';
import { SPACING } from '@/constants/spacing';
import { apiFetch } from '@/lib/api';
import { ChevronDown } from 'lucide-react';
import s from './page.module.scss';

const SUBJECTS = [
  { value: 'success', label: '성공적인 직업생활' },
  { value: 'industry', label: '공업 일반' },
];

interface Subsection {
  title: string;
  explanation: string;
  keyPoints: string[];
  table: string;
  visualGuide: string;
  supplementNote: string;
  examPoints: string[];
  pitfalls: string[];
}

interface Section {
  title: string;
  summary: string;
  subsections: Subsection[];
}

interface StructuredConcept {
  subject: string;
  unit: string;
  unitTitle: string;
  learningObjectives: string[];
  sections: Section[];
  closingSummary: string[];
}

function SectionBlock({ section }: { section: Section }) {
  const [open, setOpen] = useState(true);

  return (
    <div className={s.section}>
      <div className={s.sectionHeader} onClick={() => setOpen(!open)}>
        <Typo.MD size={16} color="primary">{section.title}</Typo.MD>
        <ChevronDown size={16} className={`${s.chevron} ${open ? s.chevronOpen : ''}`} />
      </div>
      {open && (
        <VStack gap={SPACING.s16}>
          {section.summary && (
            <Typo.SM size={12} color="secondary">{section.summary}</Typo.SM>
          )}
          {section.subsections.map((sub, idx) => (
            <SubsectionBlock key={idx} subsection={sub} />
          ))}
        </VStack>
      )}
    </div>
  );
}

function SubsectionBlock({ subsection }: { subsection: Subsection }) {
  return (
    <div className={s.subsection}>
      <Typo.MD size={14} color="primary">{subsection.title}</Typo.MD>

      {subsection.explanation && (
        <p className={s.explanation}>{subsection.explanation}</p>
      )}

      {subsection.keyPoints?.length > 0 && (
        <ul className={s.bulletList}>
          {subsection.keyPoints.map((point, i) => (
            <li key={i}>{point}</li>
          ))}
        </ul>
      )}

      {subsection.table && (
        <pre className={s.tableBlock}>{subsection.table}</pre>
      )}

      {subsection.visualGuide && (
        <div className={s.noteBox}>
          <Typo.SM size={10} color="secondary">시각 가이드</Typo.SM>
          <p>{subsection.visualGuide}</p>
        </div>
      )}

      {subsection.supplementNote && (
        <div className={s.noteBox}>
          <Typo.SM size={10} color="secondary">보충 설명</Typo.SM>
          <p>{subsection.supplementNote}</p>
        </div>
      )}

      {subsection.examPoints?.length > 0 && (
        <VStack gap={SPACING.s4}>
          <Typo.SM size={10} color="secondary">출제 포인트</Typo.SM>
          <div className={s.examTagList}>
            {subsection.examPoints.map((ep, i) => (
              <span key={i} className={s.examTag}>{ep}</span>
            ))}
          </div>
        </VStack>
      )}

      {subsection.pitfalls?.length > 0 && (
        <VStack gap={SPACING.s4}>
          <Typo.SM size={10} color="secondary">주의사항</Typo.SM>
          <ul className={s.pitfallList}>
            {subsection.pitfalls.map((p, i) => (
              <li key={i} className={s.pitfallItem}>{p}</li>
            ))}
          </ul>
        </VStack>
      )}
    </div>
  );
}

export default function StructuredConceptPage() {
  const [subject, setSubject] = useState('success');
  const [unit, setUnit] = useState(1);
  const [data, setData] = useState<StructuredConcept | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleFetch = async () => {
    setLoading(true);
    setError('');
    setData(null);
    try {
      const result = await apiFetch<StructuredConcept>(
        `/study/${subject}/${unit}/structured-concept`,
      );
      setData(result);
    } catch (e: any) {
      setError(e.message || '불러오기 실패');
    } finally {
      setLoading(false);
    }
  };

  return (
    <VStack gap={SPACING.s24} className={s.container}>
      <Typo.MD size={20} color="primary">Structured Concept 미리보기</Typo.MD>

      <HStack gap={SPACING.s12} className={s.controlPanel}>
        <select
          className={s.select}
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        >
          {SUBJECTS.map((subj) => (
            <option key={subj.value} value={subj.value}>{subj.label}</option>
          ))}
        </select>

        <input
          type="number"
          className={s.select}
          min={1}
          max={20}
          value={unit}
          onChange={(e) => setUnit(Number(e.target.value))}
          style={{ minWidth: 80 }}
        />

        <button
          className={`${s.button} ${s.buttonPrimary}`}
          onClick={handleFetch}
          disabled={loading}
        >
          {loading ? '로딩...' : '불러오기'}
        </button>
      </HStack>

      {error && (
        <div className={s.errorMessage}>{error}</div>
      )}

      {data && (
        <VStack gap={SPACING.s20} className={s.content}>
          <VStack gap={SPACING.s8}>
            <Typo.MD size={20} color="primary">{data.unitTitle}</Typo.MD>
            {data.learningObjectives?.length > 0 && (
              <VStack gap={SPACING.s4}>
                <Typo.SM size={12} color="secondary">학습 목표</Typo.SM>
                <ul className={s.bulletList}>
                  {data.learningObjectives.map((obj, i) => (
                    <li key={i}>{obj}</li>
                  ))}
                </ul>
              </VStack>
            )}
          </VStack>

          {data.sections.map((section, idx) => (
            <SectionBlock key={idx} section={section} />
          ))}

          {data.closingSummary?.length > 0 && (
            <div className={s.closingSummary}>
              <Typo.SM size={12} color="secondary">마무리 요약</Typo.SM>
              <ul className={s.bulletList}>
                {data.closingSummary.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          )}
        </VStack>
      )}
    </VStack>
  );
}
