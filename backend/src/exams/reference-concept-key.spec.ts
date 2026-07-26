import {
  selectReferences,
  type ReferenceSelectorRequest,
} from './reference-selector.service';

function requestWithEquivalentSourceTarget(): ReferenceSelectorRequest {
  return {
    subject: 'success',
    unitRange: { start: 1, end: 1 },
    requestedConcepts: [' cafe\u0301 rule '],
    requestedDistractorAxes: [],
    requestedReferenceCount: 1,
    seed: 'concept-key-selection',
    unitConcepts: [{ unitName: '1단원', concepts: ['Café Rule'] }],
    parsedReferences: [
      {
        source: { filename: 'cafe-rule.pdf', unitNumber: 1 },
        questionNumber: 1,
        stem: 'Which statement is correct?',
        stimulus: 'A rule applies to this situation.',
        choices: ['one', 'two', 'three', 'four', 'five'],
        targetConcepts: ['  CAFE\u0301\t rule  '],
      },
    ],
  };
}

describe('reference concept key selection', () => {
  it('Given Unicode and whitespace-equivalent textbook and source labels, When selecting, Then preserves the textbook display label', () => {
    const result = selectReferences(requestWithEquivalentSourceTarget());

    expect(result).toEqual({
      kind: 'selected',
      concepts: [{ concept: 'Café Rule', unitNumbers: [1] }],
      distractorAxisCatalog: expect.any(Array),
      distractorAxes: [],
      references: expect.any(Array),
      sourceRejectedCount: 0,
    });
  });
});
