'use client';

// 변환 출력이 어긋났을 때 렌더러가 어떻게 되는지 보여 주는 데모 화면.
// 특기입증자료 그림 3-3 캡처용. 서비스 기능이 아니다.

import React from 'react';
import { QuestionRenderer } from '@/components/exam/QuestionStem/QuestionRenderer';
import { inferTemplate } from '@/utils/examParser';
import type { ExamQuestion } from '@/types/examQuestion';

type Case = {
  title: string;
  broke: string;
  stimulus: unknown;
  options: string[];
  answer: number;
};

const STEM = '다음은 A 기업과 B 기업의 자재 관리 방식이다. 이에 대한 설명으로 옳은 것은?';

const OK_OPTIONS = ['① A는 계획 생산이다', '② B는 주문 생산이다', '③ 둘 다 MRP다', '④ A는 외주 구매다', '⑤ B는 적정 재고를 둔다'];

const CASES: Case[] = [
  {
    title: '1. 배열이 문자열로 바뀌었다',
    broke: 'rows: [] → rows: "…"',
    stimulus: {
      headers: [{ id: 'h1', label: 'A기업' }, { id: 'h2', label: '항목' }, { id: 'h3', label: 'B기업' }],
      rows: '계약 공급 | 자재 구매 | 시장 비교 구매',
    },
    options: OK_OPTIONS,
    answer: 1,
  },
  {
    title: '2. 필드 이름이 달라졌다',
    broke: 'headers → header',
    stimulus: {
      header: [{ id: 'h1', label: 'A기업' }, { id: 'h2', label: '항목' }],
      rows: [{ id: 'r1', cells: ['계약 공급', '자재 구매'] }],
    },
    options: OK_OPTIONS,
    answer: 2,
  },
  {
    title: '3. 칸 수가 머리글 수와 다르다',
    broke: 'headers 3개 / cells 2개',
    stimulus: {
      headers: [{ id: 'h1', label: 'A기업' }, { id: 'h2', label: '항목' }, { id: 'h3', label: 'B기업' }],
      rows: [
        { id: 'r1', cells: ['계약 공급', '자재 구매'] },
        { id: 'r2', cells: ['수요 예측', '재고 관리', '등급 분류'] },
      ],
    },
    options: OK_OPTIONS,
    answer: 3,
  },
  {
    title: '4. 대화문에서 화자가 빠졌다',
    broke: 'participants 누락',
    stimulus: {
      messages: [
        { id: 'm1', text: '이번 분기 자재는 계약 물량으로 갑니다.' },
        { id: 'm2', text: '재고는 수요 예측에 맞춰 조정하겠습니다.' },
      ],
    },
    options: OK_OPTIONS,
    answer: 4,
  },
  {
    title: '5. 정답 번호가 선택지 범위를 벗어났다',
    broke: 'options 4개 / correct_answer 5',
    stimulus: {
      headers: [{ id: 'h1', label: 'A기업' }, { id: 'h2', label: 'B기업' }],
      rows: [{ id: 'r1', cells: ['계약 공급', '시장 비교 구매'] }],
    },
    options: OK_OPTIONS.slice(0, 4),
    answer: 5,
  },
];

class Boundary extends React.Component<{ children: React.ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null };
  static getDerivedStateFromError(err: Error) {
    return { err };
  }
  render() {
    if (this.state.err) {
      return (
        <div style={{ padding: 14, background: '#fff3f3', border: '1px solid #f0c2c2', borderRadius: 6, color: '#a11', fontSize: 13 }}>
          렌더러가 예외로 멈춤 — {this.state.err.message}
        </div>
      );
    }
    return <>{this.props.children}</>;
  }
}

function toQuestion(c: Case): ExamQuestion {
  return {
    metadata: { unit_name: '공업 일반 10단원', target_concept: '자재 관리', item_type: '단일 단원 사실 확인 (하)' },
    render_ready: {
      question_stem: STEM,
      stimulus_data: c.stimulus,
      options_list: c.options,
    },
    correct_answer: c.answer,
  };
}

const label: React.CSSProperties = {
  fontSize: 11,
  letterSpacing: 0.4,
  color: '#8a8a8a',
  fontWeight: 600,
  marginBottom: 6,
};

export default function TplBrokenPage() {
  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '40px 24px 80px', fontFamily: 'Wanted Sans, system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 26, fontWeight: 700, marginBottom: 8 }}>변환 출력이 어긋났을 때</h1>
      <p style={{ fontSize: 14, color: '#555', lineHeight: 1.6, marginBottom: 32 }}>
        원문 문항 JSON에서 값 일부만 바꾸게 했을 때 실제로 나온 어긋남을 같은 렌더러에 넣어 본 화면이다.
        형식은 JSON이라 통과하지만, 화면에서는 자료가 사라지거나 다른 뜻이 된다.
      </p>

      {CASES.map((c) => {
        const inferred = inferTemplate(c.stimulus) ?? '(판정 실패)';
        return (
          <section key={c.title} style={{ marginBottom: 40, borderTop: '1px solid #e5e5e5', paddingTop: 20 }}>
            <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{c.title}</div>
            <div style={{ fontSize: 13, color: '#666', marginBottom: 16 }}>
              어긋난 곳 — <code style={{ background: '#f4f4f4', padding: '1px 5px', borderRadius: 3 }}>{c.broke}</code>
              {'   ·   '}
              inferTemplate() → <code style={{ background: '#f4f4f4', padding: '1px 5px', borderRadius: 3 }}>{inferred}</code>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, alignItems: 'start' }}>
              <div>
                <div style={label}>변환 출력</div>
                <pre style={{ background: '#0d1117', color: '#e6edf3', padding: 14, borderRadius: 8, fontSize: 11, lineHeight: 1.5, overflowX: 'auto', margin: 0 }}>
                  {JSON.stringify({ stimulus_data: c.stimulus, correct_answer: c.answer, options: c.options.length }, null, 2)}
                </pre>
              </div>
              <div>
                <div style={label}>같은 렌더러에 넣은 결과</div>
                <Boundary>
                  <QuestionRenderer question={toQuestion(c)} questionNumber={1} />
                </Boundary>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
