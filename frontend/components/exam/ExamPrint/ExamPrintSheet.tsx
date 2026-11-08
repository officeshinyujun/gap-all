import React from 'react';
import { CHOICE_MARKERS, layoutSourceTable, splitFigureTokens } from '@shared/utils/sourceBlocks';
import { isSvgDataUri, safeInlineSvg } from '@shared/utils/svgFigure';
import type { SourceFigure } from '@/types/questionstem';
import type { ExamItem } from '@/lib/examApi';
import { getExplanationText, getStepExplanation } from '@/types/examQuestion';
import { choiceLayout, toPrintStimulus, type PrintBlock, type PrintStimulus } from './printBlocks';

/**
 * 인쇄용 시험지 마크업. 앱 스타일과 분리된 iframe 문서에 들어가므로
 * 앱 레이아웃 컴포넌트(VStack 등) 대신 시험지 전용 클래스(examPrintStyles)만 쓴다.
 */
export interface ExamPrintSheetProps {
  title: string;
  /** 'reference'면 기출 문항, 그 밖에는 AI 출제로 표시 */
  sourceType?: string;
  subjectName: string;
  difficulty: string;
  unitRange: string;
  items: ExamItem[];
  /** 정답표 뒤에 문항별 단계별 해설(풀이 흐름·지문 단서·선택지 분석·핵심 교훈)을 붙인다. */
  includeExplanations?: boolean;
}

function withoutQuestionNumber(value: string) {
  return value.replace(/^\s*\d+\.\s*/, '');
}

/** "<보기>"가 "<"와 "보기>"로 갈려 줄이 바뀌지 않게 묶는다. */
function StemText({ value }: { value: string }) {
  return (
    <>
      {value.split(/(<보기>|\[\d점\])/u).map((part, index) =>
        index % 2 === 1 ? <span key={index} className="nobr">{part}</span> : <React.Fragment key={index}>{part}</React.Fragment>,
      )}
    </>
  );
}

function withoutOptionNumber(value: string) {
  return value.replace(/^\s*(?:[①-⑤]|[1-5][.)])\s*/, '');
}

function Figure({ id, figures }: { id: string; figures: Record<string, SourceFigure> }) {
  const figure = figures[id];
  // AI 출제 그림(SVG data URI)은 인라인으로 넣는다: <img> 안 SVG는 웹 글꼴을 못 써 PDF에서 한글이 깨질 수 있다.
  const inlineSvg = safeInlineSvg(figure?.src);
  if (inlineSvg) {
    return (
      <div
        className="figure-svg"
        role="img"
        aria-label={figure?.alt || `그림 ${id}`}
        data-figure-kind={figure?.kind}
        dangerouslySetInnerHTML={{ __html: inlineSvg }}
      />
    );
  }
  if (figure?.src && !isSvgDataUri(figure.src)) return <img className="figure" src={figure.src} alt={figure.alt || `그림 ${id}`} />;
  return <div className="figure-missing">{figure?.alt?.trim() || `[그림 ${id}]`}</div>;
}

function Rich({ value, figures }: { value: string; figures: Record<string, SourceFigure> }) {
  const segments = splitFigureTokens(value, figures);
  return (
    <>
      {segments.map((segment, index) =>
        segment.type === 'text'
          ? <React.Fragment key={index}>{segment.text}</React.Fragment>
          : <Figure key={index} id={segment.figureId} figures={figures} />,
      )}
    </>
  );
}

