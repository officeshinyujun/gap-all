import { classifyReferenceArchetype } from './reference-archetype';
import {
  allowedTemplatesForArchetype,
  selectReferenceTpl,
} from './reference-tpl-selector';

const canonicalTemplates = [
  ['comparison', 'TPL_COMPARATIVE_MATRIX'],
  ['condition_flow', 'TPL_SEQUENTIAL_WORKFLOW'],
  ['role_dialogue', 'TPL_CONVERSATIONAL_FLOW'],
  ['case_profile', 'TPL_CASE_DIAGNOSTIC_FRAME'],
  ['document_rules', 'TPL_FORMAL_DOCUMENT'],
  ['quantitative_change', 'TPL_QUANTITATIVE_CHART'],
  ['forum_qa', 'TPL_DIGITAL_FORUM_INTERFACE'],
  ['instruction_scene', 'TPL_INSTRUCTIONAL_SCENE'],
  ['public_notice', 'TPL_PROMOTIONAL_CANVAS'],
] as const;

function payload(requiredInformationShape: string): Record<string, unknown> {
  return {
    source: { sourceId: 'source-1', sourceHash: 'hash-1' },
    subject: 'success',
    unitRange: { start: 1, end: 1 },
    eligibleUnits: [1],
    targetConceptIds: ['concept_career_values'],
    supportingConceptIds: [],
    distractorAxes: ['scope_reversal'],
    answerPlan: {
      responseMode: 'single_selection',
      choiceEncoding: 'single_choice',
      expectedAnswerCount: 5,
      options: [
        { id: 'option_1', verdict: true, atomIds: ['atom_1'] },
        { id: 'option_2', verdict: false, atomIds: ['atom_2'] },
        { id: 'option_3', verdict: false, atomIds: ['atom_3'] },
        { id: 'option_4', verdict: false, atomIds: ['atom_4'] },
        { id: 'option_5', verdict: false, atomIds: ['atom_5'] },
      ],
    },
    requiredInformationShape,
    noveltyRules: ['Use a new organization.'],
  };
}

function renderableData(template: string): Record<string, unknown> {
  switch (template) {
    case 'TPL_COMPARATIVE_MATRIX':
      return {
        headers: [{ id: 'policy', label: 'Policy' }],
        rows: [{ id: 'company-a', cells: ['Flexible hours'] }],
        selection_chips: [],
      };
    case 'TPL_SEQUENTIAL_WORKFLOW':
      return {
        orientation: 'vertical',
        steps: [
          {
            idx: 1,
            label: 'Apply',
            desc: 'Submit the form.',
            is_missing: false,
          },
        ],
      };
    case 'TPL_CONVERSATIONAL_FLOW':
      return {
        participants: [{ id: 'advisor', name: 'Advisor', role: 'Counselor' }],
        messages: [
          { p_id: 'advisor', text: 'Review the condition.', timestamp: '' },
        ],
      };
    case 'TPL_CASE_DIAGNOSTIC_FRAME':
      return {
        case_profile: { name: 'Company A', context: 'Hiring policy' },
        narrative: 'Company A publishes its hiring policy.',
        check_items: [],
      };
    case 'TPL_FORMAL_DOCUMENT':
      return {
        doc_type: 'Notice',
        header_info: {
          title: 'Application Notice',
          date: '2026-07-20',
          author: 'Human Resources',
        },
        paragraphs: [
          { sub_title: 'Eligibility', content: 'Applicants meet a condition.' },
        ],
        footnotes: [],
      };
    case 'TPL_QUANTITATIVE_CHART':
      return {
        chart_type: 'bar',
        axes: [{ key: 'hours', label: 'Hours', max: 40 }],
        datasets: [{ label: 'Company A', values: [35] }],
      };
    case 'TPL_DIGITAL_FORUM_INTERFACE':
      return {
        forum_name: 'Career Forum',
        main_post: {
          author: 'Student',
          title: 'Question',
          content: 'Which condition applies?',
        },
        comments: [],
      };
    case 'TPL_INSTRUCTIONAL_SCENE':
      return {
        instructor: { id: 'teacher', text: 'Review the rule.' },
        canvas_content: { type: 'text', data: 'The required condition.' },
        students: [],
      };
    case 'TPL_PROMOTIONAL_CANVAS':
      return {
        slogan: 'Work Safely',
        bullets: ['Wear protective equipment.'],
        visual_elements: [],
        missing_part: '',
      };
    default:
      throw new TypeError(`Unsupported fixture template: ${template}`);
  }
}

