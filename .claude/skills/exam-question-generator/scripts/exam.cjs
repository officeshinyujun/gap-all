#!/usr/bin/env node
/* eslint-disable */
/**
 * 수능 직업탐구(공업 일반·성공적인 직업생활) 문항 출제 CLI — exam-question-generator 스킬용.
 *
 * 출제·검토 글쓰기는 이 스킬을 쓰는 에이전트가 하고, 이 CLI는 결정론적 부분만 맡는다:
 *   plan    출제 계획(형식·정답 위치·배점·단원 특징 계산 자료를 서버 규칙으로 확정) + 문항별 출제 지시서
 *   check   에이전트가 쓴 후보 JSON 검증(문체 보정·계산값 반영·형식·노출·길이·중복) → 통과 시 검토 지시서
 *   review  정답을 모르는 검토 결과 판정(정답 일치·모호성·법적 정합성·난도) → 통과/재출제
 *   status  진행 상황
 *   refresh 엔진 갱신 뒤 통과 문항의 해설만 다시 조립(학생에게 보이는 내용이 바뀌면 거부 → 재검토 필요)
 *   refill  3회 모두 반려되어 제외(failed)된 문항을 같은 자리·형식·정답 위치의 새 명세로 다시 연다
 *   export  통과 문항을 앱 형식 JSON(exam.json)과 미리보기(exam.md)로
 *   pdf     exam.json을 2단 시험지 PDF(exam.pdf, 정답·해설 쪽 포함)로 — 헤드리스 Chrome/Chromium/Edge 필요
 *
 * 필요: Node 18+. 외부 패키지·API 키 없음.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const engine = require('./engine/exams/generative/skill/skill-engine.js');

const MAX_ATTEMPTS = 3;
// 반려 방식: 형식 검증 실패와 국소 결함(표기·문구·쉬운 진술·사소한 교과 지적)은 같은 명세로 기존 문항을 고치고(repair),
// 정답 불일치·심각한 모호성처럼 설계가 무너진 경우만 개념·자료를 바꾼 대체 명세(replan)로 새로 쓴다.
const MAX_REFILLS = 2; // 한 자리를 다시 여는 최대 횟수(무한 재출제 방지)

const SUBJECTS = { success: 'success', sungjik: 'success', 성직: 'success', 성공적인직업생활: 'success', kongil: 'kongil', industry: 'kongil', 공일: 'kongil', 공업일반: 'kongil' };
const DIFFICULTIES = { LOW: 'LOW', 하: 'LOW', MIDDLE: 'MIDDLE', 중: 'MIDDLE', HIGH: 'HIGH', 상: 'HIGH', INTERGRATE: 'INTERGRATE', INTEGRATE: 'INTERGRATE', 통합: 'INTERGRATE', ULTRA: 'ULTRA', 초고난도: 'ULTRA', 최상: 'ULTRA' };
const SUBJECT_NAMES = { success: '성공적인 직업생활', kongil: '공업 일반' };

function fail(message) {
  console.error(`오류: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) fail(`알 수 없는 인자: ${token}`);
    const key = token.slice(2);
    const next = rest[index + 1];
    if (next === undefined || next.startsWith('--')) options[key] = true;
    else {
      options[key] = next;
      index += 1;
    }
  }
  return { command, options };
}

const pad = (n) => String(n).padStart(2, '0');
const itemDir = (work, ordinal) => path.join(work, 'items', pad(ordinal));
const planPath = (work) => path.join(work, 'plan.json');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJson = (file, value) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
};

function loadPlan(work) {
  if (!work) fail('--work <작업 폴더>가 필요합니다.');
  if (!fs.existsSync(planPath(work))) fail(`${planPath(work)}가 없습니다. 먼저 plan을 실행하십시오.`);
  return readJson(planPath(work));
}

function findItem(plan, options) {
  const ordinal = Number(options.item);
  const item = plan.items.find((entry) => entry.ordinal === ordinal);
  if (!item) fail(`--item ${options.item}에 해당하는 문항이 없습니다(1~${plan.items.length}).`);
  return item;
}

function briefMarkdown(title, brief, extra = []) {
  return [
    `# ${title}`,
    '',
    ...extra,
    '## 시스템 지시',
    '',
    brief.system,
    '',
    '## 출제 명세',
    '',
    brief.user,
    '',
    '## 출력 JSON 스키마 (이 스키마에 맞는 JSON 객체 하나만 쓰십시오)',
    '',
    '```json',
    JSON.stringify(brief.schema, null, 2),
    '```',
    '',
  ].join('\n');
}

function writeWritingBrief(work, item) {
  const brief = engine.writingBrief(item.spec, item.repairNotes || []);
  const file = path.join(itemDir(work, item.ordinal), 'brief.md');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const repair = item.repairFrom && fs.existsSync(item.repairFrom)
    ? [
        '## 고치기 모드 (처음부터 다시 쓰지 마십시오)',
        '',
        `- 앞 시도 문항: \`${item.repairFrom}\` — 이 JSON을 읽고 **아래 "이전 시도 반려 사유"에 해당하는 부분만** 고쳐 candidate.json으로 저장합니다.`,
        '- 정답 위치·<보기> 참/거짓·계산 자료·개념은 바꾸지 않습니다. 반려 사유와 무관한 부분은 그대로 둡니다(다시 쓰면 새 결함이 생깁니다).',
        '- 고친 진술이 다른 진술·해설(clues·steps·basis)과 어긋나지 않게 함께 맞추십시오.',
        '',
      ]
    : [];
  fs.writeFileSync(file, briefMarkdown(`${item.ordinal}번 문항 출제 지시서 (시도 ${item.attempt}/${MAX_ATTEMPTS}${item.repairFrom ? ', 고치기' : ''})`, brief, [
    `- 결과를 \`${path.join(itemDir(work, item.ordinal), 'candidate.json')}\`에 저장한 뒤 \`check --item ${item.ordinal}\` 명령을 실행합니다.`,
    '- 정답 위치·<보기> 참/거짓·계산 자료는 서버가 정했습니다. 지시서의 지정값을 그대로 따르십시오.',
    '',
    ...repair,
  ]));
  return file;
}

function writeReviewBrief(work, item, question) {
  const brief = engine.reviewBrief(item.spec, question);
  const file = path.join(itemDir(work, item.ordinal), 'review-brief.md');
  fs.writeFileSync(file, briefMarkdown(`${item.ordinal}번 문항 블라인드 검토 지시서`, brief, [
    '- 이 파일만 보고 풀이하십시오. 출제 지시서·후보 JSON·정답을 보지 않은 검토자(가능하면 새 하위 에이전트)가 맡는 것이 원칙입니다.',
    `- 결과 JSON을 \`${path.join(itemDir(work, item.ordinal), 'review.json')}\`에 저장한 뒤 \`review --item ${item.ordinal}\` 명령을 실행합니다.`,
    '',
  ]));
  return file;
}

function savePlan(work, plan) {
  writeJson(planPath(work), plan);
}

function nextAttempt(work, plan, item, notes, fix = 'repair') {
  item.repairNotes = notes;
  if (item.attempt >= MAX_ATTEMPTS) {
    item.status = 'failed';
    savePlan(work, plan);
    return null;
  }
  const previous = path.join(itemDir(work, item.ordinal), `candidate.attempt${item.attempt}.json`);
  item.attempt += 1;
  item.replanned = false;
  item.repairFrom = fix === 'repair' && fs.existsSync(previous) ? previous : undefined;
  if (fix === 'replan') {
    // 설계가 무너진 경우만 형식·정답 위치는 유지하고 개념·자료·소재를 바꾼다(개념 고정 계획이면 개념은 유지하고 자료·소재만).
    const used = plan.items.filter((entry) => entry.status === 'accepted').map((entry) => entry.spec.targetConcept.name);
    item.spec = engine.replanItem(plan.request, item.spec, item.attempt, used);
    // 개념은 바뀌지만 반려 원인(단순 읽기 진술·맥락 불일치 등)은 다음 문항에도 해당하므로 교훈으로 넘긴다.
    item.repairNotes = notes.map((note) => `[앞 명세(다른 개념)에서 반려된 사유 — 같은 실수를 반복하지 마십시오] ${note}`);
    item.replanned = true;
  }
  item.status = 'writing';
  savePlan(work, plan);
  return writeWritingBrief(work, item);
}

/**
 * 학생에게 보이는 내용. 그림은 SVG 바이트가 아니라 명세·설명문으로 비교한다:
 * SVG는 명세로 결정되므로 엔진의 그리기 개선(글꼴 크기 등)은 재검토 없이 반영하고, 명세·수치가 바뀌면 거부한다.
 */
