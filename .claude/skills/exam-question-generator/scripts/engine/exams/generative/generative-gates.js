"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requiresNonTrivial = requiresNonTrivial;
exports.blindSolveRejection = blindSolveRejection;
exports.parseBlindSolveResult = parseBlindSolveResult;
/** 3점 문항만 쉬운(easy) 판정을 반려한다(상 난이도 시험은 전부 3점이라 모든 문항에 적용된다). */
function requiresNonTrivial(spec) {
    return spec.points === 3;
}
/**
 * 블라인드 풀이(정답을 모르는 검토) 결과로 문항을 받을지 정한다. null이면 통과.
 * 서버 파이프라인과 에이전트 스킬이 같은 기준을 쓴다.
 */
function blindSolveRejection(spec, solve) {
    if (solve.answerIndex !== spec.answerIndex) {
        return {
            code: 'GEN_BLIND_SOLVE_MISMATCH',
            message: `검토 풀이 정답 ${solve.answerIndex}번 ≠ 의도 정답 ${spec.answerIndex}번`,
            notes: [
                `독립 검토자가 의도와 다른 선지(${solve.answerIndex}번)를 정답으로 판단했습니다. 검토 근거: ${solve.reasoning.slice(0, 400)}`,
                '정답 판정이 제시문 단서로 하나로 확정되도록 단서와 진술을 다시 설계하십시오.',
            ],
            fix: 'replan',
        };
    }
    if (solve.ambiguity === 'major' || solve.curriculumIssues.length > 0) {
        return {
            code: 'GEN_AMBIGUOUS',
            message: [`모호성 ${solve.ambiguity}`, ...solve.curriculumIssues].join(' / '),
            notes: [
                '검토자가 다음 결함을 지적했습니다. 모두 해소하십시오.',
                ...solve.curriculumIssues,
                ...(solve.ambiguity === 'major' ? [`모호성: ${solve.reasoning.slice(0, 300)}`] : []),
            ],
            fix: solve.ambiguity === 'major' ? 'replan' : 'repair',
        };
    }
    if (solve.answerGivenAway) {
        return {
            code: 'GEN_TOO_EASY',
            message: '검토자: 제시문이 정답 개념을 사실상 그대로 알려 줌',
            notes: [
                '검토자가 제시문만 보고 단어 대조로 정답을 찾았습니다. 개념명·정의 표현을 빼고 행동·수치·상황 단서로 바꾸십시오.',
                `검토 근거: ${solve.reasoning.slice(0, 300)}`,
            ],
            fix: 'repair',
        };
    }
    const trivialLimit = spec.points === 3 ? 0 : 1;
    if (solve.trivialStatements.length > trivialLimit) {
        return {
            code: 'GEN_TOO_EASY',
            message: `검토자: 단순 읽기 진술 ${solve.trivialStatements.join(', ')}`,
            notes: [
                `검토자가 ${solve.trivialStatements.join(', ')}을(를) 교과 개념 없이 제시문 값만 읽어도 판정되는 진술로 판단했습니다.`,
                '해당 진술을 개념 적용이나 계산이 필요한 진술로 바꾸십시오.',
            ],
            fix: 'repair',
        };
    }
    // 자료 없이 개념 암기만으로 판정되는 진술: 3점은 1개, 2점은 2개까지.
    // 검토 JSON에 이 필드가 있을 때만 판정한다(서버 파이프라인의 검토 스키마에는 없어 항상 빈 배열).
    const dataFree = solve.dataFreeStatements ?? [];
    const dataFreeLimit = spec.points === 3 ? 1 : 2;
    if (dataFree.length > dataFreeLimit) {
        return {
            code: 'GEN_TOO_EASY',
            message: `검토자: 자료 없이 개념만으로 판정되는 진술 ${dataFree.join(', ')}`,
            notes: [
                `검토자가 ${dataFree.join(', ')}을(를) 제시문을 읽지 않고 교과 개념만으로 판정되는 진술로 판단했습니다. 기출 문항처럼 각 진술이 자료(수치·사례 조건·인물의 상황)를 해석해야 판정되게 바꾸십시오.`,
                '제시문의 자료가 진술 판정에 실제로 쓰이도록 설계하고, 판정에 쓰이지 않는 자료는 빼십시오.',
            ],
            fix: 'repair',
        };
    }
    // 발문 문장(스킬 검토에만 있는 필드): 정보 과적·자료/조건 나열은 같은 명세로 발문만 고치게 한다.
    if ((solve.stemIssues ?? []).length > 0) {
        return {
            code: 'GEN_STEM_INVALID',
            message: `검토자: 발문이 한 번에 읽히지 않음 — ${(solve.stemIssues ?? []).join(' / ')}`,
            notes: [
                `검토자가 발문에서 다음 문제를 지적했습니다: ${(solve.stemIssues ?? []).join(' / ')}`,
                '발문은 자료 이름(명사구 하나)과 대상만 담고, 사례 정보는 제시문으로, (단, …)은 기준 하나만 남기십시오. 나머지 기준은 제시문 끝 "※" 줄로 옮기십시오.',
            ],
            fix: 'repair',
        };
    }
    // 함께 엮은 개념(스킬 개념 고정 계획): 검토자가 판정에 쓰였다고 확인하지 않은 개념이 있으면 고치게 한다.
    const mixNames = (spec.mixConcepts ?? []).map((concept) => concept.name);
    if (mixNames.length > 0 && solve.mixConceptsUsed !== undefined) {
        const used = solve.mixConceptsUsed.map(compactName);
        const missing = mixNames.filter((name) => !used.some((entry) => entry === compactName(name) || entry.includes(compactName(name)) || compactName(name).includes(entry)));
        if (missing.length > 0) {
            return {
                code: 'GEN_TOO_EASY',
                message: `검토자: 함께 엮을 개념이 판정에 쓰이지 않음 — ${missing.join(', ')}`,
                notes: [
                    `검토자가 ${missing.join(', ')}을(를) 어떤 진술의 참/거짓 판정에도 필요하지 않았다고 보았습니다(이름만 나오거나 장식).`,
                    '그 개념을 제시문 사례 단서로 넣고, 진술 하나 이상이 그 개념을 적용해야 판정되게 바꾸십시오. design.mixUse도 맞추십시오.',
                ],
                fix: 'repair',
            };
        }
    }
    // 초고난도: 검토자가 진술별 사고 단계를 냈으면 체감 난도 대신 그 구조로 판정한다(검토자마다 hard 기준이 흔들리는 문제).
    const analysis = solve.statementAnalysis ?? [];
    if (spec.ultra && analysis.length > 0) {
        const shallow = analysis.filter((entry) => entry.steps < 2).map((entry) => entry.label);
        if (shallow.length > 0 || solve.eliminationShortcut === true || solve.perceivedDifficulty === 'easy') {
            return {
                code: 'GEN_TOO_EASY',
                message: `검토자: 초고난도 기준 미달 — ${[
                    ...(shallow.length > 0 ? [`2단계 미만 진술 ${shallow.join(', ')}`] : []),
                    ...(solve.eliminationShortcut === true ? ['소거 지름길 있음'] : []),
                    ...(solve.perceivedDifficulty === 'easy' ? ['체감 난도 easy'] : []),
                ].join(', ')}`,
                notes: [
                    ...(shallow.length > 0 ? [`${shallow.join(', ')}은(는) 판단 하나로 참/거짓이 정해집니다. 흩어진 단서 연결·개념 판별·계산 중 둘 이상을 거쳐야 판정되게 바꾸십시오.`] : []),
                    ...(solve.eliminationShortcut === true ? ['일부 진술만 판정해도 소거로 정답이 정해지는 길이 있습니다. 모든 진술을 판정해야 정답이 하나로 정해지게 바꾸십시오.'] : []),
                    `검토 근거: ${solve.reasoning.slice(0, 400)}`,
                ],
                fix: 'repair',
            };
        }
    }
    else if (spec.ultra && solve.perceivedDifficulty !== 'hard') {
        return {
            code: 'GEN_TOO_EASY',
            message: `검토자: 초고난도 문항인데 난도가 ${solve.perceivedDifficulty}`,
            notes: [
                '검토자가 실제 수능 3점 최고난도 수준이 아니라고 판단했습니다. 모든 <보기>·선지에 계산과 기준 적용을 둘 이상 결합하고, 흔한 실수로 계산하면 판정이 뒤집히게 하십시오.',
                `검토 근거: ${solve.reasoning.slice(0, 400)}`,
            ],
            fix: 'repair',
        };
    }
    if (solve.perceivedDifficulty === 'easy' && requiresNonTrivial(spec)) {
        return {
            code: 'GEN_TOO_EASY',
            message: `검토자: ${spec.points}점·${spec.difficulty} 문항인데 난도가 easy`,
            notes: [
                '검토자가 즉시 풀리는 쉬운 문항으로 판단했습니다. 계산이 필요한 표 수치, 두 곳 이상에 분산된 단서, 복수 개념 결합 중 하나 이상을 넣으십시오.',
            ],
            fix: 'repair',
        };
    }
    return null;
}
const compactName = (value) => value.replace(/[\s·・,.()（）[\]'"]/gu, '').toLowerCase();
const labels = (value) => Array.isArray(value) ? value.filter((label) => typeof label === 'string' && label.trim() !== '') : undefined;
/** 블라인드 풀이 응답(JSON 문자열) 해석. 형식이 틀리면 Error. */
function parseBlindSolveResult(content) {
    let raw;
    try {
        raw = JSON.parse(content);
    }
    catch {
        throw new Error('검토 응답이 JSON이 아닙니다.');
    }
    const value = typeof raw === 'object' && raw !== null ? raw : {};
    const answer = Number(value.answerIndex);
    if (![1, 2, 3, 4, 5].includes(answer))
        throw new Error('검토 응답에 정답 번호가 없습니다.');
    const ambiguity = value.ambiguity === 'minor' || value.ambiguity === 'major' ? value.ambiguity : 'none';
    return {
        answerIndex: answer,
        ambiguity,
        curriculumIssues: Array.isArray(value.curriculumIssues)
            ? value.curriculumIssues.filter((issue) => typeof issue === 'string' && issue.trim() !== '')
            : [],
        answerGivenAway: value.answerGivenAway === true,
        trivialStatements: Array.isArray(value.trivialStatements)
            ? value.trivialStatements.filter((label) => typeof label === 'string' && label.trim() !== '')
            : [],
        dataFreeStatements: Array.isArray(value.dataFreeStatements)
            ? value.dataFreeStatements.filter((label) => typeof label === 'string' && label.trim() !== '')
            : [],
        // 아래는 스킬 검토에만 있는 필드: 값이 없으면 undefined로 두어 판정에 쓰지 않는다.
        ...(Array.isArray(value.statementAnalysis)
            ? {
                statementAnalysis: value.statementAnalysis
                    .filter((entry) => typeof entry === 'object' && entry !== null)
                    .map((entry) => ({ label: String(entry.label ?? ''), steps: Number(entry.steps) }))
                    .filter((entry) => entry.label !== '' && Number.isFinite(entry.steps)),
            }
            : {}),
        ...(typeof value.eliminationShortcut === 'boolean' ? { eliminationShortcut: value.eliminationShortcut } : {}),
        ...(labels(value.stemIssues) === undefined ? {} : { stemIssues: labels(value.stemIssues) }),
        ...(labels(value.mixConceptsUsed) === undefined ? {} : { mixConceptsUsed: labels(value.mixConceptsUsed) }),
        perceivedDifficulty: value.perceivedDifficulty === 'easy' || value.perceivedDifficulty === 'hard'
            ? value.perceivedDifficulty
            : 'moderate',
        reasoning: typeof value.reasoning === 'string' ? value.reasoning.slice(0, 2000) : '',
    };
}
