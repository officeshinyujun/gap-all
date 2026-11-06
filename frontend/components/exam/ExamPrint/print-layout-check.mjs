#!/usr/bin/env node
/**
 * 인쇄 시험지 레이아웃 점검: 엔진이 그리는 모든 그래프·도식·인물 그림 종류를 왼쪽 단과 오른쪽 단에 각각 놓고
 * 각 문항(.question) 상자가 자기 단 안에 들어가는지, 안의 어떤 요소도 문항 상자를 넘지 않는지,
 * 오른쪽 테두리가 인쇄 영역 경계에서 잘리지 않을 만큼 안쪽에 있는지를 Chromium 레이아웃 좌표로 확인한다.
 *
 * 실행: node components/exam/ExamPrint/print-layout-check.mjs [--out DIR] [--inject-css "CSS"]
 *   --out DIR         모든 종류를 한 시험지에 넣은 PDF·HTML을 DIR에 저장(눈으로 확인용)
 *   --inject-css CSS  점검 대상 CSS 뒤에 덧붙인다(회귀 확인용, 예: ".columns{padding:0!important}")
 * 필요: 저장소 루트 node_modules의 esbuild, playwright(Chromium). 백엔드 그림 렌더러와 프런트엔드 인쇄 HTML을 그대로 쓴다.
 * 실패하면 종료 코드 1.
 */
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const frontend = resolve(here, '../../..');
const repo = resolve(frontend, '..');
const require = createRequire(join(repo, 'package.json'));
const esbuild = require('esbuild');
const { chromium } = require('playwright');

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const outDir = option('--out');
const injectCss = option('--inject-css') ?? '';

