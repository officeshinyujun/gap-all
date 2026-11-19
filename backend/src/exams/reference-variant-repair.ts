import { isRecord } from './reference-frame.validation-utils';

export const REFERENCE_VARIANT_REPAIR_REASONS = [
  'LEGACY_ENVELOPE',
  'EMPTY_COMBO_BLOCK',
] as const;

export type ReferenceVariantRepairReason =
  (typeof REFERENCE_VARIANT_REPAIR_REASONS)[number];

export type ReferenceVariantRepairResult = Readonly<{
  value: unknown;
  reasons: readonly ReferenceVariantRepairReason[];
}>;

function normalizeLegacyEnvelope(raw: unknown): ReferenceVariantRepairResult {
  if (!isRecord(raw) || isRecord(raw.render_ready) === false) {
    return { value: raw, reasons: [] };
  }

  const metadata = raw.metadata;
  const renderReady = raw.render_ready;
  if (!isRecord(metadata)) return { value: raw, reasons: [] };

  return {
    value: {
      templateType: metadata.recommended_template,
      questionStem: renderReady.question_stem,
      stimulusData: renderReady.stimulus_data,
      comboBlock: renderReady.combo_block,
      choices: renderReady.options_list,
      fidelityTrace: raw.fidelity_trace,
      sourceEvidence: raw.source_evidence,
      correctAnswer: raw.correct_answer,
      explanation: raw.explanation,
    },
    reasons: ['LEGACY_ENVELOPE'],
  };
}

export function repairReferenceVariantOutput(
  raw: unknown,
  viewItemCount: number,
): ReferenceVariantRepairResult {
  const normalized = normalizeLegacyEnvelope(raw);
  const value = normalized.value;
  if (
    viewItemCount === 0 &&
    isRecord(value) &&
    isRecord(value.comboBlock) &&
    Array.isArray(value.comboBlock.items) &&
    value.comboBlock.items.length === 0
  ) {
    return {
      value: { ...value, comboBlock: null },
      reasons: [...normalized.reasons, 'EMPTY_COMBO_BLOCK'],
    };
  }
  return normalized;
}
