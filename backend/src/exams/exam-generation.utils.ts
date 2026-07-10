import { Logger } from '@nestjs/common';
import { Difficulty } from '../entities/exam-record.entity';

// ============================================================
// Types
// ============================================================
export interface GeneratedQuestion {
  targetConcept: string;
  itemType: string;
  difficulty: Difficulty;
  recommendedTemplate: string;
  questionStem: string;
  stimulusData: object;
  optionsList: string[];
  comboBlock: {
    title: string;
    items: Array<{ key: string; text: string }>;
  } | null;
  explanation: object;
  correctAnswer: number;
  unitName: string;
  setGroupId: string | null;
  setPosition: number | null;
}

export interface ExamGenerationProgressUpdate {
  stage: string;
  progress: number;
  message: string;
  status?: 'info' | 'success' | 'warning' | 'error';
  detail?: string;
}

export type ExamGenerationProgressReporter = (
  update: ExamGenerationProgressUpdate,
) => void | Promise<void>;

// ============================================================
// Constants
// ============================================================

// 실제 수능/모의평가 11개 시험 분석 기반 단원별 출제 비중 (%)
export const UNIT_REAL_WEIGHTS: Record<number, number> = {
  1: 7.41, 2: 4.17, 3: 7.87, 4: 4.63, 5: 1.85,
  6: 6.94, 7: 4.17, 8: 6.02, 9: 0.5, 10: 5.56,
  11: 5.09, 12: 0.93, 13: 4.17, 14: 7.41, 15: 5.09,
  16: 2.31, 17: 4.63, 18: 5.09, 19: 6.94, 20: 9.72,
};

// 과목별 fallback 키워드
export const FALLBACK_KEYWORDS: Record<string, string[]> = {
  success: [
    '근로', '임금', '퇴직', '고용', '해고', '노동', '직업', '취업',
    '진로', '창업', 'NCS', '산재', '휴가', '휴게', '야간', '연장',
    '연소', '단시간', '계약', '고용보험', '산업재해', '근로기준법',
    '노동조합', '근로자', '사용자', '실업', '급여', '수당',
    '근로시간', '교육훈련', '자격', '학점', '평생교육',
  ],
  industry: [
    '공업', '제조', '생산', '품질', '재고', '공정', '안전', '설비',
    '재료', '부품', '가공', '조립', '검사', 'KS', '공차', '도면',
    'CAD', 'CNC', 'PLC', '자동화', '로봇', '에너지', '환경',
    '산업안전', '재해', '위험', '보호구', '안전보건',
  ],
};

export const TEXTBOOK_BASE = '/Users/yjshin/projects/gap/textbook';

// ============================================================
// Utility functions
// ============================================================

/**
 * 선택된 단원 범위 내에서 실제 기출 비중을 기준으로
 * 각 단원에 할당할 문항 수를 계산한다.
 */
export function computeUnitWeights(
  startUnit: number,
  endUnit: number,
  questionCount: number,
): Map<number, number> {
  const range: number[] = [];
  for (let u = startUnit; u <= endUnit; u++) {
    if (UNIT_REAL_WEIGHTS[u] !== undefined) range.push(u);
  }

  const totalWeight = range.reduce((sum, u) => sum + UNIT_REAL_WEIGHTS[u], 0);
  if (totalWeight <= 0) {
    const perUnit = Math.floor(questionCount / range.length);
    const rem = questionCount % range.length;
    const map = new Map<number, number>();
    range.forEach((u, i) => map.set(u, perUnit + (i < rem ? 1 : 0)));
    return map;
  }

  const raw = range.map((u) => ({
    unit: u,
    raw: (UNIT_REAL_WEIGHTS[u] / totalWeight) * questionCount,
  }));

  let allocated = 0;
  const result = raw.map((r) => {
    const floor = Math.floor(r.raw);
    allocated += floor;
    return { unit: r.unit, base: floor, frac: r.raw - floor };
  });

  result.sort((a, b) => b.frac - a.frac);
  for (let i = 0; allocated < questionCount && i < result.length; i++) {
    result[i].base++;
    allocated++;
  }

  const map = new Map<number, number>();
  for (const r of result) {
    if (r.base > 0) map.set(r.unit, r.base);
  }
  return map;
}

