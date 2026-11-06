// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ExamItem } from '@/lib/examApi';
import { buildExamPrintHtml } from './exportExam';
import { choiceLayout, toPrintStimulus } from './printBlocks';

function item(orderIndex: number, overrides: Partial<ExamItem['question']> = {}): ExamItem {
  return {
    id: `item-${orderIndex}`,
    orderIndex,
    question: {
      metadata: { unit_name: '', target_concept: '', item_type: '', recommended_template: 'TPL_SOURCE_BLOCKS' },
      render_ready: {
        question_stem: '다음 자료에 대한 설명으로 옳은 것만을 <보기>에서 있는 대로 고른 것은? [3점]',
        stimulus_data: {
          blocks: [
            { type: 'text', text: '○○기업은 생산 공정을 점검하였다.' },
            { type: 'table', title: '생산 공정', headers: [['작업', '시간']], rows: [['작업 A', '6분']] },
            { type: 'dialogue', lines: [{ speaker: '교사', text: '무엇을 알 수 있나요?' }] },
          ],
          figures: {},
        },
        options_list: ['① ㄱ', '② ㄷ', '③ ㄱ, ㄴ', '④ ㄴ, ㄷ', '⑤ ㄱ, ㄴ, ㄷ'],
      },
      correct_answer: 4,
      combo_block: { title: '<보기>', items: [{ key: 'ㄱ', text: '첫 진술' }, { key: 'ㄴ', text: '둘째 진술' }, { key: 'ㄷ', text: '셋째 진술' }] },
      ...overrides,
    },
  };
}

