"use client";
import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import { X, Download, FileText } from 'lucide-react';
import { HStack } from '@shared/ui/HStack';
import { VStack } from '@shared/ui/VStack';
import Typo from '@shared/ui/Typo';
import { Tag } from '@shared/ui/Tag';
import { ProblemList, type ProblemItem } from '@/components/exam/ProblemList';
import { CreateExamModal } from '@/components/exam/CreateExamModal';
import { HeaderActions } from '@shared/ui/HeaderActions';
import { SPACING } from '@shared/constants/spacing';
import { getSubjectName } from '@shared/utils/subject';
import { fetchExams, type ExamListItem, invalidateExamListCache } from '@/lib/examApi';
import { getClientCache } from '@/lib/clientCache';
import { markAllNotificationsRead } from '@/lib/notificationApi';
import { useJobProgress } from '@features/exam-generation/model/JobProgressProvider';
import s from './page.module.scss';

const DIFFICULTY_LABEL: Record<string, string> = {
  LOW: '낮음',
  MIDDLE: '중간',
  HIGH: '높음',
  INTERGRATE: '통합',
};

function examToItem(exam: ExamListItem): ProblemItem {
  const range = exam.startUnitNum === exam.endUnitNum
    ? `${exam.startUnitNum}단원`
    : `${exam.startUnitNum}단원~${exam.endUnitNum}단원`;

  const score = exam.totalScore !== null && exam.totalScore !== undefined
    ? `${exam.totalScore}점`
    : '미채점';

  return {
    id: exam.id,
    range,
    diff: DIFFICULTY_LABEL[exam.difficulty] ?? exam.difficulty,
    count: exam.questionCount,
    score,
    description: exam.title,
    tags: exam.tags?.map((t) => t.tagName) ?? [],
    createdAt: exam.createdAt,
  };
}