const visiblePart = (question) => {
  const figures = Object.fromEntries(Object.entries(question.stimulusData.figures || {}).map(([id, figure]) => [
    id,
    figure.spec ? { alt: figure.alt, kind: figure.kind, spec: figure.spec } : figure,
  ]));
  return JSON.stringify([question.questionStem, { ...question.stimulusData, figures }, question.optionsList, question.comboBlock, question.correctAnswer]);
};

function commandRefresh(options) {
  const work = options.work;
  const plan = loadPlan(work);
  let refreshed = 0;
  for (const item of plan.items.filter((entry) => entry.status === 'accepted')) {
    const dir = itemDir(work, item.ordinal);
    const before = readJson(path.join(dir, 'question.json'));
    const result = engine.checkCandidate(item.spec, fs.readFileSync(path.join(dir, 'candidate.json'), 'utf8'));
    if (!result.ok) {
      console.log(`✗ ${item.ordinal}번: 새 엔진 검증 실패(${result.issues.map((issue) => issue.code).join(', ')}) — 그대로 둡니다.`);
      continue;
    }
    if (visiblePart(result.question) !== visiblePart(before)) {
      console.log(`✗ ${item.ordinal}번: 학생에게 보이는 내용이 바뀌어 다시 블라인드 검토가 필요합니다 — 그대로 둡니다.`);
      continue;
    }
    writeJson(path.join(dir, 'question.json'), result.question);
    refreshed += 1;
  }
  console.log(`해설 다시 조립: ${refreshed}문항 (엔진 ${engine.SKILL_ENGINE_VERSION})`);
}