function archetypeFor(
  stimulus: string,
  viewItems: readonly string[],
  choices: readonly string[],
) {
  const result = classifyReferenceArchetype({
    stem: '다음 자료에 대한 설명으로 옳은 것은?',
    stimulus,
    viewItems,
    choices,
  });
  if (result.kind !== 'classified') {
    throw new TypeError(
      `Fixture archetype classification failed: ${result.reason}`,
    );
  }
  return result.value;
}

const combinationChoices = [
  '① ㄱ',
  '② ㄴ',
  '③ ㄱ, ㄴ',
  '④ ㄴ, ㄷ',
  '⑤ ㄱ, ㄴ, ㄷ',
] as const;

const singleChoices = [
  '① First',
  '② Second',
  '③ Third',
  '④ Fourth',
  '⑤ Fifth',
] as const;

function combinationPayload(
  requiredInformationShape: string,
): Record<string, unknown> {
  const result = payload(requiredInformationShape);
  result.answerPlan = {
    responseMode: 'truth_combination',
    choiceEncoding: 'truth_combination',
    expectedAnswerCount: 3,
    options: [
      { id: 'option_1', verdict: true, atomIds: ['atom_1'] },
      { id: 'option_2', verdict: false, atomIds: ['atom_2'] },
      { id: 'option_3', verdict: true, atomIds: ['atom_3'] },
    ],
  };
  return result;
}