describe('exam print sheet', () => {
  it('lays out choices like the real exam: one line, three per row, or stacked', () => {
    expect(choiceLayout(['ㄱ', 'ㄷ', 'ㄱ, ㄴ', 'ㄴ, ㄷ', 'ㄱ, ㄴ, ㄷ'])).toBe('inline');
    expect(choiceLayout(['ㄱ, ㄴ', 'ㄱ, ㄷ', 'ㄷ, ㄹ', 'ㄱ, ㄴ, ㄹ', 'ㄴ, ㄷ, ㄹ'])).toBe('triple');
    expect(choiceLayout(['성 윤리', '생명 윤리', '정보 윤리', '환경 윤리', '장애인 윤리'])).toBe('triple');
    expect(choiceLayout(['A 사는 개인이나 기업에게 서비스나 무형의 이익을 제공한다.', '짧음'])).toBe('stack');
  });

  it('converts legacy templates into exam-paper blocks', () => {
    expect(toPrintStimulus('TPL_CONVERSATIONAL_FLOW', {
      participants: [{ id: 'a', name: 'A 씨' }],
      messages: [{ p_id: 'a', text: '안녕하세요.' }],
    }).blocks).toEqual([{ kind: 'dialogue', lines: [{ speaker: 'A 씨', text: '안녕하세요.' }] }]);
    expect(toPrintStimulus('TPL_COMPARATIVE_MATRIX', {
      headers: [{ label: '구분' }, { label: '내용' }],
      rows: [{ cells: ['가', '나'] }],
    }).blocks).toEqual([{ kind: 'table', headers: [['구분', '내용']], rows: [['가', '나']] }]);
    expect(toPrintStimulus('TPL_PLAIN_TEXT', { data: '원문 자료' }).blocks).toEqual([{ kind: 'paragraph', text: '원문 자료' }]);
    expect(toPrintStimulus('TPL_SOURCE_BLOCKS', null).blocks).toEqual([]);
  });

  it('renders a two-column exam paper with header, <보 기>, choices and an answer key', () => {
    const html = buildExamPrintHtml({
      title: '성공적인 직업생활 1~3단원',
      sourceType: 'ai_generative',
      subjectName: '성공적인 직업생활',
      difficulty: 'MIDDLE',
      unitRange: '1~3단원',
      items: [item(2), item(1)],
    });
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<title>성공적인 직업생활 1~3단원</title>');
    expect(html).toContain('직업탐구 영역<span class="subject">(성공적인 직업생활)</span>');
    expect(html).toContain('AI 출제');
    expect(html).toContain('class="columns"');
    expect(html.indexOf('<span class="qnum">1.</span>')).toBeLessThan(html.indexOf('<span class="qnum">2.</span>'));
    expect(html).toContain('<span class="nobr">&lt;보기&gt;</span>');
    expect(html).toContain('<span class="nobr">[3점]</span>');
    expect(html).toContain('&lt;보\u00a0\u00a0기&gt;');
    expect(html).toContain('class="choices choices-inline"');
    expect(html).toContain('<span class="speaker">교사 :</span>');
    expect(html).toContain('<div class="table-title">생산 공정</div>');
    expect(html).toContain('<h2>정답표</h2>');
    expect(html).toContain('<td>④</td>');
    // 선지 번호를 두 번 찍지 않는다.
    expect(html).not.toContain('① ①');
  });

  it('labels reference exams as past questions and escapes the title', () => {
    const html = buildExamPrintHtml({
      title: '<script>시험</script>',
      sourceType: 'reference',
      subjectName: '공업 일반',
      difficulty: 'HIGH',
      unitRange: '7단원',
      items: [item(1)],
    });
    expect(html).toContain('기출 문항');
    expect(html).toContain('<title>&lt;script&gt;시험&lt;/script&gt;</title>');
    expect(html).not.toContain('<script>시험');
  });

  it('appends study-style explanations after the answer key, with a plain-text fallback', () => {
    const withSteps = item(1, {
      explanation: {
        judgment: '[해설] 전체 해설',
        conceptHighlightV2: {
          stimulusClues: [{ quote: '생산 공정을 점검하였다', why: '공정 관리 단서' }],
          optionAnalysis: [{ optionKey: 'ㄱ', verdict: 'O', reasoning: 'ㄱ 근거' }, { optionKey: 'ㄴ', verdict: 'X', reasoning: 'ㄴ 근거' }],
          solvingFlow: [{ step: 1, action: '자료 확인' }, { step: 2, action: '기준 적용' }, { step: 3, action: '선지 대조' }],
          takeaway: '핵심 교훈 문장',
        },
      },
    });
    const plain = item(2, { explanation: { judgment: '[해설] 문장 해설만 있음' } });
    const html = buildExamPrintHtml({ title: '시험', subjectName: '공업 일반', difficulty: 'HIGH', unitRange: '7단원', items: [withSteps, plain] });
    expect(html).toContain('<h2>정답과 해설</h2>');
    expect(html).toContain('<span class="explain-answer">정답 ④</span>');
    expect(html).toContain('<mark>생산 공정을 점검하였다</mark>');
    expect(html).toContain('<div class="explain-option is-true"><span class="explain-option-key">ㄱ</span>');
    expect(html).toContain('핵심 교훈 문장');
    expect(html).toContain('[해설] 문장 해설만 있음');
    expect(html.indexOf('<h2>정답표</h2>')).toBeLessThan(html.indexOf('<h2>정답과 해설</h2>'));

    const withoutExplanations = buildExamPrintHtml({ title: '시험', subjectName: '공업 일반', difficulty: 'HIGH', unitRange: '7단원', items: [withSteps], includeExplanations: false });
    expect(withoutExplanations).not.toContain('<h2>정답과 해설</h2>');
  });

  it('inlines safe SVG figures (so the page font applies) and falls back to the alt box otherwise', () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text x="1" y="5">비율(%)</text></svg>';
    const uri = (value: string) => `data:image/svg+xml;base64,${Buffer.from(value, 'utf8').toString('base64')}`;
    const withFigure = (src: string) => item(1, {
      render_ready: {
        question_stem: '다음 그래프에 대한 설명으로 옳은 것은?',
        stimulus_data: {
          blocks: [{ type: 'text', text: '본문' }, { type: 'figure', figure_id: 'F1' }],
          figures: { F1: { src, alt: '막대그래프. 비율 10', kind: 'chart' } },
        },
        options_list: ['① 가', '② 나', '③ 다', '④ 라', '⑤ 마'],
      },
    });
    const props = { title: 't', sourceType: 'ai_generative', subjectName: '공업 일반', difficulty: 'MIDDLE', unitRange: '1단원' };
    const html = buildExamPrintHtml({ ...props, items: [withFigure(uri(svg))] });
    expect(html).toContain('<div class="figure-svg" role="img" aria-label="막대그래프. 비율 10" data-figure-kind="chart"><svg');
    expect(html).toContain('비율(%)</text></svg>');
    expect(html).not.toContain('<img class="figure"');
    const unsafe = buildExamPrintHtml({ ...props, items: [withFigure(uri('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'))] });
    expect(unsafe).not.toContain('<script>alert');
    expect(unsafe).toContain('<div class="figure-missing">막대그래프. 비율 10</div>');
  });
});
