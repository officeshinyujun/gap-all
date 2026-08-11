import type { StudyNoteCandidate } from './study-insights';

/**
 * These are normalized labels derived from the private uploaded notes.
 * The notes themselves are never returned to Study or passed to Q3.
 */
export const STUDY_NOTE_CANDIDATES: readonly StudyNoteCandidate[] = [
  {
    subjectSlug: 'success',
    unitNumber: 4,
    title: '경제 주체와 기업의 역할',
    aliases: ['경제 주체', '기업의 역할'],
    comparisonAxes: ['경제 주체별 역할', '생산·소비·정책 활동의 구분'],
    formatCandidates: ['사례 판단형', '보기 조합형'],
    trapCandidates: ['가계·기업·정부의 역할 혼동'],
  },
  {
    subjectSlug: 'success',
    unitNumber: 4,
    title: '기업 형태와 사회적 책임',
    aliases: ['기업의 형태', '기업의 분류', '출자 형태', '사회적 기업', '기업의 사회적 책임'],
    comparisonAxes: ['기업 형태별 특징', '책임 범위', '사회적 책임의 단계'],
    formatCandidates: ['사례 판단형', '개념 비교형'],
    trapCandidates: ['영리·비영리·사회적 기업의 성격 혼동'],
  },
  {
    subjectSlug: 'industry',
    unitNumber: 4,
    title: '첨단 기술과 신기술 인증',
    aliases: ['첨단 기술', '신기술 인증'],
    comparisonAxes: ['기술 분야 구분', '인증 종류와 적용 사례'],
    formatCandidates: ['자료 해석형', '사례 판단형'],
    trapCandidates: ['기술 분야와 인증 명칭의 혼동'],
  },
  {
    subjectSlug: 'industry',
    unitNumber: 4,
    title: '지식재산권과 조직 형태',
    aliases: ['지식재산권', '조직 형태'],
    comparisonAxes: ['권리의 종류', '조직 형태별 특징'],
    formatCandidates: ['사례 판단형', '보기 조합형'],
    trapCandidates: ['권리 존속 기간과 조직 형태의 혼동'],
  },
];