function commandRefill(options) {
  const work = options.work;
  const plan = loadPlan(work);
  const targets = options.item ? [findItem(plan, options)] : plan.items.filter((item) => item.status === 'failed');
  if (targets.length === 0) {
    console.log('다시 열 문항이 없습니다(failed 문항 없음).');
    return;
  }
  for (const item of targets) {
    if (item.status !== 'failed') fail(`${item.ordinal}번은 ${item.status} 상태입니다. failed 문항만 다시 열 수 있습니다.`);
    const refills = item.refills ?? 0;
    if (refills >= MAX_REFILLS) {
      console.log(`✗ ${item.ordinal}번은 이미 ${refills}번 다시 열었습니다. 제외된 채로 둡니다.`);
      continue;
    }
    // 시험 안의 모든 개념을 피하고, 형식·정답 위치·배점은 그대로 둔 새 명세(정답 분포가 바뀌지 않게)
    const used = plan.items.map((entry) => entry.spec.targetConcept.name);
    item.history = [...(item.history ?? []), { specId: item.spec.id, concept: item.spec.targetConcept.name, repairNotes: item.repairNotes }];
    item.spec = engine.replanItem(plan.request, item.spec, MAX_ATTEMPTS + refills + 1, used);
    item.refills = refills + 1;
    item.attempt = 1;
    item.status = 'writing';
    item.repairNotes = [];
    item.replanned = true;
    item.repairFrom = undefined;
    const brief = writeWritingBrief(work, item);
    console.log(`↻ ${item.ordinal}번 다시 엶: ${item.spec.unitNumber}단원 [${item.spec.targetConcept.name}] ${item.spec.responseMode}${item.spec.calculation ? `+계산(${item.spec.calculation.kind}/${item.spec.calculation.format})` : ''} → ${brief}`);
  }
  savePlan(work, plan);
}

