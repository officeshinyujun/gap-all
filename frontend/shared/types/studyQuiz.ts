export interface BlankQuestion {
  id: number;
  sentence_template: string;
  correct_answer: string;
  options: string[];
  explanation: string;
}

export interface ConceptPair {
  id: number;
  concept: string;
  definition: string;
  hidden_field: 'concept' | 'definition';
  correct_value: string;
  explanation: string;
}

export type QuizCount = 10 | 20;
