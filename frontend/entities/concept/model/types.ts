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
  examTips: string[];
  conceptContent: string;
  subtopics?: {
    name: string;
    evidence?: string;
    examRelevance?: string;
  }[];
  sampleQuestion: ExamQuestion & { correct_answer: number; questionSource?: string; questionNumber?: number; rawStimulus?: string };
  conceptHighlightV2?: ConceptHighlightV2 | null;
  /** v16+: 동일 개념에 연결된 실제 문제들. sampleQuestion은 하위 호환용. */
  relatedQuestions?: RelatedConceptQuestion[];
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