function commandPlan(options) {
  const work = options.work;
  if (!work) fail('--work <작업 폴더>가 필요합니다.');
  if (fs.existsSync(planPath(work)) && !options.force) fail(`${planPath(work)}가 이미 있습니다. 새로 만들려면 --force.`);
  const subject = SUBJECTS[String(options.subject || '').replace(/\s+/g, '')];
  if (!subject) fail('--subject는 success(성직) 또는 kongil(공일)입니다.');
  const difficulty = DIFFICULTIES[String(options.difficulty || 'MIDDLE').toUpperCase()] || DIFFICULTIES[options.difficulty];
  if (!difficulty) fail('--difficulty는 LOW|MIDDLE|HIGH|INTERGRATE|ULTRA(하|중|상|통합|초고난도)입니다.');
  // 초고난도: 엔진 난이도는 HIGH(전부 3점) + 소거 지름길 없는 선지 조합·계산 고정 진술 없음
  const ultra = difficulty === 'ULTRA' || options.ultra === true;
  const concepts = options.concepts ? String(options.concepts).split(',').map((value) => value.trim()).filter(Boolean) : undefined;
  let request;
  let specs;
  if (options.lock) {
    // 개념 고정 계획: 고른 개념을 모두 넣는다(단원 범위 불필요, 넘나들어도 됨). 반려되어도 개념은 유지된다.
    if (!concepts || concepts.length === 0) fail('--lock에는 --concepts "개념1,개념2,…"가 필요합니다.');
    let planned;
    try {
      planned = engine.planConceptExam({ subject, concepts, count: Number(options.count || concepts.length), difficulty: ultra ? 'HIGH' : difficulty, ultra, seed: options.seed ? String(options.seed) : undefined });
    } catch (error) {
      fail(error.message);
    }
    request = planned.request;
    specs = planned.specs;
    console.log('개념 찾기:');
    for (const entry of planned.resolved) console.log(`  "${entry.query}" → ${entry.unitNumber}단원 [${entry.concept.name}]`);
  } else {
    const [startUnit, endUnit = startUnit] = String(options.units || '').split('-').map(Number);
    request = engine.toPlanRequest({
      subject,
      startUnit,
      endUnit,
      count: Number(options.count || 5),
      difficulty: ultra ? 'HIGH' : difficulty,
      ultra,
      seed: options.seed ? String(options.seed) : undefined,
      concepts,
    });
    specs = engine.planExam(request);
  }
  const plan = {
    engine: engine.SKILL_ENGINE_VERSION,
    createdAt: new Date().toISOString(),
    request,
    items: specs.map((spec) => ({ ordinal: spec.ordinal, spec, attempt: 1, status: 'writing', repairNotes: [] })),
  };
  savePlan(work, plan);
  for (const item of plan.items) writeWritingBrief(work, item);
  console.log(`출제 계획: ${SUBJECT_NAMES[subject]} ${request.startUnitNum}~${request.endUnitNum}단원${options.lock ? '(개념 고정)' : ''}, ${ultra ? '초고난도(ULTRA)' : difficulty}, ${specs.length}문항 → ${work}`);
  for (const item of plan.items) {
    const s = item.spec;
    const figure = s.stimulusShape === 'scene+dialogue' ? ' +인물 그림'
      : s.stimulusShape.startsWith('chart') ? ` +그래프(${s.figureType ?? 'categorical'})`
        : s.stimulusShape.startsWith('diagram') ? ` +도식(${s.figureType ?? 'flow'})` : '';
    const mix = (s.mixConcepts || []).length ? ` +엮기[${s.mixConcepts.map((concept) => `${concept.unitNumber}단원 ${concept.name}`).join(', ')}]` : '';
    console.log(`  ${pad(item.ordinal)}. ${s.unitNumber}단원 [${s.targetConcept.name}]${mix} ${s.responseMode}${s.calculation ? `+계산(${s.calculation.kind}/${s.calculation.format})` : ''}${figure} ${s.points}점 정답 ${s.answerIndex}번 → ${path.join(itemDir(work, item.ordinal), 'brief.md')}`);
  }
}