export function buildItemFamilyQuotaPrompt(
  subjectSlug: string,
  questionCount: number,
): string {
  if (questionCount <= 1) {
    return `# [문항 유형 강제 비율]\n1문항 생성이므로 비율 규칙 대신 발문/자료 구조에 가장 자연스러운 item_family 1개만 선택하라. 조합형(combination_judgment)을 자동 기본값으로 사용하지 마라.`;
  }

  const nonComboMin = Math.max(1, Math.ceil(questionCount * 0.4));
  const comboMax = questionCount - nonComboMin;

  if (subjectSlug === 'success') {
    const singleMin = Math.max(1, Math.ceil(questionCount * 0.2));
    const directMin = Math.max(1, Math.ceil(questionCount * 0.1));
    const workflowMin = questionCount >= 5 ? 1 : 0;
    return [
      '# [문항 유형 강제 비율 — 성직]',
      `총 ${questionCount}문항 중 combination_judgment는 최대 ${comboMax}문항까지만 허용한다.`,
      `나머지 최소 ${nonComboMin}문항은 non-조합형(single_selection, direct_statement, blank_workflow)으로 설계하라.`,
      `single_selection은 최소 ${singleMin}문항 포함하라.`,
      `direct_statement는 최소 ${directMin}문항 포함하라.`,
      workflowMin > 0 ? `blank_workflow는 최소 ${workflowMin}문항 포함하라.` : '',
      '채용 공고, 면접 장면, NCS 화면, 기사/칼럼, 취업 프로그램 안내는 single_selection 또는 direct_statement를 우선 사용하라.',
      '발문에 <보기>가 없는 경우 combination_judgment를 사용하지 마라.',
    ].filter(Boolean).join('\n');
  }

  const singleMin = Math.max(1, Math.ceil(questionCount * 0.15));
  const directMin = Math.max(1, Math.ceil(questionCount * 0.15));
  const workflowMin = questionCount >= 5 ? 1 : 0;
  return [
    '# [문항 유형 강제 비율 — 공일]',
    `총 ${questionCount}문항 중 combination_judgment는 최대 ${comboMax}문항까지만 허용한다.`,
    `나머지 최소 ${nonComboMin}문항은 non-조합형(single_selection, direct_statement, blank_workflow)으로 설계하라.`,
    `single_selection은 최소 ${singleMin}문항 포함하라.`,
    `direct_statement는 최소 ${directMin}문항 포함하라.`,
    workflowMin > 0 ? `blank_workflow는 최소 ${workflowMin}문항 포함하라.` : '',
    '시스템명(MES/SCM/CRM/JIT/POP), 공정/기법/분류 중 하나를 고르는 문제는 single_selection을 우선 사용하라.',
    '보고서/표/기사/점검표를 읽고 하나의 판단을 내리는 문제는 direct_statement를 우선 사용하라.',
    '발문에 <보기>가 없는 경우 combination_judgment를 사용하지 마라.',
  ].filter(Boolean).join('\n');
}

export function isSimilarText(text1: string, text2: string, threshold: number): boolean {
  if (!text1 || !text2) return false;
  const s1 = text1.replace(/\s+/g, '').toLowerCase();
  const s2 = text2.replace(/\s+/g, '').toLowerCase();
  if (s1 === s2) return true;

  const set1 = new Set(s1);
  const set2 = new Set(s2);
  const intersection = new Set([...set1].filter((x) => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  const similarity = intersection.size / union.size;
  return similarity >= threshold;
}

export function splitIntoKeywords(concepts: string[]): string[] {
  const tokens = new Set<string>();
  for (const c of concepts) {
    const parts = c.split(/\s+|\s*vs\s*|\//);
    for (const p of parts) {
      const trimmed = p.trim().replace(/[^가-힣a-zA-Z0-9]/g, '');
      if (trimmed.length >= 2) tokens.add(trimmed);
    }
  }
  return [...tokens];
}

export function extractJson(text: string): any {
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const raw = codeBlock ? codeBlock[1].trim() : text.trim();
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error(`JSON 파싱 실패. 응답 앞부분: ${raw.slice(0, 200)}`);
  }
}
