import {
  SOURCE_BLOCKS_TPL,
  buildSourceBlocksStimulus,
  isSourceBlocksStimulusData,
  sanitizeSourceBlocksStimulus,
} from './source-blocks-stimulus';
import {
  V3_DIALOGUE_CHOICE_TABLE_PAYLOAD,
  v2StylePayload,
  v3Payload,
} from './source-blocks-stimulus.fixtures';
import {
  validateSimplyReferenceRenderTpl,
  validateSimplyReferenceStructuredTpl,
} from './simply-reference-generation-contract';
import { STRUCTURED_TPL_NAMES } from './tpl-schemas';

describe('buildSourceBlocksStimulus', () => {
  it('maps a v3 payload to the contract shape, keeping strings verbatim', () => {
    expect(buildSourceBlocksStimulus(v3Payload())).toEqual({
      blocks: [
        {
          type: 'text',
          text: '수행 평가 보고서\n◆ 주제: 풍력 발전기 제작과 관련된 우리나라 공업에 대해 조사하기',
        },
        { type: 'figure', figure_id: 'F1' },
        {
          type: 'table',
          title: null,
          headers: [['관련 공업', '제품 생산 과정']],
          rows: [
            ['(가)', '[그림 F2]'],
            ['(나)', '[그림 F3]'],
          ],
          caption: null,
        },
      ],
      figures: {
        F1: {
          src: 'https://example.supabase.co/storage/v1/object/public/reference-figures/v3/moi_kongil_2023_6/q3-F1.png',
          alt: '산을 배경으로 들판에 서 있는 풍력 발전기(3날개 풍차) 그림.',
          kind: 'illustration',
        },
        F2: {
          src: 'https://example.supabase.co/storage/v1/object/public/reference-figures/v3/moi_kongil_2023_6/q3-F2.png',
          alt: '(가) 공업의 제품 생산 과정 도식(석유 화학 공정).',
          kind: 'diagram',
        },
        // 업로드 전이면 src는 null
        F3: {
          src: null,
          alt: '(나) 공업의 제품 생산 과정 도식(철강 공정).',
          kind: 'diagram',
        },
      },
      choice_table: null,
    });
  });

  it('maps dialogue blocks and the (가)/(나) choice table', () => {
    const built = buildSourceBlocksStimulus(
      v3Payload(V3_DIALOGUE_CHOICE_TABLE_PAYLOAD),
    );
    expect(built?.blocks).toEqual([
      {
        type: 'dialogue',
        lines: V3_DIALOGUE_CHOICE_TABLE_PAYLOAD.stimulusBlocks[0].lines,
      },
    ]);
    expect(built?.figures).toEqual({});
    expect(built?.choice_table).toEqual(
      V3_DIALOGUE_CHOICE_TABLE_PAYLOAD.choiceTable,
    );
  });

  it('returns null without stimulusBlocks (v2 rows)', () => {
    expect(buildSourceBlocksStimulus(v2StylePayload())).toBeNull();
    expect(buildSourceBlocksStimulus({ ...v3Payload(), stimulusBlocks: [] })).toBeNull();
    expect(buildSourceBlocksStimulus(null)).toBeNull();
  });

  it('appends figures that no block or [그림 Fk] token references', () => {
    const payload = v3Payload();
    payload.stimulusBlocks = payload.stimulusBlocks.filter(
      (block: { type: string }) => block.type !== 'figure',
    );
    const built = buildSourceBlocksStimulus(payload);
    expect(built?.blocks.map((block) => block.type)).toEqual(['text', 'table', 'figure']);
    expect(built?.blocks.at(-1)).toEqual({ type: 'figure', figure_id: 'F1' });
  });

  it('does not append figures that picture choices reference', () => {
    const payload = v3Payload();
    payload.stimulusBlocks = payload.stimulusBlocks.filter(
      (block: { type: string }) => block.type !== 'figure',
    );
    payload.choices = ['① [그림 F1]', '② 가', '③ 나', '④ 다', '⑤ 라'];
    const built = buildSourceBlocksStimulus(payload);
    expect(built?.blocks.map((block) => block.type)).toEqual(['text', 'table']);
    expect(built?.figures.F1).toBeDefined();
  });

  it('drops figures that only the explanation references (answer screens)', () => {
    const payload = v3Payload();
    payload.stimulusBlocks = payload.stimulusBlocks.filter(
      (block: { type: string }) => block.type !== 'figure',
    );
    payload.explanation = '[해설] 완성된 화면은 [그림 F1]과 같다.';
    const built = buildSourceBlocksStimulus(payload);
    expect(built?.blocks.map((block) => block.type)).toEqual(['text', 'table']);
    expect(built?.figures.F1).toBeUndefined();
  });

  it('never emits a non-https figure src', () => {
    const payload = v3Payload();
    payload.figures[0].url = 'http://example.com/a.png';
    payload.figures[1].url = 'javascript:alert(1)';
    const built = buildSourceBlocksStimulus(payload);
    expect(built?.figures.F1.src).toBeNull();
    expect(built?.figures.F2.src).toBeNull();
  });

  it('drops a malformed choice table instead of the whole stimulus', () => {
    const payload = v3Payload(V3_DIALOGUE_CHOICE_TABLE_PAYLOAD);
    payload.choiceTable.rows.pop();
    expect(buildSourceBlocksStimulus(payload)?.choice_table).toBeNull();
  });

  it('rejects malformed blocks', () => {
    const unknownType = v3Payload();
    unknownType.stimulusBlocks.push({ type: 'image', src: 'x' });
    expect(buildSourceBlocksStimulus(unknownType)).toBeNull();

    const danglingFigure = v3Payload();
    danglingFigure.stimulusBlocks.push({ type: 'figure', figureId: 'F9' });
    expect(buildSourceBlocksStimulus(danglingFigure)).toBeNull();

    const numericCell = v3Payload();
    numericCell.stimulusBlocks[2].rows[0][1] = 3;
    expect(buildSourceBlocksStimulus(numericCell)).toBeNull();

    const protoFigure = v3Payload();
    protoFigure.figures.push({ id: '__proto__', kind: 'photo', description: '' });
    expect(buildSourceBlocksStimulus(protoFigure)).toBeNull();
  });
});

