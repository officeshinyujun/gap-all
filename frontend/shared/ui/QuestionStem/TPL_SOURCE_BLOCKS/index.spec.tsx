import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { inferTemplate, parseStimulus } from '@shared/utils/examParser';
import { layoutSourceTable } from '@shared/utils/sourceBlocks';
import { QuestionRenderer } from '../QuestionRenderer';
import { SOURCE_BLOCKS_FIXTURE, SOURCE_BLOCKS_QUESTION_FIXTURE } from './sourceBlocks.fixture';

afterEach(cleanup);

function renderFixture() {
  return render(<QuestionRenderer questionNumber={1} question={SOURCE_BLOCKS_QUESTION_FIXTURE} />);
}

describe('TPL_SOURCE_BLOCKS rendering', () => {
  it('renders text blocks verbatim with line breaks and no markdown', () => {
    const { container } = renderFixture();
    const text = Array.from(container.querySelectorAll('div'))
      .filter((el) => el.textContent?.startsWith('43년째'))
      .pop();
    expect(text?.children).toHaveLength(0);
    expect(text?.textContent).toContain('목침*을 만들기');
    expect(text?.textContent).toContain('\n* 목침(木枕) : 나무토막으로 만든 베개');
    expect(container.querySelector('em, strong, ul, li')).toBeNull();
  });

  it('merges a two-row header into colspan/rowspan cells', () => {
    renderFixture();
    const table = screen.getByText('작업장').closest('table')!;
    const headRows = table.querySelectorAll('thead tr');
    expect(headRows).toHaveLength(2);

    expect(within(table).getByText('작업장').closest('th')).toHaveAttribute('rowspan', '2');
    expect(within(table).getByText('점검 사항').closest('th')).toHaveAttribute('rowspan', '2');
    expect(within(table).getByText('점검 결과').closest('th')).toHaveAttribute('colspan', '2');
    expect(headRows[0].querySelectorAll('th')).toHaveLength(3);
    expect(Array.from(headRows[1].querySelectorAll('th')).map((th) => th.textContent)).toEqual([
      '예',
      '아니오',
    ]);
    expect(screen.getByText('○○공사 현장 안전 점검 결과')).toBeInTheDocument();
  });

  it('replaces inline [그림 Fk] tokens with the figure inside the table cell', () => {
    const { container } = renderFixture();
    expect(container.textContent).not.toContain('[그림 F1]');
    expect(container.textContent).not.toContain('[그림 F2]');

    const img = screen.getByRole('img', { name: /태양광 패널/ });
    expect(img.tagName).toBe('IMG');
    expect(img).toHaveAttribute('src', 'https://placehold.co/320x180/png?text=F1');
    expect(img).toHaveAttribute('crossorigin', 'anonymous');
    expect(img).toHaveAttribute('loading', 'lazy');
    expect(img.closest('td')?.textContent).toContain('비율이 증가하고 있음.');
  });

  it('shows the alt text box when a figure has no src', () => {
    renderFixture();
    const missing = screen.getByRole('img', { name: /여객선/ });
    expect(missing.tagName).not.toBe('IMG');
    expect(missing).toHaveTextContent('해상을 운항하는 여객선 그림.');
    expect(missing.closest('td')).not.toBeNull();
  });

  it('falls back to the alt text box when an image fails to load', () => {
    renderFixture();
    const img = screen.getByRole('img', { name: /회의 테이블/ });
    expect(img.tagName).toBe('IMG');
    fireEvent.error(img);
    const fallback = screen.getByRole('img', { name: /회의 테이블/ });
    expect(fallback.tagName).not.toBe('IMG');
  });

  it('appends figures that no block or token references', () => {
    const { container } = renderFixture();
    const figureIds = Array.from(container.querySelectorAll('[data-figure-id]')).map((el) =>
      el.getAttribute('data-figure-id'),
    );
    expect(figureIds).toEqual(['F1', 'F2', 'F3', 'F4']);
  });

  it('renders dialogue speakers and the choice table above the options', () => {
    renderFixture();
    expect(screen.getByText('마케팅 부장')).toBeInTheDocument();
    const choiceTable = screen.getByText('직업의식').closest('table')!;
    expect(
      Array.from(choiceTable.querySelectorAll('tbody th')).map((th) => th.textContent),
    ).toEqual(['①', '②', '③', '④', '⑤']);
    expect(screen.getByText('① 전문 의식 / 과정 지향적 직업관')).toBeInTheDocument();
  });

  it('renders picture choices ([그림 Fk] in options) as figures', () => {
    const figureId = Object.keys(SOURCE_BLOCKS_FIXTURE.figures)[0];
    const question = {
      ...SOURCE_BLOCKS_QUESTION_FIXTURE,
      render_ready: {
        ...SOURCE_BLOCKS_QUESTION_FIXTURE.render_ready,
        options_list: [`① [그림 ${figureId}]`, '② 가', '③ 나', '④ 다', '⑤ 라'],
      },
    };
    const { container } = render(<QuestionRenderer questionNumber={1} question={question} />);
    const option = container.querySelector('button [data-figure-id]');
    expect(option).not.toBeNull();
    expect(option).toHaveAttribute('data-figure-id', figureId);
    expect(screen.queryByText(`[그림 ${figureId}]`, { exact: false })).toBeNull();
  });
});

