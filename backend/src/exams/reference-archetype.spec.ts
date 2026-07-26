import { classifyReferenceArchetype } from './reference-archetype';

describe('classifyReferenceArchetype', () => {
  it('classifies a view-combination source as a truth-combination item', () => {
    const result = classifyReferenceArchetype({
      stem: '다음 사례에 대한 설명으로 옳은 것만을 <보기>에서 있는 대로 고른 것은?',
      stimulus: 'A씨는 회사에서 근무한다.',
      viewItems: ['ㄱ. 첫 번째 설명', 'ㄴ. 두 번째 설명', 'ㄷ. 세 번째 설명'],
      choices: ['① ㄱ', '② ㄴ', '③ ㄱ, ㄴ', '④ ㄴ, ㄷ', '⑤ ㄱ, ㄴ, ㄷ'],
    });

    expect(result).toMatchObject({
      kind: 'classified',
      value: {
        stemIntent: 'truth_combination',
        responseMode: 'truth_combination',
        choiceEncoding: 'truth_combination',
        choiceTopology: 'combo_sets',
        viewKeys: ['ㄱ', 'ㄴ', 'ㄷ'],
      },
    });
  });

  it('classifies a negative prose-choice source as negative single selection', () => {
    const result = classifyReferenceArchetype({
      stem: '다음 중 근로 시간에 대한 설명으로 옳지 않은 것은?',
      stimulus: '근로 시간 관련 조항이다.',
      viewItems: [],
      choices: [
        '① 첫 번째 문장',
        '② 두 번째 문장',
        '③ 세 번째 문장',
        '④ 네 번째 문장',
        '⑤ 다섯 번째 문장',
      ],
    });

    expect(result).toMatchObject({
      kind: 'classified',
      value: {
        stemIntent: 'negative_single_selection',
        responseMode: 'single_selection',
        choiceEncoding: 'single_choice',
        choiceTopology: 'single_choice',
      },
    });
  });

  it('rejects bare Korean-letter choices without a view block', () => {
    expect(
      classifyReferenceArchetype({
        stem: '다음 중 옳은 것은?',
        stimulus: '근로 시간 관련 조항이다.',
        viewItems: [],
        choices: ['① ㄱ', '② ㄴ', '③ ㄷ', '④ ㄹ', '⑤ 모두 옳다'],
      }),
    ).toEqual({ kind: 'ambiguous', reason: 'LETTER_CHOICES_WITHOUT_VIEW' });
  });

  it('returns a source-free classification for a structured document shell', () => {
    const result = classifyReferenceArchetype({
      stem: '다음 사례를 바탕으로 옳은 것만을 고른 것은?',
      stimulus: '[문서] [판례 요약] [검토 항목]',
      viewItems: ['ㄱ. 검토 기준', 'ㄴ. 판단 요소', 'ㄷ. 결론 요소'],
      choices: ['① ㄱ', '② ㄴ', '③ ㄱ, ㄴ', '④ ㄴ, ㄷ', '⑤ ㄱ, ㄴ, ㄷ'],
    });

    expect(result).toMatchObject({
      kind: 'classified',
      value: {
        responseMode: 'truth_combination',
        choiceEncoding: 'truth_combination',
        viewItemCount: 3,
        choiceCount: 5,
        choiceTopology: 'combo_sets',
        shell: {
          kind: 'document',
        },
      },
    });
    expect(
      result.kind === 'classified' ? result.value : null,
    ).not.toHaveProperty('stimulus');
  });

  it('keeps a single parenthetical colon out of dialogue classification', () => {
    const result = classifyReferenceArchetype({
      stem: '다음 안내에 대한 설명으로 옳은 것은?',
      stimulus: '정책 안내\n(참고: 세부 기준은 변경될 수 있다.)',
      viewItems: [],
      choices: ['① 첫째', '② 둘째', '③ 셋째', '④ 넷째', '⑤ 다섯째'],
    });

    expect(result).toMatchObject({
      kind: 'classified',
      value: { stimulusRole: 'prose', shell: { kind: 'plain' } },
    });
  });

  it('classifies two constrained speaker turns as dialogue', () => {
    const result = classifyReferenceArchetype({
      stem: '다음 대화에 대한 설명으로 옳은 것은?',
      stimulus:
        '교사: 근로 계약의 조건을 확인하세요.\n학생: 임금과 근로 시간을 확인하겠습니다.',
      viewItems: [],
      choices: ['① 첫째', '② 둘째', '③ 셋째', '④ 넷째', '⑤ 다섯째'],
    });

    expect(result).toMatchObject({
      kind: 'classified',
      value: { stimulusRole: 'dialogue', shell: { kind: 'dialogue' } },
    });
  });

  it('classifies bracketed speaker turns as conversational flow', () => {
    const result = classifyReferenceArchetype({
      stem: '다음 대화에 대한 설명으로 옳은 것은?',
      stimulus:
        '[교사] 근로 계약의 조건을 확인하세요.\n[학생 A] 임금을 확인하겠습니다.\n[학생 B] 근로 시간도 확인하겠습니다.',
      viewItems: [],
      choices: ['① 첫째', '② 둘째', '③ 셋째', '④ 넷째', '⑤ 다섯째'],
    });

    expect(result).toMatchObject({
      kind: 'classified',
      value: {
        stimulusRole: 'dialogue',
        sourceTemplate: 'TPL_CONVERSATIONAL_FLOW',
        shell: { kind: 'dialogue' },
      },
    });
  });
});
