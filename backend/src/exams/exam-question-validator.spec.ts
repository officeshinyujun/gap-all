import { Logger, InternalServerErrorException } from '@nestjs/common';
import {
  validateItems,
  validateStemPattern,
  validateItemLogic,
} from './exam-question-validator';
import { StimulusNormalizer } from './stimulus-normalizer';

const mockWarn = jest.fn();
const mockLogger = {
  warn: mockWarn,
  log: jest.fn(),
} as unknown as Logger;

const normalizer = new StimulusNormalizer();

const makeRawItem = (overrides: Record<string, any> = {}) => ({
  metadata: {
    target_concept: '근로기준법',
    item_type: 'single_selection',
    difficulty: '중',
    recommended_template: 'TPL_FORMAL_DOCUMENT',
    unit_name: '1단원',
    ...overrides.metadata,
  },
  render_ready: {
    question_stem: '다음 사례에 대한 설명으로 옳은 것은?',
    stimulus_data: {
      doc_type: '법률 조항',
      header_info: { title: '근로기준법', date: '2024.01', author: '고용부' },
      paragraphs: [
        { sub_title: '제6조', content: '근로자는 근로기준법의 보호를 받는다.' },
      ],
      footnotes: [],
    },
    options_list: [
      '① 선택지 1',
      '② 선택지 2',
      '③ 선택지 3',
      '④ 선택지 4',
      '⑤ 선택지 5',
    ],
    ...(overrides.render_ready ?? {}),
  },
  correct_answer: 1,
  explanation: { judgment: '근로기준법의 적용을 받는다.', distractors: {} },
  ...overrides,
});

describe('validateItems — 콘텐츠 품질 검증', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('정상 문항은 통과', () => {
    const items = [makeRawItem()];
    const result = validateItems(items, mockLogger, normalizer);
    expect(result).toHaveLength(1);
    expect(mockWarn).not.toHaveBeenCalled();
  });

  it('빈 stimulus_data는 차단 (단독 시 InternalServerErrorException)', () => {
    const items = [
      makeRawItem({
        render_ready: {
          question_stem: '다음 사례에 대한 설명으로 옳은 것은?',
          stimulus_data: {},
          options_list: [
            '① 선택지 1',
            '② 선택지 2',
            '③ 선택지 3',
            '④ 선택지 4',
            '⑤ 선택지 5',
          ],
        },
      }),
    ];
    expect(() => validateItems(items, mockLogger, normalizer)).toThrow(
      InternalServerErrorException,
    );
    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining('stimulus_data 비어있음'),
    );
  });

  it('빈 stimulus_data가 혼합된 경우 빈 것만 탈락', () => {
    const validItem = makeRawItem();
    const badItem = makeRawItem({
      render_ready: {
        question_stem: '다음 사례에 대한 설명으로 옳은 것은?',
        stimulus_data: {},
        options_list: [
          '① 선택지 1',
          '② 선택지 2',
          '③ 선택지 3',
          '④ 선택지 4',
          '⑤ 선택지 5',
        ],
      },
    });
    const result = validateItems([validItem, badItem], mockLogger, normalizer);
    expect(result).toHaveLength(1);
    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining('stimulus_data 비어있음'),
    );
  });

  it('(내용 없음) 플레이스홀더 포함 문항은 차단', () => {
    const validItem = makeRawItem();
    const badItem = makeRawItem({
      render_ready: {
        question_stem: '다음 사례에 대한 설명으로 옳은 것은?',
        stimulus_data: {
          paragraphs: [{ sub_title: '', content: '(내용 없음)' }],
        },
        options_list: [
          '① 선택지 1',
          '② 선택지 2',
          '③ 선택지 3',
          '④ 선택지 4',
          '⑤ 선택지 5',
        ],
      },
    });
    const result = validateItems([validItem, badItem], mockLogger, normalizer);
    expect(result).toHaveLength(1);
    expect(mockWarn).toHaveBeenCalledWith(
      expect.stringContaining('플레이스홀더 포함'),
    );
  });

  it('다른 종류의 플레이스홀더도 차단', () => {
    const placeholderTexts = [
      '{{placeholder}}',
      '여기에 내용을 입력하세요',
      '값을 입력하세요',
    ];
    for (const ph of placeholderTexts) {
      jest.clearAllMocks();
      const validItem = makeRawItem();
      const badItem = makeRawItem({
        render_ready: {
          question_stem: '다음 설명으로 옳은 것은?',
          stimulus_data: { data: ph },
          options_list: ['① 1', '② 2', '③ 3', '④ 4', '⑤ 5'],
        },
      });
      const result = validateItems(
        [validItem, badItem],
        mockLogger,
        normalizer,
      );
      expect(result).toHaveLength(1);
      expect(result[0].stimulusData).toHaveProperty('doc_type');
    }
  });

  it('일반 문항과 빈 문항 혼합 시 빈 문항만 탈락', () => {
    const validItem = makeRawItem();
    const badItem = makeRawItem({
      render_ready: {
        question_stem: '다음 사례에 대한 설명으로 옳은 것은?',
        stimulus_data: {
          paragraphs: [{ sub_title: '', content: '(내용 없음)' }],
        },
        options_list: ['① 1', '② 2', '③ 3', '④ 4', '⑤ 5'],
      },
    });
    const result = validateItems([validItem, badItem], mockLogger, normalizer);
    expect(result).toHaveLength(1);
    expect(result[0].questionStem).toBe('다음 사례에 대한 설명으로 옳은 것은?');
  });
});

describe('validateStemPattern — 기존 검증 호환', () => {
  it('짧은 stem은 기존대로 차단', () => {
    const item = makeRawItem({
      render_ready: {
        question_stem: '옳은?',
        stimulus_data: { data: 'test' },
        options_list: ['①', '②', '③', '④', '⑤'],
      },
    });
    const result = validateStemPattern(item);
    expect(result.valid).toBe(false);
  });

  it('질문 형식이 아닌 stem은 기존대로 차단', () => {
    const item = makeRawItem({
      render_ready: {
        question_stem: '이것은 근로기준법의 일부 조항이다',
        stimulus_data: { data: 'test' },
        options_list: ['①', '②', '③', '④', '⑤'],
      },
    });
    const result = validateStemPattern(item);
    expect(result.valid).toBe(false);
  });
});

describe('validateItemLogic — 기존 검증 호환', () => {
  it('correct_answer 누락은 기존대로 차단', () => {
    const item: any = makeRawItem();
    item.correct_answer = null;
    const result = validateItemLogic(item);
    expect(result.valid).toBe(false);
  });

  it('정답 범위 초과는 기존대로 차단', () => {
    const item = makeRawItem({ correct_answer: 6 });
    const result = validateItemLogic(item);
    expect(result.valid).toBe(false);
  });
});
