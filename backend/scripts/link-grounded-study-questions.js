const fs = require('node:fs');

const file = 'textbook/_v2/study-rebuild/success/unit-04.json';
const unit = JSON.parse(fs.readFileSync(file, 'utf8'));
const parsed = JSON.parse(fs.readFileSync('textbook/parsed/sungjik/suteck/4단원.json', 'utf8'));
const source = JSON.parse(fs.readFileSync('textbook/success_cards_moi/4단원.json', 'utf8'));

function fromParsed(question) {
  return {
    number: question.questionNumber,
    source_exam: '성공적인 직업생활 4단원 수능특강 문제',
    stimulus: question.stimulus || '',
    stem: question.stem || '',
    box_items: question.viewItems || [],
    options: question.choices || [],
    answer: question.correctAnswer || null,
    full_text: [question.stem, question.stimulus, ...(question.viewItems || []), ...(question.choices || [])].filter(Boolean).join('\n'),
  };
}

const links = new Map([
  ['기업 형태별 특징(합명·합자·유한·유한책임', { sourceName: '출자 형태에 따른 기업 분류', parsedNumber: 7 }],
  ['사회적 기업', { parsedNumber: 2 }],
  ['캐럴(Carroll)의 기업의 사회적 책임', { parsedNumber: 3 }],
  ['협동조합', { parsedNumber: 5 }],
  ['공기업(공공 기업)', { parsedNumber: 6 }],
]);

for (const card of unit.cards) {
  const link = links.get(card.name);
  if (!link) continue;
  const original = link.sourceName && source.concepts.find((item) => item.name === link.sourceName)?.realQuestion?.questionData;
  const question = original || fromParsed(parsed.find((item) => item.questionNumber === link.parsedNumber));
  if (!question) continue;
  card.sampleQuestion = question;
  card.problemApplication = {
    questionNumber: question.number,
    reason: '대표 태그와 문제의 지문·발문이 직접 연결된다.',
    solvingFlow: ['지문에서 핵심 단서를 찾는다.', '대표 태그의 정의·분류 기준과 대조한다.', '선지를 근거와 비교한다.'],
  };
  card.validationErrors = (card.validationErrors || []).filter((error) => !error.startsWith('missing realQuestion') && !error.startsWith('문제 원본의 정답 필드'));
  if (question.answer) {
    card.contentStatus = 'complete';
  } else {
    card.validationErrors.push('문제 원본의 정답 필드가 비어 있어 정답 검수 필요');
  }
}

const temp = `${file}.tmp-${process.pid}`;
fs.writeFileSync(temp, `${JSON.stringify(unit, null, 2)}\n`);
JSON.parse(fs.readFileSync(temp, 'utf8'));
fs.renameSync(temp, file);
console.log(JSON.stringify(unit.cards.filter((card) => links.has(card.name)).map((card) => ({ name: card.name, status: card.contentStatus, question: card.sampleQuestion?.number, errors: card.validationErrors }))));
