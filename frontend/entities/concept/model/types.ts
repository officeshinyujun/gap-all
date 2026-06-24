import type { ExamQuestion } from '@shared/types/examQuestion';

export interface FrequencyConcept {
  subject: string;
  subjectSlug: string;
  unit: number;
  unitTitle: string;
  totalQuestionsAnalyzed: number;
  concepts: FrequencyConceptItem[];
}

export interface ConceptHighlightV2 {
  stimulusClues: { quote: string; why: string }[];
  optionAnalysis: { optionNum: number; verdict: string; reasoning: string }[];
  solvingFlow: { step: number; action: string }[];
  takeaway: string;
}

export interface FrequencyConceptItem {
  rank: number;
  name: string;
  frequency: number;
  sources: string[];
  questionFormats: string[];
  description: string;
  keyPoints: string[];
  examTips: string[];
  conceptContent: string;
  sampleQuestion: ExamQuestion & { correct_answer: number; questionSource?: string; questionNumber?: number; rawStimulus?: string };
  conceptHighlightV2?: ConceptHighlightV2 | null;
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
