/* eslint-disable */
/**
 * exam.json → 수능형 2단 시험지 HTML(exam.html) → PDF(exam.pdf, 헤드리스 Chrome/Chromium/Edge).
 *   node pdf.cjs <작업 폴더> [--no-answers] [--chrome <실행 파일>]
 * 시험지(2단, 수능처럼 3점 문항에만 [3점] 표기) 뒤에 정답표와 해설 쪽을 붙인다(--no-answers면 시험지만).
 * 평가원 공식 문항과 혼동되지 않도록 머리말에 "AI 출제 모의 문항"을 표시한다.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const NUMERALS = ['①', '②', '③', '④', '⑤'];
const SUBJECT_AREA = { success: ['직업탐구 영역', '성공적인 직업생활'], kongil: ['직업탐구 영역', '공업 일반'] };

const esc = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const multiline = (value) => esc(value).replace(/\n/g, '<br>');

function blockHtml(block, figures) {
  if (block.type === 'text') return `<div class="text">${multiline(block.text)}</div>`;
  if (block.type === 'dialogue') {
    return `<div class="dialogue">${block.lines.map((line) => `<div class="line"><span class="speaker">${esc(line.speaker)}</span><span class="utter">${multiline(line.text)}</span></div>`).join('')}</div>`;
  }
  if (block.type === 'table') {
    const head = (block.headers || []).map((row) => `<tr>${row.map((cell) => `<th>${multiline(cell)}</th>`).join('')}</tr>`).join('');
    const body = (block.rows || []).map((row) => `<tr>${row.map((cell) => `<td>${multiline(cell)}</td>`).join('')}</tr>`).join('');
    return `<div class="table-wrap">${block.title ? `<div class="table-title">${esc(block.title)}</div>` : ''}<table>${head}${body}</table>${block.caption ? `<div class="caption">${esc(block.caption)}</div>` : ''}</div>`;
  }
  if (block.type === 'figure') {
    const figure = figures[block.figure_id];
    if (!figure || !figure.src) return `<div class="figure missing">[그림 ${esc(block.figure_id)}]</div>`;
    return `<div class="figure"><img src="${figure.src}" alt="${esc(figure.alt)}"></div>`;
  }
  return '';
}

function choicesHtml(question) {
  const table = question.stimulusData.choice_table;
  if (table) {
    const head = `<tr><th></th>${table.headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr>`;
    const rows = table.rows.map((row, index) => `<tr><td class="num">${NUMERALS[index]}</td>${row.map((cell) => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('');
    return `<table class="choice-table">${head}${rows}</table>`;
  }
  const bodies = question.optionsList.map((option) => option.replace(/^[①②③④⑤]\s*/u, ''));
  const longest = Math.max(...bodies.map((body) => body.length));
  // 수능 시험지처럼: 짧은 선지(ㄱ, ㄴ / 9,000원)는 한 줄에 다섯, 중간 길이는 세 개씩, 문장 선지는 한 줄에 하나
  const layout = longest <= 9 ? 'row5' : longest <= 16 ? 'row3' : 'col1';
  return `<div class="choices ${layout}">${bodies.map((body, index) => `<span class="choice"><span class="num">${NUMERALS[index]}</span> ${esc(body)}</span>`).join('')}</div>`;
}

function questionHtml(question, number) {
  const figures = question.stimulusData.figures || {};
  const blocks = (question.stimulusData.blocks || []).map((block) => blockHtml(block, figures)).join('');
  const combo = question.comboBlock
    ? `<div class="combo"><div class="combo-title">&lt;보 기&gt;</div>${question.comboBlock.items.map((item) => `<div class="combo-item"><span class="key">${esc(item.key)}.</span> ${esc(item.text)}</div>`).join('')}</div>`
    : '';
  return `<section class="q">
  <div class="stem"><span class="qnum">${number}.</span> ${esc(question.questionStem)}${question.points === 3 ? ' <span class="pts">[3점]</span>' : ''}</div>
  ${blocks ? `<div class="stimulus">${blocks}</div>` : ''}
  ${combo}
  ${choicesHtml(question)}
</section>`;
}

