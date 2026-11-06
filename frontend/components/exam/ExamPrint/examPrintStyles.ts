/**
 * 인쇄용 시험지 스타일(수능·모의평가 문제지 지면 기준).
 * 앱 테마(다크 모드 등)와 무관한 종이 출력이므로 앱 토큰 대신 이 문서 전용 인쇄 토큰을 :root에 둔다.
 */
export const EXAM_PRINT_FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@500;700;900&family=Noto+Serif+KR:wght@400;700&display=block';

export const EXAM_PRINT_CSS = `
:root {
  --ink: #000;
  --paper: #fff;
  --rule: #000;
  --muted: #444;
  --shade: #f1f1f1;
  --desk: #888;
  --serif: 'Noto Serif KR', 'AppleMyungjo', 'Batang', 'Nanum Myeongjo', serif;
  --sans: 'Noto Sans KR', 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif;
}

@page {
  size: A4;
  margin: 13mm 12mm 15mm;
  @bottom-center {
    content: counter(page) " / " counter(pages);
    font-family: 'Noto Sans KR', sans-serif;
    font-size: 8pt;
  }
}

* { box-sizing: border-box; }

html, body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  -webkit-print-color-adjust: exact;
  print-color-adjust: exact;
}

body {
  font-family: var(--serif);
  font-size: 9.4pt;
  line-height: 1.56;
  letter-spacing: -0.01em;
  /* 실제 시험지처럼 음절 단위로 줄을 바꿔 양쪽 맞춤 간격이 벌어지지 않게 한다. */
  word-break: normal;
  line-break: strict;
  overflow-wrap: anywhere;
}
.nobr { white-space: nowrap; }

/* 머리글: 1쪽 위쪽 */
.sheet-header {
  font-family: var(--sans);
  border-bottom: 1.6pt solid var(--rule);
  padding-bottom: 2.4mm;
  margin-bottom: 4mm;
}
.header-top {
  display: flex;
  justify-content: center;
  align-items: baseline;
  position: relative;
  font-size: 12pt;
  font-weight: 500;
}
.header-page {
  position: absolute;
  right: 0;
  top: -1mm;
  font-family: var(--serif);
  font-size: 24pt;
  font-weight: 700;
}
.header-title {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6mm;
  margin: 1mm 0 2.5mm;
}
.header-title h1 {
  margin: 0;
  font-size: 25pt;
  font-weight: 900;
  letter-spacing: -0.02em;
}
.header-title .subject {
  font-size: 18pt;
  font-weight: 700;
  margin-left: 1mm;
}
.period {
  border: 1pt solid var(--rule);
  border-radius: 999px;
  padding: 0.6mm 3.5mm;
  font-size: 11pt;
  font-weight: 700;
}
.header-fields {
  display: flex;
  justify-content: center;
  gap: 5mm;
}
.field {
  display: inline-flex;
  border: 0.8pt solid var(--rule);
  font-size: 10pt;
}
.field b {
  font-weight: 700;
  padding: 0.6mm 2.5mm;
  border-right: 0.8pt solid var(--rule);
}
.field i { display: inline-block; }
.field-name i { width: 40mm; }
.field-number i { width: 52mm; }
.header-meta {
  margin-top: 2mm;
  text-align: center;
  font-size: 7.6pt;
  color: var(--muted);
}

/* 두 단: 왼쪽 단을 채운 뒤 오른쪽 단으로 이어진다.
   오른쪽 단 상자의 오른쪽 테두리가 인쇄 영역 경계에 딱 붙으면 Chromium이 반올림 오차로 잘라 내므로 양옆을 조금 들인다. */
.columns {
  column-count: 2;
  column-gap: 9mm;
  column-rule: 0.7pt solid var(--rule);
  column-fill: balance;
  padding: 0 0.5mm;
}

/* 문항 안 어떤 내용(그림·표·긴 낱말)도 단 너비를 넘지 않게 한다. */
.question {
  break-inside: avoid;
  page-break-inside: avoid;
  margin: 0 0 6.5mm;
  min-width: 0;
  max-width: 100%;
}
.question .stimulus,
.question .view {
  min-width: 0;
  max-width: 100%;
}

.stem {
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: 1.6mm;
  margin-bottom: 2.2mm;
  text-align: justify;
}
.qnum {
  font-family: var(--sans);
  font-weight: 700;
  font-size: 10.2pt;
  line-height: 1.5;
}

/* 제시문 상자 */
.stimulus {
  border: 0.6pt solid var(--rule);
  padding: 2.2mm 2.8mm;
  margin: 0 0 2.4mm;
  text-align: justify;
}
.para {
  margin: 0;
  white-space: pre-line;
}
.para + .para { margin-top: 1mm; }
.para-strong { font-weight: 700; }
.doc-heading {
  text-align: center;
  font-weight: 700;
  margin-bottom: 1.4mm;
}
.doc-meta {
  text-align: right;
  font-size: 8pt;
  color: var(--muted);
}
.note {
  margin: 1mm 0 0;
  font-size: 8pt;
}
.plain-list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.plain-list li {
  padding-left: 1em;
  text-indent: -1em;
}

.dialogue {
  display: grid;
  grid-template-columns: max-content 1fr;
  column-gap: 1.4mm;
  row-gap: 1mm;
}
.speaker { white-space: nowrap; }
.utterance { white-space: pre-line; }

.steps {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6mm;
  text-align: center;
}
.steps-row {
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: center;
}
.step-arrow { font-family: var(--sans); }

.table-wrap { margin: 1.4mm 0; }
.table-title {
  text-align: center;
  font-weight: 700;
  margin-bottom: 0.8mm;
}
.table-caption {
  font-size: 8pt;
  margin-top: 0.6mm;
}
table {
  width: 100%;
  border-collapse: collapse;
  font-size: 8.6pt;
  line-height: 1.45;
}
th, td {
  border: 0.5pt solid var(--rule);
  padding: 0.7mm 1.2mm;
  vertical-align: middle;
  white-space: pre-line;
  /* 좁은 칸에서 "시기"가 "시/기"로 갈리지 않게 표 안은 어절 단위로 바꾸고 양쪽 맞춤을 끈다. */
  word-break: keep-all;
  overflow-wrap: normal;
  text-align: left;
}
th {
  font-weight: 400;
  background: var(--shade);
  text-align: center;
}
td:first-child { text-align: center; min-width: 3.4em; }

.figure {
  display: block;
  max-width: 100%;
  max-height: 62mm;
  margin: 1.2mm auto;
  object-fit: contain;
}
/* 인라인 SVG 그림: 어떤 그림 종류도 단 너비를 넓히지 못하게 폭을 100%로 묶고 넘치는 것은 자른다. */
.figure-svg {
  display: block;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  margin: 1.2mm 0;
  overflow: hidden;
  break-inside: avoid;
}
/* 그래프·도식: 단 너비에 맞추되 기존 그림 규칙(최대 62mm 높이)을 지킨다(높이에 걸리면 가운데 정렬로 줄어든다). */
.figure-svg svg {
  display: block;
  width: 100%;
  max-width: 100%;
  height: auto;
  max-height: 62mm;
  margin: 0 auto;
}
/* 인물 그림: 장식용이라 기출 삽화 크기(높이 약 34mm)로 */
.figure-svg[data-figure-kind="illustration"] svg {
  width: 100%;
  height: 34mm;
  max-width: 100%;
}
.figure-missing {
  border: 0.5pt dashed var(--muted);
  color: var(--muted);
  font-size: 7.8pt;
  padding: 1.2mm 2mm;
  margin: 1.2mm 0;
}

/* <보 기>: 제목이 상자 윗선 가운데에 걸친다 */
.view {
  position: relative;
  border: 0.6pt solid var(--rule);
  padding: 3mm 2.8mm 1.8mm;
  margin: 4mm 0 2.4mm;
}
.view-title {
  position: absolute;
  top: 0;
  left: 50%;
  transform: translate(-50%, -55%);
  background: var(--paper);
  padding: 0 1.6mm;
  line-height: 1;
}
.view-item {
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: 1.2mm;
  text-align: justify;
}

/* 선지 */
.choices {
  list-style: none;
  margin: 0;
  padding: 0;
}
.choices li {
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: 1mm;
}
.choices-inline {
  display: flex;
  justify-content: space-between;
  column-gap: 2mm;
}
.choices-triple {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  row-gap: 0.4mm;
}
.choices-stack li { margin-bottom: 0.3mm; }
.choice-marker { font-family: var(--serif); }

.choice-table { margin-top: 1mm; }
.choice-table td { text-align: center; }

/* 정답표: 새 쪽 */
.answer-key {
  break-before: page;
  page-break-before: always;
  font-family: var(--sans);
}
.answer-key h2 {
  text-align: center;
  font-size: 15pt;
  margin: 4mm 0 5mm;
}
.answer-key table { width: auto; margin: 0 auto 3mm; font-size: 10pt; }
.answer-key th { width: 16mm; font-weight: 700; }
.answer-key td { width: 14mm; text-align: center; padding: 1.4mm 0; }
.answer-key .answer-num { background: var(--shade); }

/* 정답과 해설: 정답표 아래에서 이어지는 두 단 해설지 */
.explanations {
  font-family: var(--sans);
  font-size: 7.8pt;
  line-height: 1.5;
  margin-top: 8mm;
}
.explanations h2 {
  text-align: center;
  font-size: 15pt;
  margin: 0 0 4mm;
}
.explain-columns {
  column-count: 2;
  column-gap: 7mm;
  column-rule: 0.5pt solid var(--rule);
}
.explain {
  margin: 0 0 4mm;
  padding-bottom: 3mm;
  border-bottom: 0.3pt solid var(--rule);
}
.explain-head {
  display: flex;
  align-items: baseline;
  gap: 2.5mm;
  padding-bottom: 1mm;
  margin-bottom: 1mm;
  border-bottom: 0.6pt solid var(--rule);
  break-after: avoid;
  page-break-after: avoid;
}
.explain-num { font-size: 10pt; font-weight: 900; }
.explain-answer { font-weight: 700; }
.explain-concept { color: var(--muted); }
.explain-label {
  font-weight: 700;
  margin: 1.6mm 0 0.6mm;
  break-after: avoid;
  page-break-after: avoid;
}
.explain-steps { list-style: none; margin: 0; padding: 0; }
.explain-steps li { display: flex; gap: 1.6mm; margin-bottom: 0.5mm; break-inside: avoid; }
.explain-step-num {
  flex: none;
  width: 3.6mm;
  height: 3.6mm;
  border-radius: 50%;
  background: var(--ink);
  color: var(--paper);
  font-size: 6.4pt;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  margin-top: 0.2mm;
}
.explain-clue {
  background: var(--shade);
  padding: 1mm 1.6mm;
  margin-bottom: 0.8mm;
  break-inside: avoid;
}
.explain-clue mark {
  background: none;
  color: var(--ink);
  font-weight: 700;
  border-bottom: 0.4mm solid var(--ink);
}
.explain-clue p { margin: 0.4mm 0 0; color: var(--muted); }
.explain-takeaway, .explain-text { margin: 0; }
.explain-option {
  display: flex;
  gap: 1.6mm;
  padding: 0.6mm 1.2mm;
  border: 0.3pt solid var(--shade);
  margin-bottom: 0.6mm;
  break-inside: avoid;
}
.explain-option.is-true { border-color: var(--ink); }
.explain-option-key { flex: none; width: 3.6mm; font-weight: 700; }
.explain-verdict { flex: none; width: 2.6mm; font-weight: 900; }

@media screen {
  body { background: var(--desk); }
  .sheet {
    width: 210mm;
    margin: 0 auto;
    padding: 13mm 12mm;
    background: var(--paper);
  }
}
`;
