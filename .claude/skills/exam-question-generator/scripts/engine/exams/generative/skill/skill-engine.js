"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SKILL_ENGINE_VERSION = exports.Difficulty = void 0;
exports.toPlanRequest = toPlanRequest;
exports.planExam = planExam;
exports.planConceptExam = planConceptExam;
exports.replanItem = replanItem;
exports.writingBrief = writingBrief;
exports.checkCandidate = checkCandidate;
exports.reviewBrief = reviewBrief;
exports.judgeReview = judgeReview;
exports.reviewPoints = reviewPoints;
exports.rebalancePoints = rebalancePoints;
exports.toAppQuestion = toAppQuestion;
exports.unitTitle = unitTitle;
/**
 * 에이전트 스킬(exam-question-generator)용 출제 엔진 진입점.
 *
 * 서버 파이프라인은 LLM API를 직접 부르지만, 스킬에서는 스킬을 쓰는 에이전트가 출제·검토 모델 역할을 한다.
 * 여기에는 API·DB·Nest 의존이 없는 결정론적 부분만 모은다:
 * 출제 계획 → 출제 지시서 → 후보 검증·서버 확정값 반영·조립 → 블라인드 검토 지시서 → 검토 판정 → 앱 형식 변환.
 */
const difficulty_1 = require("../../../entities/difficulty");
Object.defineProperty(exports, "Difficulty", { enumerable: true, get: function () { return difficulty_1.Difficulty; } });
const generative_item_assembler_1 = require("../generative-item-assembler");
const generative_gates_1 = require("../generative-gates");
const generative_item_planner_1 = require("../generative-item-planner");
const concept_slots_1 = require("../concept-slots");
const generative_item_prompt_1 = require("../generative-item-prompt");
const exam_style_knowledge_1 = require("../exam-style-knowledge");
const legal_review_rules_1 = require("../legal-review-rules");
const text_similarity_1 = require("../text-similarity");
exports.SKILL_ENGINE_VERSION = 'exam-skill-engine-v6';
const NEAR_DUPLICATE_THRESHOLD = 0.55;
function toPlanRequest(args) {
    if (args.startUnit < 1 || args.endUnit > 20 || args.startUnit > args.endUnit) {
        throw new Error('단원 범위는 1~20 사이에서 시작 ≤ 끝이어야 합니다.');
    }
    if (!Number.isInteger(args.count) || args.count < 1 || args.count > 30) {
        throw new Error('문항 수는 1~30이어야 합니다.');
    }
    return {
        subject: args.subject,
        startUnitNum: args.startUnit,
        endUnitNum: args.endUnit,
        questionCount: args.count,
        difficulty: args.ultra ? difficulty_1.Difficulty.HIGH : args.difficulty,
        seed: args.seed ?? `skill-${Date.now()}`,
        ...(args.ultra ? { ultra: true } : {}),
        ...(args.concepts === undefined || args.concepts.length === 0 ? {} : { targetConcepts: args.concepts }),
    };
}
function planExam(request) {
    return (0, generative_item_planner_1.planGenerativeExam)(request);
}
/**
 * 개념 고정 계획: 고른 개념을 모두 시험에 넣는다(단원 범위를 넘나들어도 된다).
 * 개념이 문항보다 많으면 나머지를 가까운 단원 문항에 "함께 엮을 개념"으로 붙이고, 반려되어도 개념은 바뀌지 않는다.
 */