function answersHtml(exam) {
  const key = exam.questions.map((q) => `<td><b>${q.orderIndex}</b></td><td>${NUMERALS[q.correctAnswer - 1]}</td><td>${q.points}</td>`);
  const rows = [];
  for (let index = 0; index < key.length; index += 5) rows.push(`<tr>${key.slice(index, index + 5).join('')}</tr>`);
  const explanations = exam.questions.map((q) => {
    const v2 = q.explanation.conceptHighlightV2;
    const judgment = esc(q.explanation.judgment).replace(/\[(출제 의도|해설|오답 피하기|계산 근거)\]/g, '<b>[$1]</b>').replace(/\n/g, '<br>');
    const options = v2 ? `<ul class="opt">${v2.optionAnalysis.map((o) => `<li><b>${esc(o.optionKey ?? NUMERALS[o.optionNum - 1])} ${o.verdict}</b> ${esc(o.reasoning)}</li>`).join('')}</ul>` : '';
    return `<div class="exp"><div class="exp-head">${q.orderIndex}번 · 정답 ${NUMERALS[q.correctAnswer - 1]} · ${q.points}점 · ${esc(q.unitNumber)}단원 ${esc(q.unitTitle)} — ${esc(q.targetConcept)}</div><div class="exp-body">${judgment}</div>${options}${v2 ? `<div class="takeaway">핵심: ${esc(v2.takeaway)}</div>` : ''}</div>`;
  }).join('');
  return `<div class="answers"><h2>정답</h2><table class="key"><tr>${'<th>번호</th><th>정답</th><th>배점</th>'.repeat(Math.min(5, exam.questions.length))}</tr>${rows.join('')}</table><h2>해설</h2>${explanations}</div>`;
}

const CSS = `
@page { size: A4; margin: 14mm 12mm 14mm 12mm; }
* { box-sizing: border-box; }
body { font-family: 'AppleMyungjo', 'Batang', 'Nanum Myeongjo', 'Noto Serif KR', serif; font-size: 9.6pt; line-height: 1.55; color: #000; margin: 0; }
.header { text-align: center; border-bottom: 2.2px solid #000; padding-bottom: 5px; margin-bottom: 8px; }
.header .area { font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; font-size: 19pt; font-weight: 800; letter-spacing: 2px; }
.header .sub { font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; font-size: 10pt; margin-top: 2px; }
.header .notice { font-size: 8pt; color: #444; margin-top: 2px; }
.paper { column-count: 2; column-gap: 9mm; column-rule: 0.8px solid #000; }
.q { break-inside: avoid; margin: 0 0 16px 0; }
.stem { margin-bottom: 6px; text-align: justify; }
.qnum { font-weight: 700; font-family: 'Apple SD Gothic Neo', sans-serif; }
.pts { font-size: 8.6pt; }
.stimulus { border: 0.8px solid #000; padding: 6px 8px; margin: 4px 0 6px; }
.text { margin: 2px 0; text-align: justify; }
.dialogue .line { display: flex; gap: 6px; margin: 3px 0; }
.dialogue .speaker { font-weight: 700; white-space: nowrap; font-family: 'Apple SD Gothic Neo', sans-serif; }
.dialogue .speaker::after { content: ' :'; }
.table-wrap { margin: 5px 0; }
.table-title { text-align: center; font-weight: 700; margin-bottom: 3px; }
table { border-collapse: collapse; width: 100%; font-size: 8.8pt; }
th, td { border: 0.7px solid #000; padding: 2px 4px; text-align: center; vertical-align: middle; }
th { background: #eee; font-weight: 600; }
.figure { text-align: center; margin: 4px 0; }
.figure img { max-width: 100%; max-height: 62mm; }
.combo { border: 0.8px solid #000; padding: 4px 8px 5px; margin: 6px 0; position: relative; }
.combo-title { text-align: center; font-size: 9pt; margin: -1px 0 3px; letter-spacing: 3px; }
.combo-item { margin: 2px 0; padding-left: 1.4em; text-indent: -1.4em; text-align: justify; }
.key { font-weight: 700; }
.choices { display: flex; flex-wrap: wrap; margin-top: 4px; }
.choices.row5 { justify-content: space-between; }
.choices.row5 .choice { white-space: nowrap; padding-right: 4px; }
.choices.row3 .choice { width: 33.3%; white-space: nowrap; }
.choices.col1 .choice { width: 100%; padding-left: 1.3em; text-indent: -1.3em; }
.choice { margin: 1px 0; }
.choice-table { margin-top: 4px; }
.choice-table td.num { width: 2em; border-left: none; }
.answers { break-before: page; column-count: 1; font-family: 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif; font-size: 9pt; }
.answers h2 { font-size: 12pt; border-bottom: 1.5px solid #000; padding-bottom: 2px; }
.key td, .key th { padding: 3px; }
.exp { break-inside: avoid; margin: 0 0 10px; border-left: 3px solid #999; padding-left: 8px; }
.exp-head { font-weight: 700; margin-bottom: 2px; }
.opt { margin: 3px 0; padding-left: 16px; }
.takeaway { color: #333; font-style: italic; }
.footer { text-align: center; font-size: 8pt; margin-top: 8px; color: #444; }
`;

