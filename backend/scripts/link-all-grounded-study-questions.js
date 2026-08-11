const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..', '..');
const SUBJECTS = [
  { name: 'success', folder: 'sungjik', cards: 'success_cards_moi' },
  { name: 'industry', folder: 'kongil', cards: 'kongil_cards_moi' },
];

const normalize = (value) => String(value || '').toLowerCase().replace(/[\s·()（）\-_/,:：]+/gu, '');
const tokens = (value) => normalize(value).match(/[가-힣a-z0-9]{2,}/gu) || [];

function files(dir) {
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((file) => file.endsWith('.json')) : [];
}

function jsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? jsonFiles(full) : entry.name.endsWith('.json') ? [full] : [];
  });
}

function questionData(question) {
  return {
    number: question.questionNumber,
    source_exam: question.source?.subjectKor || question.source?.filename || '실제 문제',
    stimulus: question.stimulus || '',
    stem: question.stem || '',
    box_items: question.viewItems || [],
    options: question.choices || [],
    answer: question.correctAnswer || null,
    full_text: [question.stem, question.stimulus, ...(question.viewItems || []), ...(question.choices || [])].filter(Boolean).join('\n'),
  };
}

function findQuestion(tag, questions) {
  const tagTokens = new Set(tokens(tag));
  const candidates = questions.map((question) => {
    const concepts = question.targetConcepts || [];
    const conceptText = concepts.join(' ');
    const conceptTokens = new Set(tokens(conceptText));
    const overlap = [...tagTokens].filter((token) => conceptTokens.has(token));
    return { question, overlap };
  }).filter(({ overlap }) => overlap.length > 0).sort((a, b) => b.overlap.length - a.overlap.length);
  if (candidates[0]) return candidates[0].question;
  const generic = new Set(['기업', '직업', '생산', '관리', '근로', '활동', '형태', '특징', '개념', '방식', '분류']);
  const textCandidates = questions.map((question) => {
    const text = normalize([question.stem, question.stimulus, ...(question.choices || [])].join(' '));
    const overlap = [...tagTokens].filter((token) => !generic.has(token) && token.length >= 3 && text.includes(token));
    return { question, overlap };
  }).filter(({ overlap }) => overlap.length > 0).sort((a, b) => b.overlap.length - a.overlap.length);
  return textCandidates[0]?.question || null;
}

for (const subject of SUBJECTS) {
  for (let unit = 1; unit <= 20; unit += 1) {
    const artifactPath = path.join(ROOT, 'textbook', '_v2', 'study-rebuild', subject.name, `unit-${String(unit).padStart(2, '0')}.json`);
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    const questions = [];
    const parsedDir = path.join(ROOT, 'textbook', 'parsed', subject.folder);
    for (const file of jsonFiles(parsedDir).filter((name) => name.includes(`${unit}단원`))) {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      questions.push(...(Array.isArray(data) ? data : data.questions || []));
    }
    const sourcePath = path.join(ROOT, 'textbook', subject.cards, `${unit}단원.json`);
    const source = fs.existsSync(sourcePath) ? JSON.parse(fs.readFileSync(sourcePath, 'utf8')) : { concepts: [] };
    let changed = 0;
    for (const card of artifact.cards) {
      if (card.sampleQuestion && card.problemApplication) continue;
      const sourceCard = (source.concepts || []).find((item) => {
        const overlap = [...new Set(tokens(card.name))].filter((token) => normalize(item.name).includes(token));
        return overlap.length >= 2 && item.realQuestion?.questionData;
      });
      const parsedQuestion = findQuestion(card.name, questions);
      const question = sourceCard?.realQuestion?.questionData || (parsedQuestion && questionData(parsedQuestion));
      if (!question) continue;
      card.sampleQuestion = question;
      card.problemApplication = {
        questionNumber: question.number,
        reason: '실제 문제의 관련 개념과 대표 태그를 연결했다.',
        solvingFlow: ['문제의 핵심 단서를 확인한다.', '대표 태그의 개념 기준과 대조한다.', '선지 또는 보기와 근거를 비교한다.'],
      };
      card.validationErrors = (card.validationErrors || []).filter((error) => !error.startsWith('missing realQuestion') && !error.startsWith('문제 원본의 정답 필드'));
      if (question.answer) card.contentStatus = 'complete';
      else card.validationErrors.push('문제 원본의 정답 필드가 비어 있어 정답 검수 필요');
      changed += 1;
    }
    if (changed) {
      const temp = `${artifactPath}.tmp-${process.pid}`;
      fs.writeFileSync(temp, `${JSON.stringify(artifact, null, 2)}\n`);
      JSON.parse(fs.readFileSync(temp, 'utf8'));
      fs.renameSync(temp, artifactPath);
      console.log(`${subject.name} unit-${String(unit).padStart(2, '0')}: ${changed} cards linked`);
    }
  }
}
