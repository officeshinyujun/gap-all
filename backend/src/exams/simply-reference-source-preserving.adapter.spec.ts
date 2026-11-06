import type { NormalizedSourceReference } from './reference-selector.types';
import { sourcePreservingRender } from './simply-reference-source-preserving.adapter';
import { parseReference } from './reference-selector.utils';
import {
  SOURCE_BLOCKS_TPL,
  buildSourceBlocksStimulus,
} from './source-blocks-stimulus';
import {
  V3_DIALOGUE_CHOICE_TABLE_PAYLOAD,
  v2StylePayload,
  v3Payload,
} from './source-blocks-stimulus.fixtures';

function reference(
  template: string,
  stimulus: string,
): NormalizedSourceReference {
  return {
    source: { sourceId: 'success:1:source.pdf:1', sourceHash: 'hash-1' },
    unitNumber: 1,
    questionNumber: 1,
    stem: '원문 발문',
    stimulus,
    viewItems: [],
    choices: ['① 하나', '② 둘', '③ 셋', '④ 넷', '⑤ 다섯'],
    correctAnswer: 1,
    targetConcepts: ['개념'],
    target: { primaryConcept: '개념', concepts: ['개념'] },
    archetype: { sourceTemplate: template },
  } as unknown as NormalizedSourceReference;
}

describe('sourcePreservingRender', () => {
  it('keeps the selected template equal to the source archetype and excludes unsupported visuals', () => {
    expect(
      sourcePreservingRender(reference('TPL_ARTICLE', '원문 본문')),
    ).toMatchObject({ template: 'TPL_ARTICLE' });
    expect(
      sourcePreservingRender(reference('TPL_QUANTITATIVE_CHART', '이미지 자료')),
    ).toMatchObject({
      template: 'TPL_ARTICLE',
      stimulusData: { body_paragraphs: ['이미지 자료'] },
    });
  });

  it('preserves Article physical lines, including blanks and indentation', () => {
    expect(
      sourcePreservingRender(
        reference('TPL_ARTICLE', '첫 문단\n\n  들여쓴 문단'),
      ),
    ).toMatchObject({
      stimulusData: {
        body_paragraphs: ['첫 문단', '', '  들여쓴 문단'],
      },
    });
  });

  it('preserves Formal Document physical lines, including blanks and indentation', () => {
    expect(
      sourcePreservingRender(
        reference('TPL_FORMAL_DOCUMENT', '첫 조항\n\n  둘째 조항'),
      ),
    ).toMatchObject({
      stimulusData: {
        paragraphs: [
          { sub_title: '', content: '첫 조항' },
          { sub_title: '', content: '' },
          { sub_title: '', content: '  둘째 조항' },
        ],
      },
    });
  });

  it('preserves matrix cell whitespace but rejects prose mixed with a table', () => {
    expect(
      sourcePreservingRender(
        reference('TPL_COMPARATIVE_MATRIX', '구분 | A\n특징 |  원문 값'),
      ),
    ).toMatchObject({
      stimulusData: {
        headers: [
          { id: 'column-1', label: '구분 ' },
          { id: 'column-2', label: ' A' },
        ],
        rows: [{ id: 'row-1', cells: ['특징 ', '  원문 값'] }],
      },
    });
    expect(
      sourcePreservingRender(
        reference('TPL_COMPARATIVE_MATRIX', '설명 문장\n구분 | A\n특징 | 값'),
      ),
    ).toMatchObject({
      stimulusData: {
        headers: [
          { id: 'column-1', label: '구분 ' },
          { id: 'column-2', label: ' A' },
        ],
        rows: [{ id: 'row-1', cells: ['특징 ', ' 값'] }],
      },
    });
  });

  it('preserves workflow markers, continuations, and blank lines', () => {
    expect(
      sourcePreservingRender(
        reference('TPL_SEQUENTIAL_WORKFLOW', '1. 조사\n  세부 확인\n\n2. 실행'),
      ),
    ).toMatchObject({
      stimulusData: {
        steps: [
          { idx: 1, label: '1.', desc: '조사\n  세부 확인\n' },
          { idx: 2, label: '2.', desc: '실행' },
        ],
      },
    });
    expect(
      sourcePreservingRender(
        reference('TPL_SEQUENTIAL_WORKFLOW', '도입\n1. 조사\n2. 실행'),
      ),
    ).toMatchObject({
      template: 'TPL_ARTICLE',
      stimulusData: { body_paragraphs: ['도입', '1. 조사', '2. 실행'] },
    });
    expect(
      sourcePreservingRender(
        reference('TPL_SEQUENTIAL_WORKFLOW', '• 준비\n• 실행'),
      ),
    ).toMatchObject({
      stimulusData: { steps: [{ label: '•' }, { label: '•' }] },
    });
    expect(
      sourcePreservingRender(
        reference('TPL_SEQUENTIAL_WORKFLOW', '2025-01-01: 준비\n2025-01-02: 실행'),
      ),
    ).toMatchObject({
      stimulusData: {
        steps: [{ label: '2025-01-01' }, { label: '2025-01-02' }],
      },
    });
  });

  it('preserves conversational continuation lines and rejects prose before dialogue', () => {
    expect(
      sourcePreservingRender(
        reference('TPL_CONVERSATIONAL_FLOW', '교사: 확인합니다.\n  보충 설명\n\n학생: 네.'),
      ),
    ).toMatchObject({
      stimulusData: {
        messages: [
          { text: ' 확인합니다.\n  보충 설명\n' },
          { text: ' 네.' },
        ],
      },
    });
    expect(
      sourcePreservingRender(
        reference('TPL_CONVERSATIONAL_FLOW', '상황 설명\n교사: 확인합니다.\n학생: 네.'),
      ),
    ).toMatchObject({
      template: 'TPL_ARTICLE',
      stimulusData: {
        body_paragraphs: ['상황 설명', '교사: 확인합니다.', '학생: 네.'],
      },
    });
  });
});

