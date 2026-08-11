import type { ExamQuestion } from '@shared/types/examQuestion';

export interface StudyReferenceEvidence {
  logicalSourceId: string;
  source: string;
  questionNumber: number | null;
}

export interface StudyExamPattern {
  id: string;
  title: string;
  summary: string;
  frequency: number;
  confidence: 'high' | 'related';
  questionFormats: string[];
  keyChecks: string[];
  commonTraps: string[];
  referenceQuestionIds: string[];
  evidence: StudyReferenceEvidence[];
}

export interface StudyInsights {
  version: 'v1' | 'v2';
  sourceQuestionCount: number;
  verifiedQuestionCount: number;
  patterns: StudyExamPattern[];
  mustKnowBlocks?: StudyMustKnowBlock[];
}

export interface StudyMustKnowBlock {
  id: string;
  conceptAliases: string[];
  title: string;
  type: 'comparison' | 'checklist' | 'classification' | 'process' | 'formula';
  summary?: string;
  headers?: string[];
  rows?: string[][];
  mustRemember: string[];
  commonTraps: string[];
  referenceQuestionIds: string[];
  confidence: 'high' | 'related';
  reviewStatus: 'verified' | 'textbook_only' | 'review';
  provenance?: 'deterministic' | 'ai';
  aiMetadata?: {
    model: string;
    promptVersion: string;
    inputFingerprint: string;
    generatedAt: string;
    validationVersion: string;
  };
}

export interface FrequencyConcept {
  subject: string;
  subjectSlug: string;
  unit: number;
  unitTitle: string;
  totalQuestionsAnalyzed: number;
  concepts: FrequencyConceptItem[];
  studyInsights?: StudyInsights;
}

export interface ConceptHighlightV2 {
  stimulusClues: { quote: string; why: string }[];
  optionAnalysis: OptionAnalysisItem[];
  solvingFlow: { step: number; action: string }[];
  takeaway: string;
}

/** 합답형(보기 ㄱㄴㄷ)은 optionKey, 일반형(①~⑤)은 optionNum 사용 */
export type OptionAnalysisItem =
  | { optionNum: number; verdict: string; reasoning: string }
  | { optionKey: string; verdict: string; reasoning: string };

export interface ConceptDefinitionSection {
  title: string;
  description: string;
  examples?: string[];
}

export interface ConceptDefinition {
  summary: string;
  sections: ConceptDefinitionSection[];
  comparison?: { headers: string[]; rows: string[][] };
  commonConfusions: string[];
}

export interface RelatedConceptQuestion {
  id?: string;
  questionSource?: string;
  questionNumber?: number | null;
  correct_answer: number;
  question: ExamQuestion;
  rawStimulus?: string;
  conceptHighlightV2?: ConceptHighlightV2 | null;
}

export interface FrequencyConceptItem {
  rank: number;
  name: string;
  frequency: number;
  sources: string[];
  questionFormats: string[];
  description: string;
  conceptDefinition?: ConceptDefinition | null;
  keyPoints: string[];
  importantNumbers?: string[];
  comparisonTable?: string;
  examTips: string[];
  conceptContent: string;
  subtopics?: {
    name: string;
    evidence?: string;
    examRelevance?: string;
  }[];
  sourceTag?: string;
  contentStatus?: 'complete' | 'needs_review' | 'missing';
  sampleQuestion: ExamQuestion & { correct_answer: number; questionSource?: string; questionNumber?: number; rawStimulus?: string };
  conceptHighlightV2?: ConceptHighlightV2 | null;
  /** v16+: 동일 개념에 연결된 실제 문제들. sampleQuestion은 하위 호환용. */
  relatedQuestions?: RelatedConceptQuestion[];
  examMustKnow?: StudyMustKnowBlock;
}

export interface ConceptExplanation {
  found: boolean;
  title: string;
  description: string;
  bulletPoints: string[];
  trapPoints: string[];
  logicFlow: string;
}

export interface ConceptBookmark {
  id: string;
  subjectSlug: string;
  unitNumber: number;
  conceptName: string;
  description: string | null;
  createdAt: string;
}

export interface StructuredSubsection {
  title: string;
  explanation: string;
  keyPoints: string[];
  table: string;
  visualGuide: string;
  supplementNote: string;
  examPoints: string[];
  pitfalls: string[];
}

export interface StructuredSection {
  title: string;
  summary: string;
  subsections: StructuredSubsection[];
}

export interface StructuredConcept {
  subject: string;
  unit: string;
  unitTitle: string;
  learningObjectives: string[];
  sections: StructuredSection[];
  closingSummary: string[];
}

export interface SummationCardContent {
  title: string;
  description: string;
  bullet_points: string[];
  trap_points: string[];
  integrated_data?: {
    table?: string;
    logic_flow?: string;
    visual_analysis?: string;
  };
  tags: string[];
}

export interface SummationCard {
  content: SummationCardContent;
}

export interface SummationData {
  subject: string;
  totalCards: number;
  cards: SummationCard[];
}

export interface SummationV2KeyConcept {
  name: string;
  definition: string;
  key_points: string[];
  caution: string;
}

export interface SummationV2CardContent {
  title: string;
  body: string;
  key_concepts: SummationV2KeyConcept[];
  exam_tips: string[];
  trap_points: string[];
}

export interface SummationV2Card {
  content: SummationV2CardContent;
}

export interface SummationV2Data {
  unit: number;
  unitTitle: string;
  cards: SummationV2Card[];
}
