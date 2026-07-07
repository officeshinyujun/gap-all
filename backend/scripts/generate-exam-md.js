const fs = require('fs');
const path = require('path');

const PARSED_DIR = path.resolve(__dirname, '..', '..', 'textbook', 'parsed');
const OUTPUT_DIR = path.resolve(__dirname, '..', '..', 'question');
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const SUBJECTS = ['sungjik', 'kongil'];
const SUBJECT_NAMES = {
  sungjik: '성공적인 직업생활 (성직)',
  kongil: '공업 일반 (공일)',
};

function extractUnitNumber(stimulus, stem, questionNumber) {
  if (!stimulus && !stem) return '?';
  const text = (stimulus || '') + ' ' + (stem || '');
  const match = text.match(/(\d+)단원/);
  if (match) return match[1];
  return '?';
}

function extractConcepts(stimulus, stem, choices, targetConcepts) {
  if (targetConcepts && targetConcepts.length > 0) {
    return targetConcepts;
  }
  const text = (stimulus || '') + ' ' + (stem || '') + ' ' + (choices || []).join(' ');
  // Extract potential concept keywords from the text
  const concepts = [];
  const patterns = [
    /직업\s*가치[관]/g, /생애\s*발달/g, /기업\s*형태/g, /경영\s*활동/g,
    /제조[업]|생산/g, /서비스/g, /NCS|직업\s*기초\s*능력/g, /취업|창업/g,
    /근로[계약|관계|기준]|임금/g, /산업\s*안전|재해/g, /노사\s*관계/g,
    /직업\s*윤리|미래\s*사회/g, /고용|실업/g,
    /표준화|품질/g, /자동화|로봇/g, /공해|환경/g, /구매|자재/g,
    /공정|기술\s*경영/g, /경공업|중화학/g, /첨단\s*공업/g,
    /제품\s*개발|생산\s*관리/g, /혁신|정보\s*시스템/g,
    /인적\s*자원|조직/g, /진로\s*계획|직업\s*세계/g,
    /사회\s*보험|연금|건강\s*보험/g, /퇴직금|연차/g,
    /직업병|보건/g, /안전\s*보건\s*표지/g,
    /홀랜드|RIASEC|해비거스트|레빈슨|슈퍼|에릭슨|마샤/g,
    /CSR|STP|SWOT|4P|PLC|JIT|EOQ|OEE|BOM|MRP|ERP|SCM|CRM|MES|POP|CIM|FMS|CNC|AGV|PDCA|TQM|QFD|VE/g,
    /ISO\s*\d+|KS\s*[A-Z]/g, /하인리히|버드|데밍/g,
    /CVP|BEP|Cp|Cpk|USL|LSL/g,
    /취업\s*공고|면접|채용|자기\s*소개서|STAR/g,
    /노동\s*조합|단체\s*교섭|쟁의|파업/g,
    /환경\s*오염|탄소|ESG/g,
    /특허|지식\s*재산권|벤처/g,
  ];
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const concept = match[0].trim();
      if (concept.length > 0 && !concepts.includes(concept)) {
        concepts.push(concept);
      }
    }
  }
  return concepts.slice(0, 5);
}

let md = `# GAP 모의고사 문제 목록\n\n`;
md += `> 실제 수능/모의평가 기출문제를 OCR 파싱한 데이터 기준\n\n`;
md += `**생성일:** ${new Date().toLocaleDateString('ko-KR')}\n\n---\n\n`;

let totalQuestions = 0;

for (const subject of SUBJECTS) {
  const moiDir = path.join(PARSED_DIR, subject, 'moi');
  if (!fs.existsSync(moiDir)) continue;

  const files = fs.readdirSync(moiDir).filter(f => f.endsWith('.json')).sort();

  md += `## ${SUBJECT_NAMES[subject]}\n\n`;

  for (const file of files) {
    const filePath = path.join(moiDir, file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    const questions = Array.isArray(data) ? data : (data.questions || data.items || []);

    if (questions.length === 0) continue;

    const examName = file.replace('.json', '');
    md += `### ${examName} (총 ${questions.length}문항)\n\n`;
    md += `| # | 단원 | 발문 | 개념 |\n`;
    md += `|---|------|------|------|\n`;

    for (const q of questions) {
      totalQuestions++;
      const stem = (q.stem || q.question_stem || '').slice(0, 60);
      const unit = q.unitNumber || extractUnitNumber(q.stimulus, q.stem, q.questionNumber);
      const concepts = extractConcepts(q.stimulus, q.stem, q.choices, q.targetConcepts);
      const conceptStr = concepts.length > 0 ? concepts.join(', ') : '-';
      md += `| ${q.questionNumber || '?'} | ${unit}단원 | ${stem}... | ${conceptStr} |\n`;
    }
    md += '\n';
  }
}

md += `---\n\n**총 ${totalQuestions}문항 분석**\n`;

fs.writeFileSync(path.join(OUTPUT_DIR, 'exam.md'), md, 'utf-8');
console.log(`exam.md 생성 완료: ${totalQuestions}문항`);
