'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { fetchConceptMd, updateStudyProgress } from '@/lib/studyQuizApi';
import { fetchUnitId } from '@/lib/studyApi';
import s from './page.module.scss';

const markdownComponents = {
  a: ({ href, children, ...props }: any) => (
    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  ),
};

function parseUnitNumber(chapter: string): number {
  const match = chapter.match(/\d+/);
  return match ? parseInt(match[0], 10) : 1;
}

interface Card {
  title: string;
  analysisContent: string;   // 문단 해설
  vizContent: string;        // 시각 자료 (없으면 '')
  sectionIndex: number;
}

function buildCards(md: string): Card[] {
  const jsonMatch = md.match(/```json\s*([\s\S]*?)\s*```/);
  if (jsonMatch) {
    return buildCardsFromJson(jsonMatch[1]);
  }
  return buildCardsFromMarkdown(md);
}

function buildCardsFromJson(raw: string): Card[] {
  const data = JSON.parse(raw);
  const cards: Card[] = [];

  const sectionIndexMap: Record<string, number> = {
    IntroCard: 1,
    IntegratedConceptCard: 2,
    RecallLogicCard: 4,
  };

  for (const card of data.cards) {
    const { type, content } = card;
    const sectionIndex = sectionIndexMap[type] ?? 2;

    const analysisParts: string[] = [];
    if (content.description) {
      analysisParts.push(content.description);
    }
    if (content.bullet_points && content.bullet_points.length > 0) {
      analysisParts.push(`\n\n**핵심 포인트**\n${content.bullet_points.map((p: string) => `- ${p}`).join('\n')}`);
    }
    if (content.trap_points && content.trap_points.length > 0) {
      analysisParts.push(`\n\n**⚠️ 출제 함정**\n${content.trap_points.map((p: string) => `- ${p}`).join('\n')}`);
    }
    if (content.integrated_data?.logic_flow) {
      analysisParts.push(`\n\n**논리 흐름**\n${content.integrated_data.logic_flow}`);
    }

    const vizParts: string[] = [];
    if (content.integrated_data?.table) {
      vizParts.push(content.integrated_data.table);
    }
    if (content.integrated_data?.visual_analysis) {
      vizParts.push(`\n\n**시각 자료 분석**\n${content.integrated_data.visual_analysis}`);
    }

    cards.push({
      title: content.title,
      analysisContent: analysisParts.join('').trim(),
      vizContent: vizParts.join('').trim(),
      sectionIndex,
    });
  }

  return cards;
}

