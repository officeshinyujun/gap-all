import { repairReferenceVariantOutput } from './reference-variant-repair';

describe('repairReferenceVariantOutput', () => {
  it('canonicalizes an empty combo block only when no source view items exist', () => {
    const repaired = repairReferenceVariantOutput(
      { comboBlock: { title: '<보기>', items: [] } },
      0,
    );

    expect(repaired).toEqual({
      value: { comboBlock: null },
      reasons: ['EMPTY_COMBO_BLOCK'],
    });
  });

  it('does not invent missing semantic data', () => {
    const raw = {
      templateType: 'TPL_COMPARATIVE_MATRIX',
      choices: ['① ㄱ'],
      comboBlock: null,
    };

    expect(repairReferenceVariantOutput(raw, 0)).toEqual({
      value: raw,
      reasons: [],
    });
  });

  it('converts the legacy persisted envelope without changing its content', () => {
    const repaired = repairReferenceVariantOutput(
      {
        metadata: { recommended_template: 'TPL_COMPARATIVE_MATRIX' },
        render_ready: {
          question_stem: '질문',
          stimulus_data: { headers: [], rows: [], selection_chips: [] },
          combo_block: null,
          options_list: ['① ㄱ'],
        },
        correct_answer: 1,
        explanation: { judgment: '해설' },
      },
      0,
    );

    expect(repaired.reasons).toEqual(['LEGACY_ENVELOPE']);
    expect(repaired.value).toMatchObject({
      templateType: 'TPL_COMPARATIVE_MATRIX',
      questionStem: '질문',
      choices: ['① ㄱ'],
      correctAnswer: 1,
    });
  });
});
