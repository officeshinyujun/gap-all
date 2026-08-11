import type { AiQuestionFamily } from '../exams/ai-blueprint.types';
import { buildStudyMustKnowBlocks } from './study-must-know';

export const STUDY_INSIGHTS_VERSION = 'v2' as const;

export type StudyNoteCandidate = Readonly<{
  subjectSlug: 'success' | 'industry';
  unitNumber: number;
  title: string;
  aliases: readonly string[];
  comparisonAxes: readonly string[];
  formatCandidates: readonly string[];
  trapCandidates: readonly string[];
}>;

export type StudyReferenceEvidence = Readonly<{
  logicalSourceId: string;
  source: string;
  questionNumber: number | null;
}>;

export type StudyExamPattern = Readonly<{
  id: string;
  title: string;
  summary: string;
  frequency: number;
  confidence: 'high' | 'related';
  questionFormats: readonly string[];
  keyChecks: readonly string[];
  commonTraps: readonly string[];
  referenceQuestionIds: readonly string[];
  evidence: readonly StudyReferenceEvidence[];
}>;

export type StudyInsights = Readonly<{
  version: 'v1' | typeof STUDY_INSIGHTS_VERSION;
  sourceQuestionCount: number;
  verifiedQuestionCount: number;
  patterns: readonly StudyExamPattern[];
  mustKnowBlocks?: readonly StudyMustKnowBlock[];
}>;

export type StudyMustKnowBlock = Readonly<{
  id: string;
  conceptAliases: readonly string[];
  title: string;
  type: 'comparison' | 'checklist' | 'classification' | 'process' | 'formula';
  summary?: string;
  headers?: readonly string[];
  rows?: readonly (readonly string[])[];
  mustRemember: readonly string[];
  commonTraps: readonly string[];
  referenceQuestionIds: readonly string[];
  confidence: 'high' | 'related';
  reviewStatus: 'verified' | 'textbook_only' | 'review';
  provenance?: 'deterministic' | 'ai';
  aiMetadata?: Readonly<{
    model: string;
    promptVersion: string;
    inputFingerprint: string;
    generatedAt: string;
    validationVersion: string;
  }>;
}>;

export type StudyInsightObservation = Readonly<{
  logicalSourceId: string;
  unitNumber: number;
  concepts: readonly string[];
  family: AiQuestionFamily;
  certified: boolean;
  supported: boolean;
  source: string;
  questionNumber: number | null;
  archetypePattern?: Readonly<{
    stemIntent: string;
    responseMode: string;
    materialKind: string;
    reasoningPattern: string;
  }>;
}>;

const FAMILY_LABELS: Readonly<Record<AiQuestionFamily, string>> = {
  concept: '개념 확인',
  case: '사례 판단',
  calculation: '계산·자료 분석',
};

export function buildStudyInsights(
  subjectSlug: 'success' | 'industry',
  unitNumber: number,
  observations: readonly StudyInsightObservation[],
  candidates: readonly StudyNoteCandidate[],
): StudyInsights {
  const unitObservations = observations.filter(
    (observation) => observation.unitNumber === unitNumber,
  );
  const unitCandidates = candidates.filter(
    (candidate) =>
      candidate.subjectSlug === subjectSlug &&
      candidate.unitNumber === unitNumber,
  );
  const groups = new Map<string, {
    title: string;
    candidate?: StudyNoteCandidate;
    observations: StudyInsightObservation[];
  }>();

  for (const observation of unitObservations) {
    const candidate = unitCandidates.find((item) =>
      observation.concepts.some((concept) =>
        item.aliases.some((alias) => concept.includes(alias) || alias.includes(concept)),
      ),
    );
    const fallbackTitle = observation.concepts[0] ?? '단원 출제 문제';
    const title = candidate?.title ?? fallbackTitle;
    const key = candidate ? `candidate:${candidate.title}` : `concept:${title}`;
    const current = groups.get(key);
    if (current) current.observations.push(observation);
    else groups.set(key, { title, candidate, observations: [observation] });
  }

  const patterns = [...groups.values()]
    .map(({ title, candidate, observations: items }) => {
      const verified = items.filter((item) => item.certified && item.supported);
      const sourceItems = items.filter(
        (item) => item.logicalSourceId !== '' && item.concepts.length > 0,
      );
      const questionFormats = unique([
        ...(candidate?.formatCandidates ?? []),
        ...items.map((item) => FAMILY_LABELS[item.family]),
      ]);
      const referenceQuestionIds = unique(
        sourceItems.map((item) => item.logicalSourceId),
      );
      const evidence = sourceItems.map((item) => ({
        logicalSourceId: item.logicalSourceId,
        source: item.source,
        questionNumber: item.questionNumber,
      }));
      return {
        id: `study-pattern-${slug(title)}`,
        title,
        summary: `${title} 관련 실제 출제 문제를 기준으로 학습합니다.`,
        frequency: referenceQuestionIds.length,
        confidence: verified.length >= 2 ? ('high' as const) : ('related' as const),
        questionFormats,
        keyChecks: candidate?.comparisonAxes ?? [],
        commonTraps: candidate?.trapCandidates ?? [],
        referenceQuestionIds,
        evidence,
      };
    })
    .filter((pattern) => pattern.referenceQuestionIds.length > 0)
    .sort((left, right) =>
      right.frequency - left.frequency || left.title.localeCompare(right.title, 'ko'),
    );

  return {
    version: STUDY_INSIGHTS_VERSION,
    sourceQuestionCount: unitObservations.length,
    verifiedQuestionCount: unitObservations.filter(
      (item) => item.certified && item.supported,
    ).length,
    patterns,
    mustKnowBlocks: buildStudyMustKnowBlocks(subjectSlug, unitNumber, patterns),
  };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '') || 'unknown';
}