describe('sourcePreservingRender with reference-pdf-v3 source blocks', () => {
  function parsed(payload: unknown): NormalizedSourceReference {
    const result = parseReference(payload, 'kongil');
    if (!result.ok) throw new Error('fixture must parse');
    return result.value;
  }

  it('renders v3 payloads as TPL_SOURCE_BLOCKS', () => {
    for (const payload of [
      v3Payload(),
      v3Payload(V3_DIALOGUE_CHOICE_TABLE_PAYLOAD),
    ]) {
      const reference = parsed(payload);
      expect(reference.sourceBlocksStimulus).toEqual(
        buildSourceBlocksStimulus(payload),
      );
      expect(sourcePreservingRender(reference)).toEqual({
        template: SOURCE_BLOCKS_TPL,
        stimulusData: buildSourceBlocksStimulus(payload),
      });
    }
  });

  it('prefers source blocks over cached tplStimulusData', () => {
    const payload = v3Payload();
    payload.tplStimulusData = {
      headers: [{ id: 'c1', label: '관련 공업' }],
      rows: [{ id: 'r1', cells: ['(가)'] }],
      selection_chips: [],
    };
    expect(sourcePreservingRender(parsed(payload))?.template).toBe(
      SOURCE_BLOCKS_TPL,
    );
  });

  it('leaves the same question without stimulusBlocks (v2 shape) unchanged', () => {
    for (const fixture of [undefined, V3_DIALOGUE_CHOICE_TABLE_PAYLOAD] as const) {
      const v2 = parsed(v2StylePayload(fixture));
      expect('sourceBlocksStimulus' in v2).toBe(false);
      const render = sourcePreservingRender(v2);
      expect(render).not.toBeNull();
      expect(render?.template).not.toBe(SOURCE_BLOCKS_TPL);
      // v3 행에서 블록만 뗀 결과와 v2 모양의 결과가 같아야 한다.
      const { sourceBlocksStimulus: _ignored, ...withoutBlocks } = parsed(
        fixture === undefined ? v3Payload() : v3Payload(fixture),
      );
      expect(sourcePreservingRender(withoutBlocks as NormalizedSourceReference)).toEqual(
        render,
      );
    }
  });
});
