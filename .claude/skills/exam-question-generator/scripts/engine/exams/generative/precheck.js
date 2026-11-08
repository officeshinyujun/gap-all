"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.COPIED_STATEMENT_RATIO = void 0;
exports.blankCellIssues = blankCellIssues;
exports.findRealEntities = findRealEntities;
exports.realEntityIssues = realEntityIssues;
exports.copiedStatementIssues = copiedStatementIssues;
exports.laborHeadcountIssues = laborHeadcountIssues;
exports.explanationNumeralIssues = explanationNumeralIssues;
const figure_parse_1 = require("./figures/figure-parse");
const UNIT_ONLY = /^(명|개|원|만 원|억 원|%|%p|kg|g|m|km|cm|mm|℃|mL|L|N|J|W|s|초|분|시간|일|주|개월|년|단위|가구|건|회|배|점)$/u;
function blankCellIssues(blocks) {
    for (const block of blocks) {
        if (block.type !== 'table')
            continue;
        for (const row of block.rows) {
            for (const cell of row) {
                const value = cell.trim();
                if (value === '' || UNIT_ONLY.test(value)) {
                    return [{
                            code: 'GEN_STIMULUS_INVALID',
                            message: `표에 기호 없는 빈칸("${cell}")이 있습니다. 학생이 추론할 칸은 ㉠·(가)·□ 같은 기호를 쓰고(예: "㉠명") 발문·선지에서 그 기호로 물으며, 해당 없는 칸은 "-"로 쓰십시오.`,
                        }];
                }
            }
        }
    }
    return [];
}
/**
 * 실존 기업·브랜드·인물. 한글 이름은 앞이 낱말 경계일 때만(조사는 뒤에 붙으므로 뒤는 보지 않는다),
 * 영문 약칭은 앞뒤가 영문·숫자가 아닐 때만 잡는다. 일반어와 겹치는 이름(토스트의 "토스", 기아(飢餓)의 "기아")은
 * 겹치지 않는 형태(토스뱅크, 기아자동차)만 넣는다.
 */