function commandCheck(options) {
  const work = options.work;
  const plan = loadPlan(work);
  const item = findItem(plan, options);
  if (item.status === 'accepted') fail(`${item.ordinal}번은 이미 통과했습니다.`);
  const file = options.file || path.join(itemDir(work, item.ordinal), 'candidate.json');
  if (!fs.existsSync(file)) fail(`${file}가 없습니다. brief.md대로 후보 JSON을 저장하십시오.`);
  const others = plan.items.filter((entry) => entry.status === 'accepted' && entry.ordinal !== item.ordinal).map((entry) => entry.duplicateText).filter(Boolean);
  const result = engine.checkCandidate(item.spec, fs.readFileSync(file, 'utf8'), others);
  const historyFile = path.join(itemDir(work, item.ordinal), `candidate.attempt${item.attempt}.json`);
  fs.copyFileSync(file, historyFile);
  if (!result.ok) {
    console.log(`✗ ${item.ordinal}번 검증 실패 (시도 ${item.attempt}/${MAX_ATTEMPTS})`);
    for (const issue of result.issues) console.log(`  - [${issue.code}] ${issue.message}`);
    const brief = nextAttempt(work, plan, item, result.issues.map((issue) => issue.message), 'repair');
    console.log(brief ? `→ 고친 지시서: ${brief} (같은 명세 — 앞 시도 문항을 고치기)` : '→ 최대 시도 횟수를 넘겨 제외했습니다. refill로 다시 열 수 있습니다.');
    process.exitCode = 2;
    return;
  }
  item.status = 'awaiting_review';
  item.duplicateText = result.duplicateText;
  writeJson(path.join(itemDir(work, item.ordinal), 'question.json'), result.question);
  savePlan(work, plan);
  const reviewFile = writeReviewBrief(work, item, result.question);
  console.log(`✓ ${item.ordinal}번 검증 통과 → 블라인드 검토 지시서: ${reviewFile}`);
}

function commandReview(options) {
  const work = options.work;
  const plan = loadPlan(work);
  const item = findItem(plan, options);
  if (item.status !== 'awaiting_review') fail(`${item.ordinal}번은 검토 대기 상태가 아닙니다(현재 ${item.status}).`);
  const file = options.file || path.join(itemDir(work, item.ordinal), 'review.json');
  if (!fs.existsSync(file)) fail(`${file}가 없습니다. review-brief.md대로 검토 JSON을 저장하십시오.`);
  const judgement = engine.judgeReview(item.spec, fs.readFileSync(file, 'utf8'));
  fs.copyFileSync(file, path.join(itemDir(work, item.ordinal), `review.attempt${item.attempt}.json`));
  if (judgement.accepted) {
    item.status = 'accepted';
    savePlan(work, plan);
    console.log(judgement.downgraded
      ? `✓ ${item.ordinal}번 통과(3점 기준은 쉬움 → 2점으로 받음. 3점 수는 export가 다른 문항을 올려 맞춤)`
      : `✓ ${item.ordinal}번 통과`);
    return;
  }
  if (judgement.invalid) fail(`검토 JSON 형식 오류: ${judgement.invalid}`);
  console.log(`✗ ${item.ordinal}번 검토 반려 [${judgement.rejection.code}] ${judgement.rejection.message}`);
  const brief = nextAttempt(work, plan, item, judgement.rejection.notes, judgement.rejection.fix);
  console.log(brief ? `→ 고친 지시서: ${brief}${item.replanned ? (item.spec.conceptLocked ? ' (대체 명세 — 개념 유지, 자료·소재를 바꿔 새로 쓰기)' : ' (대체 명세 — 새로 쓰기)') : ' (같은 명세 — 고치기)'}` : '→ 최대 시도 횟수를 넘겨 제외했습니다. refill로 다시 열 수 있습니다.');
  process.exitCode = 2;
}