function Table({ block, figures }: { block: Extract<PrintBlock, { kind: 'table' }>; figures: Record<string, SourceFigure> }) {
  const layout = layoutSourceTable(block.headers, block.rows);
  if (layout.columnCount === 0) return null;
  return (
    <div className="table-wrap">
      {block.title ? <div className="table-title"><Rich value={block.title} figures={figures} /></div> : null}
      <table>
        {layout.head.rows.length > 0 ? (
          <thead>
            {layout.head.rows.map((row, r) => (
              <tr key={r}>
                {row.map((cell) => (
                  <th key={cell.col} colSpan={cell.colSpan} rowSpan={cell.rowSpan}><Rich value={cell.text} figures={figures} /></th>
                ))}
              </tr>
            ))}
          </thead>
        ) : null}
        <tbody>
          {layout.body.rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell) => (
                <td key={cell.col} colSpan={cell.colSpan} rowSpan={cell.rowSpan}><Rich value={cell.text} figures={figures} /></td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {block.caption ? <div className="table-caption"><Rich value={block.caption} figures={figures} /></div> : null}
    </div>
  );
}

function Block({ block, figures }: { block: PrintBlock; figures: Record<string, SourceFigure> }) {
  switch (block.kind) {
    case 'heading':
      return <div className="doc-heading"><Rich value={block.text} figures={figures} /></div>;
    case 'meta':
      return <div className="doc-meta">{block.text}</div>;
    case 'paragraph':
      return <p className={block.emphasis ? 'para para-strong' : 'para'}><Rich value={block.text} figures={figures} /></p>;
    case 'note':
      return <p className="note">{block.text}</p>;
    case 'list':
      return (
        <ul className="plain-list">
          {block.items.map((item, index) => <li key={index}>{item}</li>)}
        </ul>
      );
    case 'table':
      return <Table block={block} figures={figures} />;
    case 'dialogue':
      return (
        <div className="dialogue">
          {block.lines.map((line, index) => (
            <React.Fragment key={index}>
              <span className="speaker">{line.speaker ? `${line.speaker} :` : ''}</span>
              <span className="utterance"><Rich value={line.text} figures={figures} /></span>
            </React.Fragment>
          ))}
        </div>
      );
    case 'steps':
      return (
        <div className={block.horizontal ? 'steps steps-row' : 'steps'}>
          {block.steps.map((step, index) => (
            <React.Fragment key={index}>
              {index > 0 ? <span className="step-arrow">{block.horizontal ? '→' : '↓'}</span> : null}
              <span className="step">
                {step.label && step.label !== step.desc ? <b>{step.label} </b> : null}
                {step.desc}
              </span>
            </React.Fragment>
          ))}
        </div>
      );
    case 'figure':
      return <Figure id={block.figureId} figures={figures} />;
    default:
      return null;
  }
}

function Stimulus({ stimulus }: { stimulus: PrintStimulus }) {
  if (stimulus.blocks.length === 0) return null;
  return (
    <div className="stimulus">
      {stimulus.blocks.map((block, index) => <Block key={index} block={block} figures={stimulus.figures} />)}
    </div>
  );
}

function ChoiceTable({ table }: { table: NonNullable<PrintStimulus['choiceTable']> }) {
  return (
    <table className="choice-table">
      <thead>
        <tr>
          <th />
          {table.headers.map((header, index) => <th key={index}>{header}</th>)}
        </tr>
      </thead>
      <tbody>
        {table.rows.map((row, r) => (
          <tr key={r}>
            <td className="choice-marker">{CHOICE_MARKERS[r] ?? r + 1}</td>
            {table.headers.map((_, c) => <td key={c}>{row[c] ?? ''}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function PrintQuestion({ item }: { item: ExamItem }) {
  const question = item.question;
  const stimulus = toPrintStimulus(question.metadata?.recommended_template, question.render_ready?.stimulus_data);
  const options = (question.render_ready?.options_list ?? question.render_ready?.options?.map((option) => option.text) ?? [])
    .map(withoutOptionNumber);
  const combo = question.combo_block?.items?.length ? question.combo_block : null;
  const layout = choiceLayout(options);
  return (
    <section className="question">
      <div className="stem">
        <span className="qnum">{item.orderIndex}.</span>
        <span className="stem-text"><StemText value={withoutQuestionNumber(question.render_ready?.question_stem ?? '')} /></span>
      </div>
      <Stimulus stimulus={stimulus} />
      {combo ? (
        <div className="view">
          <div className="view-title">&lt;보&nbsp;&nbsp;기&gt;</div>
          {combo.items.map((entry) => (
            <div key={entry.key} className="view-item">
              <span className="view-key">{entry.key}.</span>
              <span>{entry.text}</span>
            </div>
          ))}
        </div>
      ) : null}
      {stimulus.choiceTable ? <ChoiceTable table={stimulus.choiceTable} /> : null}
      {options.length > 0 && !stimulus.choiceTable ? (
        <ol className={`choices choices-${layout}`}>
          {options.map((option, index) => (
            <li key={index}>
              <span className="choice-marker">{CHOICE_MARKERS[index] ?? `${index + 1}`}</span>
              <span>{option}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

function AnswerKey({ items }: { items: ExamItem[] }) {
  const rows: ExamItem[][] = [];
  for (let index = 0; index < items.length; index += 10) rows.push(items.slice(index, index + 10));
  return (
    <section className="answer-key">
      <h2>정답표</h2>
      <table>
        <tbody>
          {rows.map((row, r) => (
            <React.Fragment key={r}>
              <tr>
                <th>문항</th>
                {row.map((item) => <td key={item.id} className="answer-num">{item.orderIndex}</td>)}
              </tr>
              <tr>
                <th>정답</th>
                {row.map((item) => (
                  <td key={item.id}>{item.question.correct_answer ? CHOICE_MARKERS[item.question.correct_answer - 1] : '-'}</td>
                ))}
              </tr>
            </React.Fragment>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** 공부 화면 "이 개념이 문제에서 어떻게 나왔나"와 같은 순서의 종이용 해설 */
export function PrintExplanation({ item }: { item: ExamItem }) {
  const question = item.question;
  const answer = question.correct_answer ? CHOICE_MARKERS[question.correct_answer - 1] : '-';
  const steps = getStepExplanation(question.explanation);
  const text = question.explanation ? getExplanationText(question.explanation) : '';
  if (!steps && !text) return null;
  return (
    <section className="explain">
      <div className="explain-head">
        <span className="explain-num">{item.orderIndex}번</span>
        <span className="explain-answer">정답 {answer}</span>
        {item.targetConcept ? <span className="explain-concept">{item.targetConcept}</span> : null}
      </div>
      {steps ? (
        <>
          <div className="explain-label">풀이 흐름</div>
          <ol className="explain-steps">
            {steps.solvingFlow.map((step) => (
              <li key={step.step}><span className="explain-step-num">{step.step}</span><span>{step.action}</span></li>
            ))}
          </ol>
          <div className="explain-label">지문 단서</div>
          {steps.stimulusClues.map((clue, index) => (
            <div key={index} className="explain-clue">
              <mark>{clue.quote}</mark>
              <p>{clue.why}</p>
            </div>
          ))}
          <div className="explain-label">선택지 분석</div>
          {steps.optionAnalysis.map((option, index) => {
            const label = 'optionKey' in option ? option.optionKey : CHOICE_MARKERS[option.optionNum - 1] ?? String(option.optionNum);
            return (
              <div key={index} className={`explain-option ${option.verdict === 'O' ? 'is-true' : ''}`}>
                <span className="explain-option-key">{label}</span>
                <span className="explain-verdict">{option.verdict}</span>
                <span>{option.reasoning}</span>
              </div>
            );
          })}
          <div className="explain-label">핵심 교훈</div>
          <p className="explain-takeaway">{steps.takeaway}</p>
        </>
      ) : (
        <p className="explain-text">{text}</p>
      )}
    </section>
  );
}

export function ExamPrintSheet({ title, sourceType, subjectName, difficulty, unitRange, items, includeExplanations = true }: ExamPrintSheetProps) {
  const sorted = [...items].sort((left, right) => left.orderIndex - right.orderIndex);
  return (
    <main className="sheet">
      <header className="sheet-header">
        <div className="header-top">
          <span className="header-kind">모의고사 문제지</span>
          <span className="header-page">1</span>
        </div>
        <div className="header-title">
          <span className="period">{sourceType === 'reference' ? '기출 문항' : 'AI 출제'}</span>
          <h1>
            직업탐구 영역<span className="subject">({subjectName})</span>
          </h1>
        </div>
        <div className="header-fields">
          <span className="field field-name"><b>성명</b><i /></span>
          <span className="field field-number"><b>수험 번호</b><i /></span>
        </div>
        <div className="header-meta">{[title, unitRange, `난이도 ${difficulty}`, `${sorted.length}문항`].filter(Boolean).join('  ·  ')}</div>
      </header>
      <div className="columns">
        {sorted.map((item) => <PrintQuestion key={item.id} item={item} />)}
      </div>
      <AnswerKey items={sorted} />
      {includeExplanations ? (
        <section className="explanations">
          <h2>정답과 해설</h2>
          <div className="explain-columns">
            {sorted.map((item) => <PrintExplanation key={item.id} item={item} />)}
          </div>
        </section>
      ) : null}
    </main>
  );
}