describe('selectReferenceTpl', () => {
  it.each(canonicalTemplates)(
    'Given %s payload data, When selecting %s, Then returns the canonical template',
    (shape, template) => {
      expect(
        selectReferenceTpl(payload(shape), template, renderableData(template)),
      ).toEqual({
        kind: 'selected',
        template,
      });
    },
  );

  it('Given an unknown information shape, When selecting, Then rejects the payload', () => {
    expect(
      selectReferenceTpl(
        payload('unknown_shape'),
        'TPL_COMPARATIVE_MATRIX',
        renderableData('TPL_COMPARATIVE_MATRIX'),
      ),
    ).toEqual({ kind: 'rejected', reason: 'INVALID_CONCEPT_PAYLOAD' });
  });

  it('Given a canonical payload with a mismatched structured template, When selecting, Then rejects the mismatch', () => {
    expect(
      selectReferenceTpl(
        payload('comparison'),
        'TPL_QUANTITATIVE_CHART',
        renderableData('TPL_QUANTITATIVE_CHART'),
      ),
    ).toEqual({ kind: 'rejected', reason: 'TEMPLATE_MISMATCH' });
  });

  it.each(['TPL_PLAIN_TEXT', 'TPL_LEGACY_DOCUMENT'])(
    'Given noncanonical template %s, When selecting, Then rejects it without fallback',
    (template) => {
      expect(
        selectReferenceTpl(
          payload('comparison'),
          template,
          renderableData('TPL_COMPARATIVE_MATRIX'),
        ),
      ).toEqual({ kind: 'rejected', reason: 'UNSUPPORTED_TEMPLATE' });
    },
  );

  it('Given a formal document with empty metadata, When selecting, Then rejects non-renderable data', () => {
    const data = renderableData('TPL_FORMAL_DOCUMENT');
    data.header_info = { title: '', date: '', author: '' };

    expect(
      selectReferenceTpl(
        payload('document_rules'),
        'TPL_FORMAL_DOCUMENT',
        data,
      ),
    ).toEqual({
      kind: 'rejected',
      reason: 'INVALID_TEMPLATE_DATA',
    });
  });

  it.each([
    [
      'comparison',
      'TPL_COMPARATIVE_MATRIX',
      { headers: [], rows: [], selection_chips: [] },
    ],
    [
      'condition_flow',
      'TPL_SEQUENTIAL_WORKFLOW',
      { orientation: 'diagonal', steps: [] },
    ],
  ])(
    'Given non-renderable %s data, When selecting %s, Then rejects it',
    (shape, template, data) => {
      expect(selectReferenceTpl(payload(shape), template, data)).toEqual({
        kind: 'rejected',
        reason: 'INVALID_TEMPLATE_DATA',
      });
    },
  );

  it.each([
    [
      'table',
      archetypeFor(
        '| A | B |',
        ['ㄱ. A', 'ㄴ. B', 'ㄷ. C'],
        combinationChoices,
      ),
      combinationPayload('comparison'),
    ],
    [
      'case',
      archetypeFor('A씨는 조건을 검토한다.', [], singleChoices),
      payload('case_profile'),
    ],
    [
      'timeline',
      archetypeFor('1월 2일: 신청\n4월 15일: 처리', [], singleChoices),
      payload('condition_flow'),
    ],
  ] as const)(
    'Given a %s archetype, When selecting a conversational TPL, Then rejects the archetype drift',
    (_name, archetype, candidatePayload) => {
      expect(
        selectReferenceTpl(
          candidatePayload,
          'TPL_CONVERSATIONAL_FLOW',
          renderableData('TPL_CONVERSATIONAL_FLOW'),
          archetype,
        ),
      ).toEqual({ kind: 'rejected', reason: 'TPL_SELECTION_REJECTED' });
    },
  );

  it('Given combination mechanics, When selecting a prose-only TPL, Then rejects the candidate intersection', () => {
    const archetype = archetypeFor(
      '| A | B |',
      ['ㄱ. A', 'ㄴ. B', 'ㄷ. C'],
      combinationChoices,
    );
    const combinationPayload = payload('comparison');
    combinationPayload.answerPlan = {
      responseMode: 'truth_combination',
      choiceEncoding: 'truth_combination',
      expectedAnswerCount: 3,
      options: [
        { id: 'option_1', verdict: true, atomIds: ['atom_1'] },
        { id: 'option_2', verdict: false, atomIds: ['atom_2'] },
        { id: 'option_3', verdict: true, atomIds: ['atom_3'] },
      ],
    };

    expect(
      selectReferenceTpl(
        combinationPayload,
        'TPL_CASE_DIAGNOSTIC_FRAME',
        renderableData('TPL_CASE_DIAGNOSTIC_FRAME'),
        archetype,
      ),
    ).toEqual({ kind: 'rejected', reason: 'TPL_SELECTION_REJECTED' });
  });

  it('Given a shared document archetype, When selecting a standalone case TPL, Then rejects the set-incompatible candidate', () => {
    const archetype = archetypeFor('[문서] 조항 발췌', [], singleChoices);

    expect(allowedTemplatesForArchetype(archetype)).toEqual([
      'TPL_FORMAL_DOCUMENT',
      'TPL_ANNOUNCEMENT',
      'TPL_REPORT',
    ]);
    expect(
      selectReferenceTpl(
        payload('document_rules'),
        'TPL_CASE_DIAGNOSTIC_FRAME',
        renderableData('TPL_CASE_DIAGNOSTIC_FRAME'),
        archetype,
      ),
    ).toEqual({ kind: 'rejected', reason: 'TPL_SELECTION_REJECTED' });
  });

  it('Given no compatible ordinary candidate, When selecting, Then returns stable TPL selection rejection without fallback', () => {
    const archetype = archetypeFor(
      '| A | B |',
      ['ㄱ. A', 'ㄴ. B', 'ㄷ. C'],
      combinationChoices,
    );

    expect(
      selectReferenceTpl(
        combinationPayload('comparison'),
        'TPL_CONVERSATIONAL_FLOW',
        renderableData('TPL_CONVERSATIONAL_FLOW'),
        archetype,
      ),
    ).toEqual({ kind: 'rejected', reason: 'TPL_SELECTION_REJECTED' });
  });
});