/** 그림 명세 표본(모든 종류) → 인쇄 HTML 시험지들을 만드는 번들 진입점 */
const ENTRY = String.raw`
import { renderFigure } from '${repo}/backend/src/exams/generative/figures/figure-svg';
import { parseFigureSpec } from '${repo}/backend/src/exams/generative/figures/figure-spec';
import { buildExamPrintHtml } from '@/components/exam/ExamPrint/exportExam';

const SPECS: Record<string, Record<string, unknown>> = {
  'chart:bar': { id: 'F1', kind: 'chart', chartType: 'bar', title: '〈연도별 신규 채용 인원〉', categories: ['2021년', '2022년', '2023년', '2024년'], series: [{ name: '생산직', values: [120, 90, 150, 135] }, { name: '사무직', values: [60, 75, 40, 85] }, { name: '연구직', values: [20, 35, 45, 30] }], valueAxis: { label: '인원', unit: '명', min: 0, max: 160, step: 40 } },
  'chart:hbar': { id: 'F1', kind: 'chart', chartType: 'hbar', categories: ['금융 및 보험업', '건설업', '제조업', '광업', '농업, 임업 및 어업'], series: [{ name: 'A 지역', values: [13, 7, 15, 17, 48] }, { name: 'B 지역', values: [32, 18, 20, 17, 13] }], valueAxis: { label: '비율', unit: '%', min: 0, max: 50, step: 10 }, percent: true },
  'chart:stacked_bar': { id: 'F1', kind: 'chart', chartType: 'stacked_bar', categories: ['1분기', '2분기', '3분기', '4분기'], series: [{ name: '국내', values: [40, 45, 30, 50] }, { name: '수출', values: [20, 25, 40, 35] }], valueAxis: { label: '매출액', unit: '억 원', min: 0, max: 100, step: 20 } },
  'chart:stacked_hbar': { id: 'F1', kind: 'chart', chartType: 'stacked_hbar', title: '[부문별 응답률]', categories: ['생산 관리 부문', '품질 관리 부문'], series: [{ name: 'CIM 도입', values: [55, 20] }, { name: 'MRP 도입', values: [23, 35] }, { name: 'POP 도입', values: [16, 30] }, { name: '기타', values: [6, 15] }], valueAxis: { label: '응답 비율', unit: '%', min: 0, max: 100, step: 20 }, percent: true },
  'chart:line': { id: 'F1', kind: 'chart', chartType: 'line', categories: ['2021년', '2022년', '2023년'], series: [{ name: 'DO(ppm)', values: [7.4, 8.1, 9.2] }, { name: 'pH', values: [6.3, 7.2, 7.9] }, { name: 'BOD(ppm)', values: [5.8, 5.5, 4.7] }], valueAxis: { label: '측정값', unit: '', min: 4, max: 10, step: 2 } },
  'chart:bar_line': { id: 'F1', kind: 'chart', chartType: 'bar_line', title: '〔항목별 부적합 수량 및 누적 비율〕', categoryLabel: '항목', categories: ['재료', '방법', '작업자', '장비'], series: [{ name: '부적합 수량', values: [30, 10, 7, 3], render: 'bar', axis: 'left' }, { name: '누적 비율', values: [60, 80, 94, 100], render: 'line', axis: 'right' }], valueAxis: { label: '부적합 수량', unit: '개', min: 0, max: 40, step: 10 }, secondaryAxis: { label: '누적 비율', unit: '%', min: 0, max: 100, step: 20 } },
  'chart:pie': { id: 'F1', kind: 'chart', chartType: 'pie', title: '(나) 첨단 기술별 산업 재산권 취득 비율', categories: ['나노 기술', '에너지 기술', '환경 기술', '우주 항공 기술'], series: [{ name: '산업 재산권 총 50건 중', values: [50, 30, 10, 10] }], valueAxis: { label: '비율', unit: '%', min: 0, max: 100 } },
  'chart:radar': { id: 'F1', kind: 'chart', chartType: 'radar', title: '[직업기초능력 평가 결과]', categories: ['의사소통', '직업윤리', '자기 개발', '대인 관계', '수리'], series: [{ name: '학생 A', values: [4, 3, 4, 3, 5] }, { name: '학생 B', values: [4, 5, 3, 4, 3] }], valueAxis: { label: '점수', unit: '점', min: 0, max: 5, step: 1 } },
  'chart:gantt': { id: 'F1', kind: 'chart', chartType: 'gantt', title: null, periodLabel: '9월', unit: '일', start: 1, end: 31, statusDay: 20, tasks: [{ name: '시제품 제작 공정', plannedStart: 1, plannedEnd: 12, doneUntil: 10 }, { name: '제품 2', plannedStart: 3, plannedEnd: 25, doneUntil: 22 }, { name: '제품 3', plannedStart: 16, plannedEnd: 31, doneUntil: null }] },
  'chart:control': { id: 'F1', kind: 'chart', chartType: 'control', title: null, xLabel: '일자', yLabel: '통계량', values: [48, 52, 50, 55, 47, 53, 51, 54, 49, 46, 52, 50, 58, 64, 51, 47, 39, 52, 54, 53, 58, 56, 49, 47, 45, 52, 50, 53, 51, 52], center: 50, upper: 60, lower: 40 },
  'chart:scatter': { id: 'F1', kind: 'chart', chartType: 'scatter', title: null, points: 60, panels: [{ title: null, xLabel: '부품 오차', yLabel: '변속기 불량률', correlation: 'strong_positive' }, { title: null, xLabel: '숙련도', yLabel: '변속기 불량률', correlation: 'strong_negative' }] },
  'chart:curve': { id: 'F1', kind: 'chart', chartType: 'curve', title: '■ ○○제품 수명 주기', xLabel: '시기', yLabel: '매출액', preset: 'lifecycle', segments: ['(가)', '(나)', '(다)', '(라)'], xMax: 100, yMax: 100, curves: [] },
  'diagram:flow-vertical': { id: 'F1', kind: 'diagram', diagramType: 'flow', title: null, direction: 'vertical', steps: [{ id: 's1', label: '재고 여유', shape: 'box', yesLabel: null }, { id: 's2', label: '오늘이 월별 마지막 날인가?', shape: 'decision', yesLabel: '예' }, { id: 's3', label: '현재 재고량 파악', shape: 'box', yesLabel: null }, { id: 's4', label: '주문량 계산 (차잇값=목표 재고량－현재 재고량)', shape: 'box', yesLabel: null }, { id: 's5', label: '차잇값>0', shape: 'decision', yesLabel: '예' }, { id: 's6', label: '차잇값만큼 주문', shape: 'box', yesLabel: null }], loops: [{ from: 's2', to: 's1', label: '아니요' }, { from: 's5', to: 's1', label: '아니요' }] },
  'diagram:flow-horizontal': { id: 'F1', kind: 'diagram', diagramType: 'flow', title: null, direction: 'horizontal', steps: [{ id: 's1', label: '방사/방적', shape: 'box', yesLabel: null }, { id: 's2', label: '제직', shape: 'box', yesLabel: null }, { id: 's3', label: '(가)', shape: 'box', yesLabel: null }, { id: 's4', label: '봉제', shape: 'box', yesLabel: null }, { id: 's5', label: '검사 및 출하 준비 공정', shape: 'box', yesLabel: null }, { id: 's6', label: '제품', shape: 'terminal', yesLabel: null }], loops: [] },
  'diagram:network': { id: 'F1', kind: 'diagram', diagramType: 'network', title: null, unit: '분', tasks: [{ id: 'A', name: '현황 분석', duration: 6 }, { id: 'B', name: '실적 수집 연동', duration: 10 }, { id: 'C', name: '자재 계획 모듈', duration: 5 }, { id: 'D', name: '작업 D', duration: 7 }, { id: 'E', name: '통합 시험', duration: 4 }], links: [{ from: 'A', to: 'B' }, { from: 'A', to: 'C' }, { from: 'B', to: 'D' }, { from: 'C', to: 'D' }, { from: 'B', to: 'E' }, { from: 'D', to: 'E' }] },
  'diagram:fishbone': { id: 'F1', kind: 'diagram', diagramType: 'fishbone', title: null, effect: '생산성 저하', categories: [{ name: '자재', causes: ['부품 조달 지연'] }, { name: '작업 절차', causes: ['불필요한 작업 절차가 많음'] }, { name: '장비', causes: ['유지 보수 장기화'] }, { name: '인력', causes: ['작업 미숙'] }, { name: '환경', causes: ['조명 부족'] }, { name: '측정', causes: ['계측기 오차'] }] },
  'diagram:tree-down': { id: 'F1', kind: 'diagram', diagramType: 'tree', title: null, direction: 'down', nodes: [{ id: 'r', label: '공장장', parent: null }, { id: 'a', label: '생산부장', parent: 'r' }, { id: 'b', label: '관리부장', parent: 'r' }, { id: 'c', label: '영업부장', parent: 'r' }, { id: 'd', label: '인사부장', parent: 'r' }, { id: 'a1', label: '직장', parent: 'a' }, { id: 'a2', label: '직장', parent: 'a' }, { id: 'b1', label: '직장', parent: 'b' }, { id: 'c1', label: '직장', parent: 'c' }, { id: 'd1', label: '직장', parent: 'd' }, { id: 'd2', label: '직장', parent: 'd' }, { id: 'd3', label: '직장', parent: 'd' }] },
  'diagram:tree-right': { id: 'F1', kind: 'diagram', diagramType: 'tree', title: null, direction: 'right', nodes: [{ id: 'r', label: '회사', parent: null }, { id: 'a', label: '합명 회사', parent: 'r' }, { id: 'b', label: '합자 회사', parent: 'r' }, { id: 'c', label: '(가)', parent: 'r' }, { id: 'd', label: '유한 책임 회사', parent: 'r' }, { id: 'e', label: '주식회사', parent: 'r' }] },
  'diagram:cycle': { id: 'F1', kind: 'diagram', diagramType: 'cycle', title: null, center: '안전 관리 사이클', steps: ['P 계획', 'D 실시', 'C (가)', 'A 조치', '표준화', '교육 훈련'] },
  'diagram:venn-overlap': { id: 'F1', kind: 'diagram', diagramType: 'venn', title: null, mode: 'overlap', labels: ['(가)', '(나)'], onlyFirst: ['운영 경비 일부를 산업체가 부담', '유형: 채용조건형, 재교육형'], onlySecond: ['학교 밖 다양한 학습과 자격을 학점으로 인정'], both: ['일과 학업 병행 가능'] },
  'diagram:venn-nested': { id: 'F1', kind: 'diagram', diagramType: 'venn', title: null, mode: 'nested', labels: ['(가) 세분류', '(나) 능력단위', '(다) 능력단위 요소'], onlyFirst: null, onlySecond: null, both: null },
  'diagram:relation': { id: 'F1', kind: 'diagram', diagramType: 'relation', title: '노사 관계의 기본 구조', layout: 'circle', nodes: [{ id: 'g', label: '(가)' }, { id: 'l', label: '(나)' }, { id: 'm', label: '(다)' }], links: [{ from: 'l', to: 'g', label: '노동정책 건의', arrow: 'forward' }, { from: 'g', to: 'l', label: '조정, 중재, 지원', arrow: 'forward' }, { from: 'm', to: 'g', label: '경영정책 건의', arrow: 'forward' }, { from: 'g', to: 'm', label: '조정, 중재, 알선', arrow: 'forward' }, { from: 'm', to: 'l', label: '임금 제공', arrow: 'forward' }, { from: 'l', to: 'm', label: '근로 제공', arrow: 'forward' }] },
  'diagram:relation-hub': { id: 'F1', kind: 'diagram', diagramType: 'relation', title: null, layout: 'hub', nodes: [{ id: 'c', label: '생산 혁신 전략' }, { id: 'a', label: '[조직 구성] 현장 요구 사항을 반영하기 위해 한시적 TFT 구성' }, { id: 'b', label: '[공정 혁신] 불필요한 공정 제거' }, { id: 'd', label: '[설비 혁신] 자동화 설비 도입' }, { id: 'e', label: '[품질 혁신] 불량 원인 분석' }, { id: 'f', label: '[인력 혁신] 다기능 작업자 육성' }], links: [{ from: 'c', to: 'a', label: null, arrow: 'none' }, { from: 'c', to: 'b', label: null, arrow: 'none' }, { from: 'c', to: 'd', label: null, arrow: 'none' }, { from: 'c', to: 'e', label: null, arrow: 'none' }, { from: 'c', to: 'f', label: null, arrow: 'none' }] },
  'diagram:matrix': { id: 'F1', kind: 'diagram', diagramType: 'matrix', title: '조하리의 창', xAxis: { label: '자신에 대해', low: '안다', high: '모른다' }, yAxis: { label: '타인이 나에 대해', low: '모른다', high: '안다' }, quadrants: ['열린 창', '보이지 않는 창', '숨겨진 창', '미지의 창'], points: [{ label: 'A', x: 3, y: 7 }] },
  'diagram:nesting': { id: 'F1', kind: 'diagram', diagramType: 'nesting', title: null, unit: 'cm', plans: [{ label: '1안', sheetWidth: 80, sheetHeight: 40, diameter: 20, rows: [4, 4], stagger: false }, { label: '2안', sheetWidth: 80, sheetHeight: 40, diameter: 14, rows: [5, 5, 5], stagger: true }] },
  'scene:pair': { id: 'F1', kind: 'scene', layout: 'pair', people: [{ speaker: '기자', role: 'reporter', gender: 'female', age: 'adult' }, { speaker: 'A 씨', role: 'executive', gender: 'male', age: 'adult' }] },
  'scene:presenter': { id: 'F1', kind: 'scene', layout: 'presenter', people: [{ speaker: '학생', role: 'student', gender: 'female', age: 'teen' }] },
  'scene:single': { id: 'F1', kind: 'scene', layout: 'single', people: [{ speaker: 'A 씨', role: 'chef', gender: 'male', age: 'senior' }] },
};

const OPTIONS = ['① ㄱ', '② ㄴ', '③ ㄱ, ㄷ', '④ ㄴ, ㄷ', '⑤ ㄱ, ㄴ, ㄷ'];
const COMBO = { title: '<보기>', items: [{ key: 'ㄱ', text: '그림의 수치를 계산하여 판단하는 진술이다.' }, { key: 'ㄴ', text: '그림의 단계와 관계를 개념에 연결하여 판단하는 진술이다.' }, { key: 'ㄷ', text: '그림에 드러나지 않은 조건을 추론하는 진술이다.' }] };
const LONG = '○○기업은 공정을 점검하고 결과를 아래와 같이 정리하였다. 담당자는 다음 분기 개선 계획을 세우려고 자료를 분석하였으며, 일부 항목은 비워 두었다.';

function item(index: number, type: string | null) {
  const figures: Record<string, unknown> = {};
  const blocks: unknown[] = [{ type: 'text', text: type === null ? LONG + ' ' + LONG : LONG }];
  if (type !== null) {
    const spec = parseFigureSpec(SPECS[type]);
    if (typeof spec === 'string') throw new Error(type + ': ' + spec);
    figures.F1 = renderFigure(spec);
    blocks.push({ type: 'figure', figure_id: 'F1' });
    if (type.startsWith('scene')) blocks.push({ type: 'dialogue', lines: [{ speaker: '기자', text: '질문입니다.' }, { speaker: 'A 씨', text: LONG }] });
  }
  return {
    id: 'item-' + index,
    orderIndex: index,
    question: {
      metadata: { unit_name: '', target_concept: type ?? 'filler', item_type: '', recommended_template: 'TPL_SOURCE_BLOCKS' },
      render_ready: { question_stem: '다음 자료에 대한 설명으로 옳은 것만을 <보기>에서 있는 대로 고른 것은? [3점]', stimulus_data: { blocks, figures, choice_table: null }, options_list: OPTIONS },
      correct_answer: 3,
      combo_block: COMBO,
    },
  };
}

const sheet = (title: string, types: (string | null)[]) => buildExamPrintHtml({
  title, sourceType: 'ai_generative', subjectName: '공업 일반', difficulty: 'HIGH', unitRange: '점검',
  items: types.map((type, index) => item(index + 1, type)) as never,
});

export function buildSheets() {
  const types = Object.keys(SPECS);
  return {
    types,
    // 종류마다: 왼쪽 단에 그림 문항, 오른쪽 단에 그림 문항(나머지 단은 그림 없는 문항)
    forced: types.flatMap((type) => [
      { type, column: 0, html: sheet(type, [type, null]) },
      { type, column: 1, html: sheet(type, [null, type]) },
    ]),
    // 눈으로 확인용: 모든 종류를 두 번(순서를 엇갈려) 흘려 넣은 시험지
    all: sheet('모든 그림 종류', [...types, ...types.slice(1), types[0]]),
  };
}
`;