export default function ExamPage() {
  const { subject = '' } = useParams();
  const subjectName = getSubjectName(subject);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const learnedUnitsParam = searchParams.get('learnedUnits') ?? '';
  const learnedUnitsArr = learnedUnitsParam.split(',').map(Number).filter(Boolean);
  const defaultStart = learnedUnitsArr.length > 0 ? Math.min(...learnedUnitsArr) : 1;
  const defaultEnd = learnedUnitsArr.length > 0 ? Math.max(...learnedUnitsArr) : 3;

  function examHref(examId: string) {
    return `/exam/${subject}/${examId}${learnedUnitsParam ? `?learnedUnits=${learnedUnitsParam}` : ''}`;
  }

  const [items, setItems] = useState<ProblemItem[]>([]);
  const [loading, setLoading] = useState(() => !getClientCache(`exam:list:${subject}`));
  const [selectedItem, setSelectedItem] = useState<ProblemItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showMobileDetail, setShowMobileDetail] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const { activeJobId, jobStatus, startJob } = useJobProgress();

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth <= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    if (jobStatus?.status === 'completed') {
      invalidateExamListCache(subject);
      loadExams();
    }
  }, [jobStatus?.status]);

  const handleCloseMobileDetail = () => {
    setIsClosing(true);
    setTimeout(() => {
      setShowMobileDetail(false);
      setIsClosing(false);
    }, 240);
  };

  function loadExams() {
    setLoading(true);
    fetchExams(subject)
      .then((exams) => {
        const mapped = exams.map(examToItem);
        setItems(mapped);
        setSelectedItem(mapped[0] ?? null);
      })
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadExams();
    markAllNotificationsRead().catch(() => {});
  }, [subject]);

  const handlePdfExport = async () => {
    if (!selectedItem?.id) return;
    const React = await import('react');
    const { pdf } = await import('@react-pdf/renderer');
    const { ExamPdfDocument } = await import('@/components/exam/ExamPdf');
    const { fetchExam } = await import('@/lib/examApi');
    const examData = await fetchExam(selectedItem.id);
    const blob = await pdf(
      React.createElement(ExamPdfDocument, {
        title: examData.title,
        subjectName,
        difficulty: selectedItem.diff,
        unitRange: selectedItem.range,
        items: examData.items,
      })
    ).toBlob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${examData.title}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filteredItems = items.filter((item) => {
    if (!searchQuery.trim()) return true;
    const unitNum = parseInt(searchQuery, 10);
    if (isNaN(unitNum)) return false;
    const match = item.range.match(/(\d+)단원/);
    if (!match) return false;
    const rangeMatch = item.range.match(/(\d+)단원~(\d+)단원/);
    if (rangeMatch) {
      const [, start, end] = rangeMatch.map(Number);
      return unitNum >= start && unitNum <= end;
    }
    return parseInt(match[1]) === unitNum;
  });

  return (
    <VStack fullWidth fullHeight gap={SPACING.s20} className={s.container}>
      {/* Header */}
      <HStack fullWidth justify="between" align="center">
        <VStack gap={SPACING.s6}>
          <Typo.SM size={24} color="primary">{subjectName} 문제</Typo.SM>
          <Typo.MD size={12} color="secondary">{subjectName} 문제에 오신 것을 환영합니다</Typo.MD>
        </VStack>
        <HeaderActions />
      </HStack>

      {/* Body */}
      <HStack fullWidth align="start" gap={SPACING.s16} style={{ flex: 1, minHeight: 0 }} className={s.bodyArea}>
        {/* Left Panel */}
        <VStack className={s.leftPanel} gap={SPACING.s16} fullHeight>
          {/* Search + 추가 버튼 */}
          <HStack fullWidth gap={SPACING.s10} align="center">
            <HStack className={s.searchBar} gap={SPACING.s10} align="center">
              <svg className={s.searchIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <circle cx="11" cy="11" r="8" strokeWidth="2" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" strokeWidth="2" />
              </svg>
              <input
                className={s.searchInput}
                type="number"
                min={1}
                placeholder="단원 번호를 입력하세요..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </HStack>
            <div className={s.searchButton} onClick={() => !activeJobId && setIsModalOpen(true)} style={{ cursor: activeJobId ? 'not-allowed' : 'pointer', opacity: activeJobId ? 0.4 : 1 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white">
                <line x1="12" y1="5" x2="12" y2="19" strokeWidth="2" strokeLinecap="round" />
                <line x1="5" y1="12" x2="19" y2="12" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </div>
          </HStack>

          {/* List */}
          {loading ? (
            <div className={s.spinner} />
          ) : filteredItems.length === 0 ? (
            <VStack align="center" justify="center" gap={SPACING.s12} style={{ flex: 1 }}>
              <Typo.MD size={14} color="secondary">생성된 시험이 없습니다.</Typo.MD>
              <Typo.MD size={12} color="secondary">+ 버튼으로 새 시험을 만들어보세요.</Typo.MD>
            </VStack>
          ) : (
            <ProblemList
              items={filteredItems}
              onSelect={(item) => {
                setSelectedItem(item);
                if (isMobile) setShowMobileDetail(true);
              }}
            />
          )}
        </VStack>

        {/* Right Panel */}
        <VStack className={s.rightPanel} fullHeight justify="between">
          {selectedItem ? (
            <>
              <VStack fullWidth gap={SPACING.s16}>
                <HStack fullWidth justify="between" align="center">
                  <VStack gap={SPACING.s8}>
                    <Typo.SM size={24} color="primary">{selectedItem.range} 문제</Typo.SM>
                    <Typo.MD size={14} color="secondary">{selectedItem.description}</Typo.MD>
                  </VStack>
                  <VStack gap={SPACING.s6} align="end">
                    <Typo.SM size={16} color="brand">{selectedItem.score}</Typo.SM>
                    {selectedItem.createdAt && (
                      <Typo.MD size={12} color="secondary">
                        {new Date(selectedItem.createdAt).toLocaleDateString('ko-KR')}
                      </Typo.MD>
                    )}
                  </VStack>
                </HStack>

                <div className={s.divider} />

                <VStack fullWidth gap={SPACING.s20}>
                  <HStack gap={SPACING.s16}>
                    <VStack gap={SPACING.s4}>
                      <Typo.MD size={12} color="secondary">난이도</Typo.MD>
                      <Typo.MD size={14} color="primary">{selectedItem.diff}</Typo.MD>
                    </VStack>
                    <VStack gap={SPACING.s4}>
                      <Typo.MD size={12} color="secondary">문제 수</Typo.MD>
                      <Typo.MD size={14} color="primary">{selectedItem.count}문제</Typo.MD>
                    </VStack>
                  </HStack>

                  {selectedItem.tags && selectedItem.tags.length > 0 && (
                    <VStack gap={SPACING.s8}>
                      <Typo.MD size={12} color="secondary">태그</Typo.MD>
                      <HStack gap={SPACING.s8} align="center" wrap="wrap">
                        {selectedItem.tags.map((tag, i) => (
                          <Tag key={i}>{tag}</Tag>
                        ))}
                      </HStack>
                    </VStack>
                  )}
                </VStack>
              </VStack>

              {/* 버튼 */}
              <HStack fullWidth gap={SPACING.s8}>
                <button
                  className={`${s.startButton} ${s.outlineButton}`}
                    onClick={() => selectedItem.id && navigate(examHref(selectedItem.id))}
                >
                  <Typo.MD size={14} color="brand" style={{ fontWeight: 600 }}>
                    {selectedItem.score !== '미채점' ? '다시 풀기' : '문제 풀기'}
                  </Typo.MD>
                </button>
                {selectedItem.score !== '미채점' && (
                  <button
                    className={s.startButton}
                    onClick={() => selectedItem.id && navigate(`/exam/${subject}/${selectedItem.id}?review=1`)}
                  >
                    <Typo.MD size={14} color="primary" style={{ fontWeight: 600, color: '#fff' }}>해설 보기</Typo.MD>
                  </button>
                )}
                <button
                  className={`${s.startButton} ${s.outlineButton}`}
                  onClick={handlePdfExport}
                >
                  <HStack gap={4} align="center">
                    <FileText size={14} />
                    <Typo.MD size={14} color="brand" style={{ fontWeight: 600 }}>PDF 내보내기</Typo.MD>
                  </HStack>
                </button>
              </HStack>
            </>
          ) : (
            <VStack align="center" justify="center" fullHeight>
              <Typo.MD size={14} color="secondary">시험을 선택해주세요.</Typo.MD>
            </VStack>
          )}
        </VStack>
      </HStack>

      <CreateExamModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        subjectName={subjectName}
        defaultStartUnit={defaultStart}
        defaultEndUnit={defaultEnd}
        onCreated={(jobId) => {
          startJob(jobId);
        }}
      />

      {isMobile && showMobileDetail && selectedItem && (
        <div className={`${s.mobileOverlay} ${isClosing ? s.closing : ''}`}>
          <button className={s.mobileOverlayClose} onClick={handleCloseMobileDetail}>
            <X size={24} />
          </button>
          <VStack fullWidth gap={SPACING.s24}>
            <VStack fullWidth gap={SPACING.s16}>
              <HStack fullWidth justify="between" align="center">
                <VStack gap={SPACING.s8}>
                  <Typo.SM size={24} color="primary">{selectedItem.range} 문제</Typo.SM>
                  <Typo.MD size={14} color="secondary">{selectedItem.description}</Typo.MD>
                </VStack>
                <VStack gap={SPACING.s6} align="end">
                  <Typo.SM size={16} color="brand">{selectedItem.score}</Typo.SM>
                  {selectedItem.createdAt && (
                    <Typo.MD size={12} color="secondary">
                      {new Date(selectedItem.createdAt).toLocaleDateString('ko-KR')}
                    </Typo.MD>
                  )}
                </VStack>
              </HStack>

              <div className={s.divider} />

              <VStack fullWidth gap={SPACING.s20}>
                <HStack gap={SPACING.s16}>
                  <VStack gap={SPACING.s4}>
                    <Typo.MD size={12} color="secondary">난이도</Typo.MD>
                    <Typo.MD size={14} color="primary">{selectedItem.diff}</Typo.MD>
                  </VStack>
                  <VStack gap={SPACING.s4}>
                    <Typo.MD size={12} color="secondary">문제 수</Typo.MD>
                    <Typo.MD size={14} color="primary">{selectedItem.count}문제</Typo.MD>
                  </VStack>
                </HStack>

                {selectedItem.tags && selectedItem.tags.length > 0 && (
                  <VStack gap={SPACING.s8}>
                    <Typo.MD size={12} color="secondary">태그</Typo.MD>
                    <HStack gap={SPACING.s8} align="center" wrap="wrap">
                      {selectedItem.tags.map((tag, i) => (
                        <Tag key={i}>{tag}</Tag>
                      ))}
                    </HStack>
                  </VStack>
                )}
              </VStack>
            </VStack>

            <button
              className={s.startButton}
              onClick={() => selectedItem.id && navigate(examHref(selectedItem.id))}
            >
              <Typo.MD size={14} color="primary" style={{ fontWeight: 600, color: '#fff' }}>문제 풀기</Typo.MD>
            </button>
            <button
              className={`${s.startButton} ${s.outlineButton}`}
              onClick={handlePdfExport}
              style={{ marginTop: 8 }}
            >
              <HStack gap={4} align="center" justify="center" fullWidth>
                <FileText size={14} />
                <Typo.MD size={14} color="brand">PDF 내보내기</Typo.MD>
              </HStack>
            </button>
          </VStack>
        </div>
      )}
    </VStack>
  );
}