function planConceptExam(args) {
    if (!Number.isInteger(args.count) || args.count < 1 || args.count > 30)
        throw new Error('문항 수는 1~30이어야 합니다.');
    const resolved = (0, concept_slots_1.resolveConcepts)(args.subject, args.concepts);
    const slots = (0, concept_slots_1.assignConceptSlots)(resolved, args.count);
    const units = slots.map((slot) => slot.unitNumber);
    const request = toPlanRequest({
        subject: args.subject,
        startUnit: Math.min(...units),
        endUnit: Math.max(...units),
        count: args.count,
        difficulty: args.difficulty,
        seed: args.seed,
        ultra: args.ultra,
        concepts: resolved.map((entry) => entry.concept.name),
    });
    return { request, specs: (0, generative_item_planner_1.planGenerativeSlots)(request, slots), resolved };
}
/** 같은 형식·정답 위치로 개념·자료를 바꾼 대체 명세(같은 명세로 계속 실패할 때) */
function replanItem(request, failed, attempt, usedConcepts) {
    return (0, generative_item_planner_1.replanGenerativeItem)(request, failed, attempt, usedConcepts);
}
/** 출제 지시서: 에이전트가 이 지시와 JSON 스키마에 맞춰 후보 JSON 하나를 쓴다. */
function writingBrief(spec, repairNotes = []) {
    return {
        system: (0, generative_item_prompt_1.generativeSystemPrompt)(),
        user: [(0, generative_item_prompt_1.buildGenerativeItemPrompt)(spec, repairNotes), ...(0, generative_item_prompt_1.skillWritingAddendum)(spec), ...(0, generative_item_prompt_1.selfCheck)(spec)].join('\n'),
        schema: (0, generative_item_prompt_1.generativeItemResponseFormat)(spec).json_schema.schema,
    };
}
/**
 * 후보 검증: 문체 보정 → 묻지 않는 라벨 정리 → 서버 확정값(계산 표·진술·수치 선지) 반영 → 결정론적 검증 → 조립.
 * otherTexts는 이미 통과한 문항들의 duplicateText(지문 중복 검사용).
 */
function checkCandidate(spec, content, otherTexts = []) {
    try {
        const candidate = (0, generative_item_assembler_1.applyCalculationPlan)(spec, (0, generative_item_assembler_1.repairUnusedLabels)((0, generative_item_assembler_1.parseGenerativeCandidate)(content, spec), { keepTableHeadLabels: true }));
        const issues = (0, generative_item_assembler_1.validateGenerativeCandidate)(spec, candidate, { precheck: true });
        if (issues.length > 0)
            return { ok: false, issues };
        const question = (0, generative_item_assembler_1.assembleGenerativeQuestion)(spec, candidate);
        const duplicateText = (0, generative_item_assembler_1.duplicateCheckText)(spec, candidate.blocks, candidate.figures);
        if (otherTexts.some((other) => (0, text_similarity_1.similarity)(other, duplicateText) >= NEAR_DUPLICATE_THRESHOLD)) {
            return { ok: false, issues: [{ code: 'GEN_DUPLICATE', message: '이미 통과한 문항과 제시문이 거의 같습니다. 다른 상황·소재·수치로 새로 쓰십시오.' }] };
        }
        return { ok: true, question, duplicateText };
    }
    catch (error) {
        if (error instanceof generative_item_assembler_1.GenerativeOutputError)
            return { ok: false, issues: error.issues };
        throw error;
    }
}
/** 블라인드 검토 지시서: 정답·해설 없이 학생 화면과 같은 정보 + (법·제도 단원) 정합성 점검 항목 */
function reviewBrief(spec, question) {
    return {
        system: (0, generative_item_prompt_1.blindSolveSystemPrompt)(reviewOptions(spec)),
        user: [
            (0, generative_item_prompt_1.blindSolveUserPrompt)((0, generative_item_assembler_1.renderForSolver)(question), (0, legal_review_rules_1.legalReviewRules)(spec.subject, spec.unitNumber), spec.ultra === true),
            ...(0, generative_item_prompt_1.textbookReference)(spec),
        ].join('\n'),
        schema: (0, generative_item_prompt_1.blindSolveResponseFormat)(reviewOptions(spec)).json_schema.schema,
    };
}
/** 스킬 검토 옵션: 자료 없이 풀리는 진술·발문 점검은 늘, 진술별 사고 단계는 초고난도, 엮은 개념 확인은 엮을 개념이 있을 때 */
function reviewOptions(spec) {
    return {
        dataFree: true,
        stemReview: true,
        statementAnalysis: spec.ultra === true,
        mixConcepts: (spec.mixConcepts ?? []).map((concept) => concept.name),
    };
}
/** 배점을 문항 사이에서 맞바꿀 수 있는 시험(2점·3점이 섞인 중·통합). 하(전부 2점)·상/초고난도(전부 3점)는 아니다. */
function pointsFlexible(spec) {
    return spec.ultra !== true && (spec.difficulty === difficulty_1.Difficulty.MIDDLE || spec.difficulty === difficulty_1.Difficulty.INTERGRATE);
}
/**
 * 검토 결과(JSON 문자열)를 서버 파이프라인과 같은 기준으로 판정한다.
 * 배점이 섞인 시험에서 3점 문항이 "쉬움"(체감 easy·단순 읽기·자료 없이 풀리는 진술)으로만 걸리고 2점 기준은 통과하면
 * 반려하지 않고 2점으로 받는다(downgraded). 3점 수는 내보낼 때 rebalancePoints가 다른 문항을 올려 맞춘다.
 */