/** 문항별 다음 할 일(병렬 진행용): 출제자는 write/repair, 검토자는 review, review 명령은 judge, 끝난 문항은 done */
function nextAction(work, item) {
  const dir = itemDir(work, item.ordinal);
  if (item.status === 'accepted') return { action: 'done', file: null };
  if (item.status === 'failed') return { action: 'refill', file: null };
  if (item.status === 'awaiting_review') {
    const reviewFile = path.join(dir, 'review.json');
    const briefFile = path.join(dir, 'review-brief.md');
    return fs.existsSync(reviewFile) && (!fs.existsSync(briefFile) || fs.statSync(reviewFile).mtimeMs > fs.statSync(briefFile).mtimeMs)
      ? { action: 'judge', file: reviewFile }
      : { action: 'review', file: briefFile };
  }
  return { action: item.repairFrom ? 'repair' : 'write', file: path.join(dir, 'brief.md') };
}

function commandStatus(options) {
  const work = options.work;
  const plan = loadPlan(work);
  const counts = {};
  const rows = plan.items.map((item) => {
    counts[item.status] = (counts[item.status] || 0) + 1;
    return { ordinal: item.ordinal, status: item.status, attempt: item.attempt, unit: item.spec.unitNumber, concept: item.spec.targetConcept.name, points: item.spec.points, ...nextAction(work, item) };
  });
  if (options.json) {
    console.log(JSON.stringify({ counts, items: rows }, null, 2));
    return;
  }
  for (const row of rows) {
    console.log(`${pad(row.ordinal)}. ${row.status.padEnd(16)} 시도 ${row.attempt}/${MAX_ATTEMPTS}  다음: ${row.action.padEnd(7)} ${row.unit}단원 [${row.concept}] ${row.points}점${row.file ? `  → ${row.file}` : ''}`);
  }
  console.log(`요약: ${Object.entries(counts).map(([key, value]) => `${key} ${value}`).join(', ')}`);
}

/** 그림: 엔진이 그린 SVG(data URI)를 이미지로 넣고 아래에 설명문(축·단위·수치 전체)을 붙인다. */
function figureMarkdown(id, figure) {
  if (!figure) return `[그림 ${id}]`;
  const alt = String(figure.alt || '').trim();
  const summary = (alt.split(/(?<=\.)\s/u)[0] || `그림 ${id}`).replace(/[[\]]/gu, '');
  const lines = [];
  if (typeof figure.src === 'string' && figure.src !== '') lines.push(`![${summary}](${figure.src})`, '');
  lines.push(`*[${figure.kind === 'chart' ? '그래프' : figure.kind === 'diagram' ? '도식' : '그림'} ${id}] ${alt}*`);
  return lines.join('\n');
}

function blockMarkdown(block, figures = {}) {
  if (block.type === 'text') return block.text;
  if (block.type === 'dialogue') return block.lines.map((line) => `**${line.speaker}** : ${line.text}`).join('  \n');
  if (block.type === 'table') {
    const rows = [...(block.headers || []), ...(block.rows || [])];
    if (rows.length === 0) return '';
    const width = Math.max(...rows.map((row) => row.length));
    const line = (row) => `| ${Array.from({ length: width }, (_, i) => String(row[i] ?? '').replace(/\|/g, '\\|')).join(' | ')} |`;
    return [block.title ? `**${block.title}**` : '', line(rows[0]), `| ${Array(width).fill('---').join(' | ')} |`, ...rows.slice(1).map(line)].filter(Boolean).join('\n');
  }
  if (block.type === 'figure') return figureMarkdown(block.figure_id, figures[block.figure_id]);
  return '';
}

