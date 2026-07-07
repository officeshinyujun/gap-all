import type { ComboBlock, ExamQuestion } from '@/types/examQuestion';

export interface ApiQuestionLike {
  id?: string;
  targetConcept?: string;
  itemType?: string;
  difficulty?: string;
  recommendedTemplate?: string;
  questionStem?: string;
  stimulusData?: unknown;
  optionsList?: string[];
  explanation?: unknown;
  correctAnswer?: number;
  comboBlock?: ComboBlock | null;
  subject?: { slug?: string; title?: string };
  unit?: { unitNumber?: number; title?: string };
}

export interface ApiExamItemLike {
  question: ApiQuestionLike;
}

export function toExamQuestionFromApiQuestion(
  raw: ApiQuestionLike,
  options: { unitName?: string } = {},
): ExamQuestion {
  return {
    metadata: {
      unit_name: options.unitName ?? raw.unit?.title ?? '',
      target_concept: raw.targetConcept ?? '',
      item_type: raw.itemType ?? '',
      difficulty: raw.difficulty ?? '',
      recommended_template: raw.recommendedTemplate ?? '',
    },
    render_ready: {
      question_stem: raw.questionStem ?? '',
      stimulus_data: raw.stimulusData ?? {},
      options_list: raw.optionsList ?? [],
      explanation: raw.explanation as any,
    },
    explanation: raw.explanation as any,
    correct_answer: raw.correctAnswer,
    combo_block: raw.comboBlock ?? null,
  };
}

export function toExamQuestionFromApiItem(
  item: ApiExamItemLike,
  options: { unitName?: string } = {},
): ExamQuestion {
  return toExamQuestionFromApiQuestion(item.question, options);
}