function judgeReview(spec, content) {
    let solve;
    try {
        solve = (0, generative_gates_1.parseBlindSolveResult)(content);
    }
    catch (error) {
        return { accepted: false, invalid: error instanceof Error ? error.message : String(error) };
    }
    const rejection = (0, generative_gates_1.blindSolveRejection)(spec, solve);
    if (rejection === null)
        return { accepted: true };
    if (rejection.code === 'GEN_TOO_EASY' && spec.points === 3 && pointsFlexible(spec) && (0, generative_gates_1.blindSolveRejection)({ ...spec, points: 2 }, solve) === null) {
        return { accepted: true, downgraded: true };
    }
    return { accepted: false, rejection };
}
/** 통과 문항의 마지막 검토 결과로 배점 재배분 정보를 만든다(3점 기준을 통과하는지, 내려간 문항인지, 체감 난도). */
function reviewPoints(spec, ordinal, content) {
    let solve;
    try {
        solve = (0, generative_gates_1.parseBlindSolveResult)(content);
    }
    catch {
        return { ordinal, points: spec.points, downgraded: false, eligibleFor3: spec.points === 3, perceived: 'unknown' };
    }
    const passes3 = (0, generative_gates_1.blindSolveRejection)({ ...spec, points: 3 }, solve) === null;
    return {
        ordinal,
        points: spec.points,
        downgraded: spec.points === 3 && pointsFlexible(spec) && !passes3,
        eligibleFor3: pointsFlexible(spec) && passes3,
        perceived: solve.perceivedDifficulty,
    };
}
/**
 * 시험 전체의 3점 문항 수를 계획대로 유지한다: 쉬움으로 내려간 문항 대신, 3점 기준을 통과한 2점 문항을
 * 체감 난도가 높은 순(hard → moderate)으로 3점으로 올린다. 올릴 문항이 모자라면 shortfall에 남은 수를 돌려준다.
 */
function rebalancePoints(entries) {
    const points = new Map(entries.map((entry) => [entry.ordinal, entry.downgraded ? 2 : entry.points]));
    const target = entries.filter((entry) => entry.points === 3).length;
    const changes = entries.filter((entry) => entry.downgraded).map((entry) => `${entry.ordinal}번 3점→2점(검토 체감 난도 ${entry.perceived})`);
    let deficit = target - [...points.values()].filter((value) => value === 3).length;
    const rank = (perceived) => (perceived === 'hard' ? 0 : perceived === 'moderate' ? 1 : 2);
    const candidates = entries
        .filter((entry) => points.get(entry.ordinal) === 2 && !entry.downgraded && entry.eligibleFor3)
        .sort((left, right) => rank(left.perceived) - rank(right.perceived) || left.ordinal - right.ordinal);
    for (const entry of candidates) {
        if (deficit <= 0)
            break;
        points.set(entry.ordinal, 3);
        changes.push(`${entry.ordinal}번 2점→3점(검토 체감 난도 ${entry.perceived})`);
        deficit -= 1;
    }
    return { points, changes, shortfall: Math.max(0, deficit) };
}
/** 앱(questions 테이블·시험지 렌더러)과 같은 문항 형식 */
function toAppQuestion(spec, question, orderIndex) {
    return {
        orderIndex,
        subject: spec.subject,
        unitNumber: spec.unitNumber,
        unitTitle: spec.unitTitle,
        targetConcept: question.targetConcept,
        itemType: question.itemType,
        difficulty: question.difficulty,
        points: question.points,
        recommendedTemplate: question.recommendedTemplate,
        questionStem: question.questionStem,
        stimulusData: question.stimulusData,
        optionsList: question.optionsList,
        comboBlock: question.comboBlock,
        correctAnswer: question.correctAnswer,
        explanation: question.explanation,
        fingerprint: question.fingerprint,
        generation: { engine: exports.SKILL_ENGINE_VERSION, specId: spec.id, profileVersion: (0, exam_style_knowledge_1.loadExamStyleProfile)().version },
    };
}
function unitTitle(subject, unitNumber) {
    return (0, exam_style_knowledge_1.loadUnitGuide)(subject, unitNumber).unitTitle;
}