function questionMarkdown(question, number) {
  const lines = [`### ${number}. ${question.questionStem}${question.points === 3 ? ' [3점]' : ''}`, ''];
  const figures = question.stimulusData.figures || {};
  for (const block of question.stimulusData.blocks || []) lines.push(`> ${blockMarkdown(block, figures).split('\n').join('\n> ')}`, '>');
  if (question.comboBlock) {
    lines.push('', '**<보 기>**', '');
    for (const entry of question.comboBlock.items) lines.push(`- ${entry.key}. ${entry.text}`);
  }
  if (question.stimulusData.choice_table) {
    const table = question.stimulusData.choice_table;
    lines.push('', `|  | ${table.headers.join(' | ')} |`, `| --- | ${table.headers.map(() => '---').join(' | ')} |`, ...table.rows.map((row, index) => `| ${'①②③④⑤'[index]} | ${row.join(' | ')} |`));
  } else {
    lines.push('', question.optionsList.join('   '));
  }
  return lines.join('\n');
}

/** 공부 화면 "이 개념이 문제에서 어떻게 나왔나"(conceptHighlightV2)와 같은 순서의 해설 */
function analysisMarkdown(question) {
  const v2 = question.explanation.conceptHighlightV2;
  if (!v2) return [question.explanation.judgment];
  const marker = (option) => option.optionKey ?? '①②③④⑤'[option.optionNum - 1] ?? String(option.optionNum);
  return [
    `**이 개념이 문제에서 어떻게 나왔나** — ${question.targetConcept}`,
    '',
    '풀이 흐름',
    ...v2.solvingFlow.map((step) => `${step.step}. ${step.action}`),
    '',
    '지문 단서',
    ...v2.stimulusClues.map((clue) => `- **“${clue.quote}”** — ${clue.why}`),
    '',
    '선택지 분석',
    ...v2.optionAnalysis.map((option) => `- ${marker(option)} **${option.verdict}** ${option.reasoning}`),
    '',
    `핵심 교훈: ${v2.takeaway}`,
    '',
    '<details><summary>전체 해설 문장</summary>',
    '',
    question.explanation.judgment,
    '',
    '</details>',
  ];
}

