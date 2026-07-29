import { cleanup, render, screen } from '@testing-library/react';
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