function buildHtml(exam, withAnswers) {
  const [area, course] = SUBJECT_AREA[exam.subject] || ['직업탐구 영역', exam.subject];
  const total = exam.questions.reduce((sum, q) => sum + q.points, 0);
  return `<!DOCTYPE html><html lang="ko"><head><meta charset="utf-8"><title>${esc(exam.title)}</title><style>${CSS}</style></head><body>
<div class="header"><div class="area">${area}(${course})</div><div class="sub">${esc(exam.title)} · ${exam.questions.length}문항 · ${total}점</div><div class="notice">AI 출제 모의 문항(문항별 2점·3점) — 한국교육과정평가원 공식 문항이 아님</div></div>
<div class="paper">${exam.questions.map((q) => questionHtml(q, q.orderIndex)).join('\n')}</div>
${withAnswers ? answersHtml(exam) : ''}
</body></html>`;
}

function findChrome(explicit) {
  const candidates = [
    explicit,
    process.env.CHROME_PATH,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ].filter(Boolean);
  return candidates.find((candidate) => fs.existsSync(candidate));
}

function exportPdf(work, options = {}) {
  const examFile = path.join(work, 'exam.json');
  if (!fs.existsSync(examFile)) throw new Error(`${examFile}가 없습니다. 먼저 export를 실행하십시오.`);
  const exam = JSON.parse(fs.readFileSync(examFile, 'utf8'));
  const htmlFile = path.resolve(work, 'exam.html');
  const pdfFile = path.resolve(work, 'exam.pdf');
  fs.writeFileSync(htmlFile, buildHtml(exam, options.answers !== false));
  const chrome = findChrome(options.chrome);
  if (!chrome) return { htmlFile, pdfFile: null, reason: 'Chrome/Chromium/Edge를 찾지 못했습니다(CHROME_PATH 환경 변수나 --chrome으로 지정). exam.html을 브라우저에서 열어 PDF로 인쇄할 수 있습니다.' };
  const result = spawnSync(chrome, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--no-pdf-header-footer',
    `--print-to-pdf=${pdfFile}`, `file://${htmlFile}`,
  ], { encoding: 'utf8', timeout: 120000 });
  if (!fs.existsSync(pdfFile)) return { htmlFile, pdfFile: null, reason: `PDF 생성 실패: ${(result.stderr || '').slice(0, 300)}` };
  return { htmlFile, pdfFile };
}

module.exports = { buildHtml, exportPdf };

if (require.main === module) {
  const [work, ...rest] = process.argv.slice(2);
  if (!work) { console.log('사용법: node pdf.cjs <작업 폴더> [--no-answers] [--chrome <path>]'); process.exit(1); }
  const chromeAt = rest.indexOf('--chrome');
  const out = exportPdf(work, { answers: !rest.includes('--no-answers'), chrome: chromeAt >= 0 ? rest[chromeAt + 1] : undefined });
  console.log(out.pdfFile ? `PDF: ${out.pdfFile} (HTML: ${out.htmlFile})` : `${out.reason}\nHTML: ${out.htmlFile}`);
}
