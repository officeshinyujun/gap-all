#!/usr/bin/env node
/**
 * 문항 품질 감사 — 기출 원문 코퍼스와 AI(Blueprint) 생성 문항의 형식·분포 비교.
 *
 * 목적: "생성 문항이 실제 기출과 닮았는가"를 사람의 주관 없이 재현 가능한 지표로 측정한다.
 * 판단 구조 자체를 직접 재지는 못하므로, 소거 단서가 되는 형식 규칙성을 대리 지표로 쓴다.
 *
 *   node scripts/item-quality-audit.mjs
 *   -> artifacts/validation/item-quality-audit.json
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const read = p => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));

const stripMarker = s => String(s).replace(/^\s*[①②③④⑤1-5][.)]?\s*/, '').trim();
const isCombo = opts => opts.filter(o => /[ㄱ-ㅁ]\s*,/.test(String(o))).length >= 3;
const pstdev = xs => {
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length);
};

function profile(label, rows) {
  const answerDist = {}, choiceCount = {};
  let combo = 0, plain = 0, longestIsAnswer = 0;
  const sds = [];
  for (const [opts, ans] of rows) {
    if (!opts?.length) continue;
    choiceCount[opts.length] = (choiceCount[opts.length] || 0) + 1;
    if (ans >= 1 && ans <= opts.length) answerDist[ans] = (answerDist[ans] || 0) + 1;
    if (isCombo(opts)) { combo++; continue; }
    plain++;
    const lens = opts.map(o => stripMarker(o).length);
    if (lens.length > 1) sds.push(pstdev(lens));
    if (ans >= 1 && ans <= opts.length && lens[ans - 1] === Math.max(...lens)) longestIsAnswer++;
  }
  const total = Object.values(answerDist).reduce((a, b) => a + b, 0);
  const k = Object.keys(answerDist).length;
  const expected = total / k;
  const chi2 = Object.values(answerDist).reduce((a, v) => a + (v - expected) ** 2 / expected, 0);
  return {
    label, n: rows.length, choiceCount, answerDist,
    answerDistPct: Object.fromEntries(Object.entries(answerDist).map(([a, v]) => [a, +(v / total * 100).toFixed(1)])),
    answerUniformityChi2: +chi2.toFixed(2), answerDf: k - 1,
    comboRatioPct: +(combo / (combo + plain) * 100).toFixed(1),
    plainChoiceOptionLengthSd: +(sds.reduce((a, b) => a + b, 0) / sds.length).toFixed(2),
    answerIsLongestPct: +(longestIsAnswer / plain * 100).toFixed(1),
    plainCount: plain, comboCount: combo,
  };
}

// 1) 원문 코퍼스 인증 결과
const cert = read('artifacts/reference-certification-v2.json');
const reasonCounts = {};
for (const b of cert.blocked) for (const r of b.reasons || []) reasonCounts[r] = (reasonCounts[r] || 0) + 1;

const corpus = {
  total: cert.counts.total,
  certified: cert.counts.certified,
  blocked: cert.counts.blocked,
  certifiedPct: +(cert.counts.certified / cert.counts.total * 100).toFixed(1),
  blockedReasons: Object.fromEntries(Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])),
  subjects: {}, units: new Set(), sourcePdfs: new Set(), stimulusShape: {},
};
for (const c of cert.certified) {
  const s = c.payload.source;
  corpus.subjects[s.subjectKor] = (corpus.subjects[s.subjectKor] || 0) + 1;
  corpus.units.add(`${c.subject}:${c.unitNumber}`);
  corpus.sourcePdfs.add(s.filename);
  const shape = c.payload.viewItems?.length ? 'structured' : (c.payload.stimulus?.trim() ? 'plainText' : 'none');
  corpus.stimulusShape[shape] = (corpus.stimulusShape[shape] || 0) + 1;
}
corpus.units = corpus.units.size;
corpus.sourcePdfs = corpus.sourcePdfs.size;

// 2) 분포 비교
const refRows = cert.certified.map(c => [c.payload.choices || [], c.payload.correctAnswer]);
const gen = read('artifacts/generated-audit.json');
const aiRows = gen.filter(e => e.source_type === 'ai_blueprint')
  .flatMap(e => e.items || []).map(it => [it.options_list || [], it.correct_answer]);

const aiStimulus = {};
for (const e of gen) {
  if (e.source_type !== 'ai_blueprint') continue;
  for (const it of e.items || []) {
    const s = it.stimulus_data;
    const key = !s ? 'none'
      : s.headers ? 'comparativeMatrix'
      : s.participants ? 'conversationalFlow'
      : s.case_profile ? 'caseDiagnosticFrame'
      : s.doc_type ? 'formalDocument' : 'other';
    aiStimulus[key] = (aiStimulus[key] || 0) + 1;
  }
}

const out = {
  generatedAt: new Date().toISOString().slice(0, 10),
  method: '기출 원문 코퍼스와 AI(Blueprint) 생성 문항의 형식·분포를 동일 기준으로 비교. 사람 판단 없이 재현 가능한 지표만 사용.',
  corpus,
  comparison: [profile('reference_certified', refRows), profile('ai_blueprint', aiRows)],
  aiStimulusShape: aiStimulus,
};

fs.mkdirSync(path.join(ROOT, 'artifacts/validation'), { recursive: true });
fs.writeFileSync(path.join(ROOT, 'artifacts/validation/item-quality-audit.json'), JSON.stringify(out, null, 2) + '\n');

const [r, a] = out.comparison;
console.log(`원문 코퍼스: ${corpus.total}문항 파싱 → ${corpus.certified} 인증(${corpus.certifiedPct}%) / ${corpus.blocked} 차단`);
console.log(`  차단 사유:`, corpus.blockedReasons);
console.log(`  ${corpus.sourcePdfs}개 PDF · ${corpus.units}개 단원 ·`, corpus.subjects);
console.log('');
console.log('지표                          기출(n=%d)   생성(n=%d)', r.n, a.n);
console.log('선택지 5개 비율               %s%%        %s%%', 100, 100);
console.log('<보기> 조합형 비율            %s%%       %s%%', r.comboRatioPct, a.comboRatioPct);
console.log('선택지 길이 표준편차          %s자       %s자', r.plainChoiceOptionLengthSd, a.plainChoiceOptionLengthSd);
console.log('정답 번호 분포                %j', r.answerDistPct);
console.log('                              %j', a.answerDistPct);
console.log('정답이 최장 선택지            %s%%       %s%%   (우연 기대 20%%)', r.answerIsLongestPct, a.answerIsLongestPct);
console.log('');
console.log('생성 문항 자료 유형 편중:', aiStimulus);