function buildCardsFromMarkdown(md: string): Card[] {
  const clean = md.replace(/\[FINAL_COMMAND\][\s\S]*$/, '').trim();
  const lines = clean.split('\n');

  const h2Sections: { num: number; title: string; startLine: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^## (\d+)\.\s*(.+)/);
    if (m) h2Sections.push({ num: parseInt(m[1]), title: m[2].trim(), startLine: i });
  }

  function getH2Content(sectionNum: number): string {
    const idx = h2Sections.findIndex((s) => s.num === sectionNum);
    if (idx < 0) return '';
    const start = h2Sections[idx].startLine + 1;
    const end = idx + 1 < h2Sections.length ? h2Sections[idx + 1].startLine : lines.length;
    return lines.slice(start, end).join('\n').trim();
  }

  const cards: Card[] = [];

  const section1Content = getH2Content(1);
  if (section1Content) {
    cards.push({
      title: '지문 개요 및 핵심 요지',
      analysisContent: section1Content,
      vizContent: '',
      sectionIndex: 1,
    });
  }

  const section2Idx = h2Sections.findIndex((s) => s.num === 2);
  if (section2Idx >= 0) {
    const start = h2Sections[section2Idx].startLine + 1;
    const end = section2Idx + 1 < h2Sections.length ? h2Sections[section2Idx + 1].startLine : lines.length;
    const section2Lines = lines.slice(start, end);

    const concepts: { title: string; startLine: number }[] = [];
    for (let i = 0; i < section2Lines.length; i++) {
      const m = section2Lines[i].match(/^### (.+)/);
      if (m) concepts.push({ title: m[1].replace(/\[|\]/g, '').trim(), startLine: i });
    }

    for (let ci = 0; ci < concepts.length; ci++) {
      const cStart = concepts[ci].startLine + 1;
      const cEnd = ci + 1 < concepts.length ? concepts[ci + 1].startLine : section2Lines.length;
      const conceptLines = section2Lines.slice(cStart, cEnd).join('\n');

      const boldSections = splitByBoldHeaders(conceptLines);
      const analysisKeys = ['개념 정의 및 속성', '문단 논리 및 전개', '출제 포인트 및 함정'];
      const vizKey = '관련 데이터 및 시각 자료 분석';

      const analysisParts: string[] = [];
      let vizContent = '';

      for (const [key, value] of boldSections) {
        if (analysisKeys.some((k) => key.includes(k))) {
          analysisParts.push(value);
        } else if (key.includes(vizKey)) {
          vizContent = value;
        }
      }

      cards.push({
        title: concepts[ci].title,
        analysisContent: analysisParts.join('\n\n').trim(),
        vizContent: vizContent.trim(),
        sectionIndex: 2,
      });
    }
  }

  const section3Content = getH2Content(3);
  if (section3Content) {
    cards.push({
      title: '개념 간 관계 및 최종 구조도',
      analysisContent: section3Content,
      vizContent: '',
      sectionIndex: 4,
    });
  }

  return cards;
}

function splitByBoldHeaders(text: string): [string, string][] {
  const results: [string, string][] = [];
  const lines = text.split('\n');
  let currentKey = '';
  let currentLines: string[] = [];

  for (const line of lines) {
    const m = line.match(/^- \*\*(.+?)\*\*\s*:\s*(.*)/);
    if (m) {
      if (currentKey) {
        results.push([currentKey, currentLines.join('\n').trim()]);
      }
      currentKey = m[1];
      currentLines = m[2] ? [m[2]] : [];
    } else {
      if (currentKey) currentLines.push(line);
    }
  }

  if (currentKey) {
    results.push([currentKey, currentLines.join('\n').trim()]);
  }

  return results;
}

const SECTION_COLORS: Record<number, string> = {
  1: s.card1,
  2: s.card2,
  3: s.card3,
  4: s.card4,
};

const SECTION_ICONS: Record<number, string> = {
  1: '📌',
  2: '📖',
  3: '📊',
  4: '🔗',
};

type PageState = 'loading' | 'error' | 'done';

export default function ConceptPage({
  params,
}: {
  params: Promise<{ subject: string; chapter: string }>;
}) {
  const { subject, chapter } = use(params);
  const unitNumber = parseUnitNumber(chapter);
  const router = useRouter();

  const [pageState, setPageState] = useState<PageState>('loading');
  const [cards, setCards] = useState<Card[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    setPageState('loading');
    setCurrentIndex(0);
    fetchConceptMd(subject, unitNumber)
      .then((text) => {
        setCards(buildCards(text));
        setPageState('done');
      })
      .catch((err: Error) => {
        setErrorMsg(err.message);
        setPageState('error');
      });
  }, [subject, unitNumber]);

  const total = cards.length;
  const current = cards[currentIndex];

  return (
    <div className={s.container}>
      {/* 헤더 */}
      <div className={s.header}>
        <button className={s.backButton} onClick={() => router.back()}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M10 12L6 8L10 4" stroke="#5C6370" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </button>
        <span className={s.headerTitle}>{unitNumber}단원 · 기초 개념</span>
        {pageState === 'done' && (
          <span className={s.headerCount}>{currentIndex + 1} / {total}</span>
        )}
      </div>

      {/* 카드 영역 */}
      <div className={s.cardArea}>
        {pageState === 'loading' && (
          <div className={s.center}><div className={s.spinner} /></div>
        )}
        {pageState === 'error' && (
          <div className={s.center}><span className={s.errorText}>{errorMsg}</span></div>
        )}

        {pageState === 'done' && current && (
          <div className={s.card}>
            {/* 카드 타이틀 */}
            <div className={`${s.cardTitleRow} ${SECTION_COLORS[current.sectionIndex] ?? s.card1}`}>
              <span className={s.cardIcon}>{SECTION_ICONS[current.sectionIndex] ?? '📄'}</span>
              <span className={s.cardTitle}>{current.title}</span>
            </div>

            {/* 문단 해설 */}
            {current.analysisContent && (
              <div className={s.analysisBlock}>
                <div className={s.markdownBody}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                    {current.analysisContent}
                  </ReactMarkdown>
                </div>
              </div>
            )}

            {/* 시각 자료 구분선 */}
            {current.analysisContent && current.vizContent && (
              <div className={s.vizDivider}>
                <span className={s.vizDividerLabel}>📊 시각 자료</span>
              </div>
            )}

            {/* 시각 자료 */}
            {current.vizContent && (
              <div className={s.vizBlock}>
                <div className={s.markdownBody}>
                  <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                    {current.vizContent}
                  </ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 하단 네비게이션 */}
      {pageState === 'done' && total > 0 && (
        <div className={s.nav}>
          <div className={s.dots}>
            {cards.map((c, i) => (
              <button
                key={i}
                className={`${s.dot} ${i === currentIndex ? s.dotActive : ''}`}
                onClick={() => { setCurrentIndex(i); }}
                title={c.title}
              />
            ))}
          </div>
          <div className={s.navButtons}>
            <button
              className={s.navButton}
              onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
              disabled={currentIndex === 0}
            >
              ← 이전
            </button>
            {currentIndex === total - 1 ? (
              <button
                className={`${s.navButton} ${s.navButtonNext}`}
                onClick={async () => {
                  // BASIC_CONCEPT 진척도 저장
                  try {
                    const unitId = await fetchUnitId(subject, unitNumber);
                    if (unitId) await updateStudyProgress(unitId, 'BASIC_CONCEPT', 100);
                  } catch { /* 무시 */ }
                  router.push(`/study/${subject}/${chapter}/q1?count=10`);
                }}
              >
                빈칸 문제 풀기 →
              </button>
            ) : (
              <button
                className={`${s.navButton} ${s.navButtonPrimary}`}
                onClick={() => setCurrentIndex((i) => Math.min(total - 1, i + 1))}
              >
                다음 →
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