const work = mkdtempSync(join(tmpdir(), 'print-layout-'));
try {
  const bundle = join(work, 'sheets.cjs');
  await esbuild.build({
    stdin: { contents: ENTRY, loader: 'tsx', resolveDir: frontend, sourcefile: 'print-layout-entry.tsx' },
    bundle: true,
    platform: 'node',
    format: 'cjs',
    jsx: 'automatic',
    outfile: bundle,
    logLevel: 'error',
    alias: { '@': frontend, '@shared': join(frontend, 'shared') },
    define: { 'import.meta.env': '{}' },
    tsconfig: join(frontend, 'tsconfig.json'),
  });
  const { buildSheets } = require(bundle);
  const { types, forced, all } = buildSheets();

  const MM = 96 / 25.4;
  const CONTENT_WIDTH = 186 * MM; // A4 210mm − 좌우 여백 12mm × 2(examPrintStyles @page)
  const EDGE_SAFETY = 0.25 * MM; // 오른쪽 테두리가 인쇄 영역 경계에서 반올림으로 잘리지 않을 여유
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: Math.round(CONTENT_WIDTH), height: 1200 } });
  await page.emulateMedia({ media: 'print' });
  const failures = [];
  const seen = new Map(types.map((type) => [type, new Set()]));
  const extraCss = `.columns > .question + .question { break-before: column; }${injectCss}`;
  for (const entry of forced) {
    await page.setContent(entry.html.replace('</style>', `${extraCss}</style>`), { waitUntil: 'load' });
    const result = await page.evaluate(({ edgeSafety }) => {
      const columns = document.querySelector('.columns');
      const rect = columns.getBoundingClientRect();
      const style = getComputedStyle(columns);
      const left = rect.left + parseFloat(style.paddingLeft);
      const inner = rect.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const gap = parseFloat(style.columnGap);
      const width = (inner - gap) / 2;
      const bounds = [[left, left + width], [left + width + gap, left + 2 * width + gap]];
      const contentRight = document.documentElement.clientWidth;
      return [...document.querySelectorAll('.columns > .question')].map((question) => {
        const box = question.getBoundingClientRect();
        const column = box.left >= bounds[1][0] - 1 ? 1 : 0;
        const [colLeft, colRight] = bounds[column];
        const problems = [];
        if (box.left < colLeft - 0.5) problems.push(`left ${box.left.toFixed(1)} < column ${colLeft.toFixed(1)}`);
        if (box.right > colRight + 0.5) problems.push(`right ${box.right.toFixed(1)} > column ${colRight.toFixed(1)}`);
        if (box.right > contentRight - edgeSafety) problems.push(`right ${box.right.toFixed(1)} within ${edgeSafety.toFixed(1)}px of the printable edge ${contentRight}`);
        if (question.scrollWidth > question.clientWidth + 1) problems.push(`scrollWidth ${question.scrollWidth} > ${question.clientWidth}`);
        for (const element of question.querySelectorAll('*')) {
          if (element.namespaceURI !== 'http://www.w3.org/1999/xhtml' && element.tagName !== 'svg') continue;
          const inside = element.getBoundingClientRect();
          if (inside.width === 0 && inside.height === 0) continue;
          if (inside.right > box.right + 0.5 || inside.left < box.left - 0.5) {
            problems.push(`<${element.tagName.toLowerCase()} class="${element.getAttribute('class') ?? ''}"> ${inside.left.toFixed(1)}-${inside.right.toFixed(1)} outside question ${box.left.toFixed(1)}-${box.right.toFixed(1)}`);
          }
        }
        return { column, figure: question.querySelector('.figure-svg') !== null, problems };
      });
    }, { edgeSafety: EDGE_SAFETY });
    for (const question of result) {
      if (question.figure) seen.get(entry.type).add(question.column);
      for (const problem of question.problems) failures.push(`${entry.type} (column ${question.column === 0 ? 'left' : 'right'}): ${problem}`);
    }
  }
  for (const [type, columns] of seen) {
    if (columns.size !== 2) failures.push(`${type}: figure item did not land in both columns (${[...columns].join(',')})`);
  }
  if (outDir !== undefined) {
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, 'all-types.html'), all);
    const printPage = await (await browser.newContext({ javaScriptEnabled: false })).newPage();
    await printPage.setContent(all.replace('</style>', `${injectCss}</style>`), { waitUntil: 'networkidle', timeout: 60000 });
    writeFileSync(join(outDir, 'all-types.pdf'), await printPage.pdf({ preferCSSPageSize: true, printBackground: true }));
  }
  await browser.close();
  const checked = forced.length;
  if (failures.length > 0) {
    console.error(`✗ print layout: ${failures.length} problem(s) in ${checked} sheets (${types.length} figure types × 2 columns)`);
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exitCode = 1;
  } else {
    console.log(`✓ print layout: ${types.length} figure types × 2 columns (${checked} sheets) — every question stays inside its column and ${(EDGE_SAFETY / MM).toFixed(2)}mm inside the printable edge`);
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}