describe('TPL_SOURCE_BLOCKS parsing', () => {
  it('infers the template and normalizes camelCase aliases', () => {
    expect(inferTemplate(SOURCE_BLOCKS_FIXTURE)).toBe('TPL_SOURCE_BLOCKS');
    const parsed = parseStimulus('TPL_SOURCE_BLOCKS', {
      blocks: [{ type: 'figure', figureId: 'F1' }, { type: 'unknown' }],
      figures: { F1: { src: null, alt: '설명' } },
      choice_table: null,
    });
    expect(parsed).toEqual({
      template: 'TPL_SOURCE_BLOCKS',
      data: {
        blocks: [{ type: 'figure', figure_id: 'F1' }],
        figures: { F1: { src: null, alt: '설명' } },
        choice_table: null,
      },
    });
  });

  it('merges only the row-label column in the body and keeps other empty cells', () => {
    const layout = layoutSourceTable(
      [['문제점', '개선안']],
      [
        ['불량률 상승', '낭비 요소 제거'],
        ['', '일정 관리'],
        ['항목', ''],
      ],
    );
    expect(layout.body.rows[0][0]).toMatchObject({ text: '불량률 상승', rowSpan: 2 });
    expect(layout.body.rows[1].map((cell) => cell.text)).toEqual(['일정 관리']);
    expect(layout.body.rows[2].map((cell) => cell.text)).toEqual(['항목', '']);
  });

  it('renders AI SVG figures inline with an accessible name, and unsafe SVG as the alt box', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect x="1" y="1" width="2" height="2" fill="#000"/></svg>';
    const uri = (value: string) => `data:image/svg+xml;base64,${btoa(value)}`;
    const question = (src: string) => ({
      ...SOURCE_BLOCKS_QUESTION_FIXTURE,
      render_ready: {
        ...SOURCE_BLOCKS_QUESTION_FIXTURE.render_ready,
        stimulus_data: {
          blocks: [{ type: 'figure', figure_id: 'F1' }],
          figures: { F1: { src, alt: '꺾은선 그래프. 생산량', kind: 'chart' } },
          choice_table: null,
        },
      },
    });
    const { container, unmount } = render(<QuestionRenderer questionNumber={1} question={question(uri(svg))} />);
    const figure = screen.getByRole('img', { name: '꺾은선 그래프. 생산량' });
    expect(figure.tagName).toBe('SPAN');
    expect(figure.querySelector('svg rect')).not.toBeNull();
    expect(container.querySelector('img[data-figure-id="F1"]')).toBeNull();
    unmount();
    render(<QuestionRenderer questionNumber={1} question={question(uri('<svg xmlns="http://www.w3.org/2000/svg"><foreignObject/></svg>'))} />);
    const fallback = screen.getByRole('img', { name: '꺾은선 그래프. 생산량' });
    expect(fallback.querySelector('svg')).toBeNull();
    expect(fallback).toHaveTextContent('꺾은선 그래프. 생산량');
  });
});