describe('sanitizeSourceBlocksStimulus', () => {
  const valid = () =>
    JSON.parse(JSON.stringify(buildSourceBlocksStimulus(v3Payload())));

  it('accepts built data and strips unknown keys', () => {
    const data = valid();
    data.extra = 'x';
    data.blocks[0].html = '<b>x</b>';
    data.figures.F1.onload = 'x';
    const sanitized = sanitizeSourceBlocksStimulus(data);
    expect(sanitized).toEqual(valid());
    expect(isSourceBlocksStimulusData(valid())).toBe(true);
  });

  it.each([
    ['non-object', () => 'text'],
    ['empty blocks', () => ({ ...valid(), blocks: [] })],
    ['missing figures', () => ({ ...valid(), figures: undefined })],
    [
      'http src',
      () => {
        const data = valid();
        data.figures.F1.src = 'http://example.com/a.png';
        return data;
      },
    ],
    [
      'data: src',
      () => {
        const data = valid();
        data.figures.F1.src = 'data:image/png;base64,AAAA';
        return data;
      },
    ],
    [
      'non-string alt',
      () => {
        const data = valid();
        data.figures.F1.alt = 1;
        return data;
      },
    ],
    [
      'figure block without figure entry',
      () => {
        const data = valid();
        delete data.figures.F1;
        return data;
      },
    ],
    [
      'blank text block',
      () => {
        const data = valid();
        data.blocks[0].text = '  ';
        return data;
      },
    ],
    [
      'table without rows',
      () => {
        const data = valid();
        data.blocks[2].rows = [];
        return data;
      },
    ],
    [
      'numeric table title',
      () => {
        const data = valid();
        data.blocks[2].title = 1;
        return data;
      },
    ],
    [
      'dialogue line without text',
      () => ({
        ...valid(),
        blocks: [{ type: 'dialogue', lines: [{ speaker: '기자' }] }],
      }),
    ],
    [
      'choice table with 4 rows',
      () => ({
        ...valid(),
        choice_table: { headers: ['(가)', '(나)'], rows: [['ㄱ', 'ㄴ']] },
      }),
    ],
  ])('rejects %s', (_label, make) => {
    expect(sanitizeSourceBlocksStimulus(make())).toBeNull();
  });
});

describe('TPL_SOURCE_BLOCKS render gate', () => {
  const data = buildSourceBlocksStimulus(v3Payload());

  it('is accepted by the source-preserving render gate only', () => {
    expect(validateSimplyReferenceRenderTpl(SOURCE_BLOCKS_TPL, data)).toBe(true);
    expect(validateSimplyReferenceRenderTpl(SOURCE_BLOCKS_TPL, { blocks: [] })).toBe(false);
    // LLM 생성 결과 검증 경로에서는 여전히 알 수 없는 템플릿이다.
    expect(validateSimplyReferenceStructuredTpl(SOURCE_BLOCKS_TPL, data)).toBe(false);
  });

  it('is not an LLM-selectable structured template', () => {
    expect(STRUCTURED_TPL_NAMES as readonly string[]).not.toContain(SOURCE_BLOCKS_TPL);
  });

  it('delegates other templates to the structured gate', () => {
    const article = {
      title: '원문 자료',
      source: '',
      published_date: '',
      body_paragraphs: ['본문'],
      key_facts: [],
    };
    expect(validateSimplyReferenceRenderTpl('TPL_ARTICLE', article)).toBe(
      validateSimplyReferenceStructuredTpl('TPL_ARTICLE', article),
    );
  });
});