const REAL_ENTITIES_KO = [
    '삼성', '현대자동차', '현대차', '현대건설', '현대백화점', '현대중공업', '엘지', '카카오', '네이버', '쿠팡', '스타벅스',
    '롯데', '신세계', '이마트', '배달의민족', '토스뱅크', '한화', '포스코', '셀트리온', '하이닉스', '기아자동차', '기아차',
    '대한항공', '아시아나', '맥도날드', '버거킹', '다이소', '올리브영', '무신사', '구글', '아마존', '테슬라',
    '마이크로소프트', '넷플릭스', '유튜브', '코카콜라', '나이키', '아디다스', '이케아',
    // 실존 인물(경영인)
    '스티브 잡스', '일론 머스크', '빌 게이츠', '마크 저커버그', '이건희', '이재용', '정주영', '손정의', '워런 버핏',
];
const REAL_ENTITIES_LATIN = ['LG', 'SK', 'KT', 'CJ', 'Samsung', 'Hyundai', 'Kakao', 'Naver', 'Coupang', 'Starbucks', 'Google', 'Apple', 'Amazon', 'Tesla'];
function findRealEntities(texts) {
    const found = new Set();
    for (const name of REAL_ENTITIES_KO) {
        const pattern = new RegExp(`(^|[^가-힣])${name.replace(/ /gu, '\\s*')}`, 'u');
        if (texts.some((text) => pattern.test(text)))
            found.add(name);
    }
    for (const name of REAL_ENTITIES_LATIN) {
        const pattern = new RegExp(`(^|[^A-Za-z0-9])${name}($|[^A-Za-z0-9])`, 'u');
        if (texts.some((text) => pattern.test(text)))
            found.add(name);
    }
    return [...found];
}
function realEntityIssues(blocks, figures, stem = '') {
    const texts = [
        stem,
        ...blocks.flatMap((block) => [block.text, block.title, ...block.headers, ...block.rows.flat(), ...block.lines.flatMap((line) => [line.speaker, line.text])]),
        ...figures.flatMap((figure) => (figure.kind === 'scene' ? [] : (0, figure_parse_1.collectFigureStrings)(figure))),
    ];
    const found = findRealEntities(texts);
    return found.length === 0 ? [] : [{
            code: 'GEN_STIMULUS_INVALID',
            message: `제시문·발문에 실존 기업·브랜드·인물(${found.join(', ')})이 나옵니다. 기출 관례대로 ○○기업·△△사, A 씨·갑 같은 가상 명칭으로 바꾸십시오.`,
        }];
}
function grams(text) {
    const compact = text.replace(/[\s.,·'"‘’“”()]/gu, '');
    const result = new Set();
    for (let index = 0; index + 3 <= compact.length; index += 1)
        result.add(compact.slice(index, index + 3));
    return result;
}
/** 제시문 단위(문장·표 행·발화)마다 진술의 3글자 조각이 얼마나 들어 있는지 */
function stimulusUnits(blocks) {
    return blocks.flatMap((block) => {
        // 문장은 문장부호·줄바꿈(개조식 "• …함" 줄)에서 끊는다. "토요일마다 ", "보다 " 같은 문장 속 "-다 "에서는 끊지 않는다.
        if (block.type === 'text')
            return block.text.split(/(?<=[.?!])\s+|\n/u);
        if (block.type === 'table')
            return block.rows.map((row) => row.join(' '));
        if (block.type === 'dialogue')
            return block.lines.flatMap((line) => line.text.split(/(?<=[.?!])\s+/u));
        return [];
    }).map((unit) => unit.trim()).filter((unit) => unit.length >= 8);
}
/** 진술의 3글자 조각 중 이 비율 이상이 제시문 한 단위(문장·표 행·발화)에 있으면 베끼기로 본다. */
exports.COPIED_STATEMENT_RATIO = 0.72;
function copiedStatementIssues(spec, candidate, fixedTexts) {
    if (spec.responseMode === 'short_label' || spec.responseMode === 'pair_table')
        return [];
    const units = stimulusUnits(candidate.blocks).map(grams);
    const statements = spec.responseMode === 'truth_combination'
        ? (candidate.viewItems ?? []).map((item) => ({ label: item.key, text: item.text }))
        : [candidate.keyedChoice?.text ?? '', ...(candidate.otherChoices ?? []).map((choice) => choice.text)].map((text, index) => ({ label: `선지 ${index + 1}`, text }));
    const copied = statements.filter(({ text }) => {
        if (fixedTexts.has(text) || text.replace(/\s/gu, '').length < 14)
            return false;
        const mine = grams(text);
        if (mine.size === 0)
            return false;
        return units.some((unit) => [...mine].filter((gram) => unit.has(gram)).length / mine.size >= exports.COPIED_STATEMENT_RATIO);
    });
    return copied.length === 0 ? [] : [{
            code: 'GEN_TOO_EASY',
            message: `${copied.map((entry) => `"${entry.text.slice(0, 24)}…"`).join(', ')}이(가) 제시문의 문장·행과 거의 같습니다. 제시문을 읽기만 해도 판정되는 진술이 되므로, 자료를 해석하고 교과 개념을 적용해야 판정되는 진술로 바꾸십시오(제시문 표현을 그대로 옮기거나 한 단어만 뒤집지 말 것).`,
        }];
}
/**
 * 상시 근로자 수(5명 기준)에 따라 적용이 갈리는 제도(legal-review-rules 15단원 시행령 별표 1, 16단원 차별 시정).
 * 해고 예고·주휴일·휴게·최저임금·퇴직급여는 5명 미만에도 적용되어 인원이 판정을 바꾸지 않으므로 넣지 않는다.
 */
const HEADCOUNT_DEPENDENT = /(연장|야간|휴일)\s*(근로\s*)?(가산|수당)|가산\s*(수당|임금)|통상\s*임금의\s*50\s*%|연차|부당\s*해고|해고\s*(사유와\s*시기를\s*)?서면|서면으로\s*통지|휴업\s*수당|생리\s*휴가|경영상\s*(이유에\s*의한\s*)?해고|차별\s*(적\s*처우의\s*)?시정|1주\s*(간\s*)?(최대\s*)?(40|52)\s*시간|연장\s*근로\s*(한도|는\s*1주)/u;
/** 제시문·발문에 사업장 인원이 나오는지(상시 근로자 수, 직원·근로자 n명, n인 사업장) */
const HEADCOUNT_STATED = /상시\s*(근로자|근무|고용|직원|종업원)|(근로자|직원|종업원|사원|아르바이트생|인원|노동자)[^.\n]{0,12}?\d+\s*명|\d+\s*명[^.\n]{0,10}?(근무|고용|일하|규모|사업장|직원|근로자|종업원|사원)|\d+\s*인\s*(이상|미만)?\s*사업장|\d+\s*명\s*(이상|미만)/u;
function laborHeadcountIssues(spec, candidate, stimulusText) {
    if (spec.subject !== 'success' || (spec.unitNumber !== 15 && spec.unitNumber !== 16))
        return [];
    const statements = [
        ...(candidate.viewItems ?? []).map((item) => item.text),
        candidate.keyedChoice?.text ?? '',
        ...(candidate.otherChoices ?? []).map((choice) => choice.text),
    ].join(' ');
    const institution = statements.match(HEADCOUNT_DEPENDENT);
    if (institution === null)
        return [];
    if (HEADCOUNT_STATED.test(`${candidate.stem} ${stimulusText}`))
        return [];
    return [{
            code: 'GEN_STIMULUS_INVALID',
            message: `진술이 상시 근로자 수(5명 기준)에 따라 적용이 갈리는 제도("${institution[0]}")를 판정하는데 제시문에 사업장의 상시 근로자 수가 없습니다. 사례에 등장하는 모든 사업장(파견이면 파견·사용 사업주 모두)의 상시 근로자 수를 적으십시오.`,
        }];
}
/** 해설(solution·distractorNotes)의 선지 번호. 보기형은 정답 조합 위치를 지시서가 알려 주므로 검사하지 않는다. steps는 허용. */
function explanationNumeralIssues(spec, candidate) {
    if (spec.responseMode === 'truth_combination')
        return [];
    return /[①②③④⑤]/u.test([candidate.explanation.solution, ...candidate.explanation.distractorNotes].join(' '))
        ? [{ code: 'GEN_EXPLANATION_INVALID', message: '해설에 선지 번호(①~⑤)를 쓰지 마십시오. 정답 위치는 엔진이 정하므로 번호 대신 선지 내용으로 설명하십시오.' }]
        : [];
}
