import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { parseStimulus } from '@shared/utils/examParser';
import { QuestionRenderer } from './index';

afterEach(cleanup);

describe('QuestionRenderer matrix stimulus', () => {
  it('renders only source-backed headers and cells when selection chips are empty', () => {
    render(
      <QuestionRenderer
        questionNumber={1}
        question={{
          metadata: {
            unit_name: '1단원',
            target_concept: '비교',
            item_type: 'simply_reference',
            recommended_template: 'TPL_COMPARATIVE_MATRIX',
          },
          render_ready: {
            question_stem: '다음 표를 보고 답하시오.',
            stimulus_data: {
              headers: [{ id: 'criterion', label: '조건' }],
              rows: [{ id: 'row-1', cells: ['원문 결과'] }],
              selection_chips: [],
            },
            options_list: ['① 하나', '② 둘', '③ 셋', '④ 넷', '⑤ 다섯'],
          },
        }}
      />,
    );

    expect(screen.getByText('조건')).toBeInTheDocument();
    expect(screen.getByText('원문 결과')).toBeInTheDocument();
    expect(screen.queryByText('구분')).not.toBeInTheDocument();
    expect(screen.queryByText('row-1')).not.toBeInTheDocument();
  });
});

describe('parseStimulus conversational flow', () => {
  it('preserves visual metadata required by the web and PDF renderers', () => {
    const parsed = parseStimulus('TPL_CONVERSATIONAL_FLOW', {
      participants: [
        { id: 'speaker-1', name: '교사', role: '', icon_key: 'teacher' },
        { id: 'speaker-2', name: '학생', role: '', icon_key: 'student' },
      ],
      messages: [{ p_id: 'speaker-1', text: '확인해 봅시다.', timestamp: '1' }],
      scene_kind: 'school',
      visual_aid: {
        kind: 'actor_flow',
        actor_ids: ['speaker-1', 'speaker-2'],
        relations: [
          {
            from_id: 'speaker-1',
            to_id: 'speaker-2',
            action_key: 'inform',
            evidence_message_indexes: [0],
          },
        ],
      },
    });

    expect(parsed).toMatchObject({
      template: 'TPL_CONVERSATIONAL_FLOW',
      data: {
        scene_kind: 'school',
        visual_aid: { kind: 'actor_flow' },
        participants: [
          { id: 'speaker-1', icon_key: 'teacher' },
          { id: 'speaker-2', icon_key: 'student' },
        ],
      },
    });
  });
});

describe('parseStimulus article', () => {
  it('converts legacy paragraph objects to the canonical string array', () => {
    expect(
      parseStimulus('TPL_ARTICLE', {
        title: '원문 기사',
        body_paragraphs: [
          { type: 'subheading', content: '소제목' },
          { type: 'text', content: '원문 본문' },
        ],
      }),
    ).toMatchObject({
      template: 'TPL_ARTICLE',
      data: { body_paragraphs: ['소제목', '원문 본문'] },
    });
  });
});

describe('QuestionRenderer structured stimulus fallback', () => {
  it('shows the serialized source instead of an empty matrix UI when fields are missing', () => {
    render(
      <QuestionRenderer
        questionNumber={1}
        question={{
          metadata: {
            unit_name: '1단원',
            target_concept: '비교',
            item_type: 'simply_reference',
            recommended_template: 'TPL_COMPARATIVE_MATRIX',
          },
          render_ready: {
            question_stem: '다음 표를 보고 답하시오.',
            stimulus_data: {
              headers: [],
              rows: [],
              source_excerpt: '원문 보존 대체 경로의 표 설명',
            },
            options_list: ['① 하나', '② 둘', '③ 셋', '④ 넷', '⑤ 다섯'],
          },
        }}
      />,
    );

    expect(screen.getByText(/원문 보존 대체 경로의 표 설명/)).toBeInTheDocument();
  });
});

describe('QuestionRenderer step explanation', () => {
  const question = (explanation: unknown) => ({
    metadata: { unit_name: '', target_concept: '', item_type: '', recommended_template: 'TPL_SOURCE_BLOCKS' },
    render_ready: {
      question_stem: '다음 자료에 대한 설명으로 옳은 것만을 <보기>에서 있는 대로 고른 것은?',
      stimulus_data: { blocks: [{ type: 'text', text: '재고가 200개가 되면 매번 1,000개를 주문한다.' }], figures: {} },
      options_list: ['① ㄱ', '② ㄴ', '③ ㄱ, ㄷ', '④ ㄴ, ㄷ', '⑤ ㄱ, ㄴ, ㄷ'],
    },
    explanation: explanation as never,
  });

  it('shows the study-style steps when the explanation has a valid highlight', () => {
    render(
      <QuestionRenderer
        questionNumber={1}
        correctAnswer={3}
        selectedOption={3}
        question={question({
          judgment: '[해설] 정량 발주이다.',
          conceptHighlightV2: {
            stimulusClues: [{ quote: '매번 1,000개를 주문한다', why: '발주량이 일정하다' }],
            optionAnalysis: [
              { optionKey: 'ㄱ', verdict: 'O', reasoning: 'ㄱ 근거' },
              { optionKey: 'ㄴ', verdict: 'X', reasoning: 'ㄴ 근거' },
            ],
            solvingFlow: [{ step: 1, action: '발주 시점 확인' }, { step: 2, action: '발주량 확인' }, { step: 3, action: '기준 적용' }],
            takeaway: '발주량 고정이면 정량 발주',
          },
        })}
      />,
    );
    expect(screen.getByText('풀이 흐름')).toBeInTheDocument();
    expect(screen.getByText('발주량 확인')).toBeInTheDocument();
    expect(screen.getByText('매번 1,000개를 주문한다')).toBeInTheDocument();
    expect(screen.getByText('ㄴ 근거')).toBeInTheDocument();
    expect(screen.getByText('이 개념이 문제에서 어떻게 나왔나')).toBeInTheDocument();
    // 핵심 교훈은 공부 화면처럼 접힌 상태로 시작한다.
    expect(screen.queryByText('발주량 고정이면 정량 발주')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('핵심 교훈'));
    expect(screen.getByText('발주량 고정이면 정량 발주')).toBeInTheDocument();
    expect(screen.getByText('전체 해설 문장 보기')).toBeInTheDocument();
  });

  it('falls back to the plain explanation text without a valid highlight', () => {
    render(<QuestionRenderer questionNumber={1} correctAnswer={3} selectedOption={3} question={question({ judgment: '[해설] 정량 발주이다.' })} />);
    expect(screen.queryByText('풀이 흐름')).not.toBeInTheDocument();
    expect(screen.getByText('[해설] 정량 발주이다.')).toBeInTheDocument();
  });
});