function commandExport(options) {
  const work = options.work;
  const plan = loadPlan(work);
  const accepted = plan.items
    .filter((item) => item.status === 'accepted')
    .map((item) => ({ item, question: readJson(path.join(itemDir(work, item.ordinal), 'question.json')) }))
    .sort((left, right) => left.item.spec.unitNumber - right.item.spec.unitNumber || left.item.ordinal - right.item.ordinal);
  if (accepted.length === 0) fail('통과한 문항이 없습니다.');
  // 배점 재배분: 쉬움으로 2점이 된 3점 문항만큼, 3점 기준을 통과한 2점 문항을 체감 난도 순으로 올린다.
  const reviewFile = (ordinal) => path.join(itemDir(work, ordinal), 'review.json');
  const rebalance = engine.rebalancePoints(accepted.map(({ item }) => engine.reviewPoints(
    item.spec, item.ordinal, fs.existsSync(reviewFile(item.ordinal)) ? fs.readFileSync(reviewFile(item.ordinal), 'utf8') : '',
  )));
  const questions = accepted.map(({ item, question }, index) => engine.toAppQuestion(
    item.spec, { ...question, points: rebalance.points.get(item.ordinal) ?? question.points }, index + 1,
  ));
  const request = plan.request;
  const level = request.ultra ? '초고난도' : request.difficulty;
  const title = `${SUBJECT_NAMES[request.subject]} ${request.startUnitNum}~${request.endUnitNum}단원 (AI 출제 ${level})`;
  const exam = {
    title,
    subject: request.subject,
    difficulty: request.ultra ? 'ULTRA' : request.difficulty,
    unitRange: [request.startUnitNum, request.endUnitNum],
    requestedCount: request.questionCount,
    engine: engine.SKILL_ENGINE_VERSION,
    exportedAt: new Date().toISOString(),
    questions,
    answerKey: questions.map((question) => ({ orderIndex: question.orderIndex, correctAnswer: question.correctAnswer })),
  };
  writeJson(path.join(work, 'exam.json'), exam);
  const md = [
    `# ${title}`,
    '',
    `${questions.length}/${request.questionCount}문항 · 엔진 ${engine.SKILL_ENGINE_VERSION}`,
    '',
    ...questions.flatMap((question) => [questionMarkdown(question, question.orderIndex), '']),
    '---',
    '',
    '## 정답과 해설',
    '',
    ...questions.flatMap((question) => [`### ${question.orderIndex}번 정답 ${'①②③④⑤'[question.correctAnswer - 1]}`, '', ...analysisMarkdown(question), '']),
  ].join('\n');
  fs.writeFileSync(path.join(work, 'exam.md'), md);
  const failed = plan.items.filter((item) => item.status !== 'accepted').map((item) => `${item.ordinal}(${item.status})`);
  console.log(`내보냄: ${path.join(work, 'exam.json')}, ${path.join(work, 'exam.md')} — ${questions.length}/${request.questionCount}문항${failed.length ? `, 미완료 ${failed.join(', ')}` : ''}`);
  if (rebalance.changes.length) console.log(`배점 재배분: ${rebalance.changes.join(', ')}`);
  if (rebalance.shortfall > 0) console.log(`주의: 3점으로 올릴 수 있는 문항이 모자라 3점이 계획보다 ${rebalance.shortfall}개 적습니다.`);
}

/** 시험지 PDF: exam.json → 2단 시험지 HTML → 헤드리스 Chrome PDF(정답·해설 쪽 포함, --no-answers면 시험지만) */
function commandPdf(options) {
  const work = options.work;
  if (!work) fail('--work <작업 폴더>가 필요합니다.');
  if (!fs.existsSync(path.join(work, 'exam.json'))) commandExport(options);
  const out = require('./pdf.cjs').exportPdf(work, { answers: options['no-answers'] !== true, chrome: typeof options.chrome === 'string' ? options.chrome : undefined });
  console.log(out.pdfFile ? `PDF: ${out.pdfFile}\nHTML: ${out.htmlFile}` : `${out.reason}\nHTML: ${out.htmlFile}`);
}

const { command, options } = parseArgs(process.argv.slice(2));
const commands = { plan: commandPlan, check: commandCheck, review: commandReview, status: commandStatus, refresh: commandRefresh, refill: commandRefill, export: commandExport, pdf: commandPdf };
if (!commands[command]) {
  console.log('사용법: node exam.cjs <plan|check|review|status|refresh|refill|export|pdf> [옵션]\n  plan   --work DIR --subject success|kongil --units 15-17 --count 5 --difficulty LOW|MIDDLE|HIGH|INTERGRATE|ULTRA [--seed s] [--concepts a,b] [--force]\n  plan   --work DIR --subject success --lock --concepts "개념1,개념2,…" --count 10 --difficulty ULTRA   (개념 고정: 단원을 넘나들며 모든 개념을 넣고, 남는 개념은 함께 엮음)\n  check  --work DIR --item N [--file candidate.json]\n  review --work DIR --item N [--file review.json]\n  status --work DIR [--json]   (문항별 다음 할 일: write·repair → 출제자, review → 검토자, judge → review 명령, refill)\n  refresh --work DIR\n  refill --work DIR [--item N]\n  export --work DIR\n  pdf    --work DIR [--no-answers] [--chrome PATH]');
  process.exit(command ? 1 : 0);
}
commands[command](options);
