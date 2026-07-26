import {
  deriveInterviewSceneKind,
  parseSourceInterview,
} from './interview-scene';

const validConversation = {
  participants: [
    { id: 'reporter', name: '기자', role: 'interviewer' },
    { id: 'developer', name: '개발자', role: 'interviewee' },
  ],
  messages: [
    { p_id: 'reporter', text: '새 케이블의 특징이 궁금합니다.', timestamp: '' },
    { p_id: 'developer', text: '초전도 신소재를 사용했습니다.', timestamp: '' },
  ],
};

describe('interview scene contract', () => {
  it('accepts an explicit two-person reporter interview source', () => {
    expect(
      parseSourceInterview({
        stem: '다음 인터뷰 내용에 나타난 기술로 적절한 것은?',
        stimulus:
          '기자: 이번에 개발하신 케이블의 특징이 궁금합니다.\n개발자: 초전도 신소재를 사용했습니다.',
      }),
    ).toEqual({ eligible: true });
  });

  it.each([
    [
      'classroom dialogue',
      '다음 대화 장면에서 교사의 답변으로 적절한 것은?',
      '교사: 오늘은 직업의 특징을 학습해 봅시다.\n학생: 직업이 무엇인가요?\n교사: 직업의 요건을 살펴봅시다.',
      'MISSING_INTERVIEW_MARKER',
    ],
    [
      'one-sided quotation',
      '다음 인터뷰 내용으로 적절한 것은?',
      '기자: 개발자는 새로운 소재를 사용했다고 설명했다.',
      'INVALID_TURN_COUNT',
    ],
  ])('%s is not an eligible interview', (_, stem, stimulus, reason) => {
    expect(parseSourceInterview({ stem, stimulus })).toEqual({
      eligible: false,
      reason,
    });
  });

  it('derives interview only from eligible source and alternating generated turns', () => {
    expect(
      deriveInterviewSceneKind(
        {
          stem: '다음 인터뷰 내용에 나타난 기술로 적절한 것은?',
          stimulus:
            '기자: 이번에 개발하신 케이블의 특징이 궁금합니다.\n개발자: 초전도 신소재를 사용했습니다.',
        },
        validConversation,
      ),
    ).toBe('interview');
  });

  it.each([
    [
      'a fifth turn',
      {
        ...validConversation,
        messages: [
          ...validConversation.messages,
          { p_id: 'reporter', text: '추가 질문입니다.', timestamp: '' },
          { p_id: 'developer', text: '추가 답변입니다.', timestamp: '' },
          { p_id: 'reporter', text: '마지막 질문입니다.', timestamp: '' },
        ],
      },
    ],
    ['presentation data', { ...validConversation, svg: '<svg></svg>' }],
    [
      'a repeated speaker',
      {
        ...validConversation,
        messages: [
          ...validConversation.messages,
          { p_id: 'developer', text: '덧붙여 설명합니다.', timestamp: '' },
        ],
      },
    ],
  ])('does not derive interview from %s', (_, generatedConversation) => {
    expect(
      deriveInterviewSceneKind(
        {
          stem: '다음 인터뷰 내용에 나타난 기술로 적절한 것은?',
          stimulus:
            '기자: 이번에 개발하신 케이블의 특징이 궁금합니다.\n개발자: 초전도 신소재를 사용했습니다.',
        },
        generatedConversation,
      ),
    ).toBeNull();
  });
});
