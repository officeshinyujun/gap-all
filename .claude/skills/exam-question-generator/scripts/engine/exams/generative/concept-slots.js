"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveConcepts = resolveConcepts;
exports.assignConceptSlots = assignConceptSlots;
/**
 * 개념 고정 계획(에이전트 스킬 전용): 사용자가 고른 개념들을 단원 가이드에서 찾아
 * 문항 자리(정답 판단 개념 + 함께 엮을 개념)로 나눈다. 단원 범위를 넘나드는 개념 섞기를 위한 것이다.
 *
 *  - 이름 찾기: 띄어쓰기·기호를 무시하고 완전 일치하거나, 한 개념 이름에만 포함되면 그 개념으로 정한다("호프만비율" → 6단원 "…(호프만 비율)").
 *    그 밖에는 조용히 비슷한 개념을 고르지 않고 후보(글자·자모 유사도 순)를 보여 주며 멈춘다 — 엉뚱한 개념으로 계획되는 것을 막는다.
 *  - 자리 나누기: 개념 수 ≤ 문항 수면 모두 정답 판단 개념이고, 남는 자리는 그 단원들에서 엔진이 고른다.
 *    개념 수 > 문항 수면 단원마다 하나씩 돌아가며 정답 판단 개념을 고르고, 나머지는 가까운 단원·혼동 관계의 문항에 엮는다.
 */
const exam_style_knowledge_1 = require("./exam-style-knowledge");
const compact = (value) => value.replace(/[\s·・,.\-()（）[\]'"’‘“”]/gu, '').toLowerCase();
function bigrams(value) {
    const result = new Set();
    for (let index = 0; index + 2 <= value.length; index += 1)
        result.add(value.slice(index, index + 2));
    return result;
}
function dice(left, right) {
    const a = bigrams(left);
    const b = bigrams(right);
    if (a.size === 0 || b.size === 0)
        return 0;
    let shared = 0;
    for (const gram of a)
        if (b.has(gram))
            shared += 1;
    return (2 * shared) / (a.size + b.size);
}
/** 자모 단위 유사도: "ㅈ하리의창"·"새앗ㄴ방식"처럼 자모가 섞인 오타도 찾는다(NFKD는 호환 자모를 조합 자모로 푼다). */
function jamoSimilarity(left, right) {
    return dice(left.normalize('NFKD'), right.normalize('NFKD'));
}
function resolveConcepts(subject, queries, units = range(1, 20)) {
    const pool = units.flatMap((unitNumber) => {
        const guide = (0, exam_style_knowledge_1.loadUnitGuide)(subject, unitNumber);
        return guide.concepts.map((concept) => ({ unitNumber, unitTitle: guide.unitTitle, concept, key: compact(concept.name) }));
    });
    return queries.map((query) => {
        const key = compact(query);
        const exact = pool.find((entry) => entry.key === key);
        const contained = pool.filter((entry) => entry.key.includes(key) || key.includes(entry.key));
        const scored = pool
            .map((entry) => ({
            entry,
            score: Math.max(dice(key, entry.key), jamoSimilarity(key, entry.key) * 0.95) + (entry.key.includes(key) || key.includes(entry.key) ? 0.5 : 0),
        }))
            .sort((left, right) => right.score - left.score);
        const best = exact ?? (contained.length === 1 ? contained[0] : undefined);
        if (best === undefined) {
            const near = (contained.length > 1 ? contained.map((entry) => ({ entry })) : scored).slice(0, 4)
                .map(({ entry }) => `${entry.unitNumber}단원 "${entry.concept.name}"`).join(', ');
            throw new Error(`개념 "${query}"을(를) 하나로 정하지 못했습니다. 아래 이름 중 하나를 그대로 쓰십시오: ${near}`);
        }
        return { query, unitNumber: best.unitNumber, unitTitle: best.unitTitle, concept: best.concept };
    });
}
function range(start, end) {
    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}
function related(left, right) {
    const names = (concept) => [concept.name, ...concept.confusableWith].map(compact);
    const a = names(left);
    const b = names(right);
    return a.some((name) => b.some((other) => name.includes(other) || other.includes(name)));
}
/**
 * 개념을 문항 자리로 나눈다. 같은 개념은 한 번만 쓴다.
 * 반환 순서는 단원 순(시험지 배열과 같다).
 */
function assignConceptSlots(resolved, count) {
    const unique = resolved.filter((entry, index) => resolved.findIndex((other) => other.concept.name === entry.concept.name) === index);
    if (unique.length === 0)
        throw new Error('개념이 하나 이상 필요합니다.');
    const byUnit = new Map();
    for (const entry of unique)
        byUnit.set(entry.unitNumber, [...(byUnit.get(entry.unitNumber) ?? []), entry]);
    const units = [...byUnit.keys()].sort((left, right) => left - right);
    // 정답 판단 개념: 단원마다 하나씩 돌아가며(요청 순서대로) 고른다 — 단원 쏠림 없이 범위를 덮는다.
    const targets = [];
    for (let round = 0; targets.length < Math.min(count, unique.length); round += 1) {
        for (const unit of units) {
            const entry = byUnit.get(unit)?.[round];
            if (entry !== undefined && targets.length < count)
                targets.push(entry);
        }
    }
    const slots = targets.map((target) => ({ target, mix: [] }));
    // 엮을 개념: 혼동 관계 > 같은 단원 > 가까운 단원 순으로, 한 문항에 몰리지 않게 붙인다.
    const rest = unique.filter((entry) => !targets.includes(entry));
    const cap = Math.ceil(rest.length / Math.max(1, slots.length)) + 1;
    for (const entry of rest) {
        const best = slots
            .filter((slot) => slot.mix.length < cap)
            .map((slot) => ({
            slot,
            // 단원 거리를 가장 무겁게 본다: 같은 단원 문항에 붙이는 것이 자연스럽다(다른 단원은 같은 단원 문항이 다 찼을 때만).
            cost: Math.abs(slot.target.unitNumber - entry.unitNumber) * 2 + slot.mix.length - (related(slot.target.concept, entry.concept) ? 1.5 : 0),
        }))
            .sort((left, right) => left.cost - right.cost)[0];
        (best?.slot ?? slots[0]).mix.push(entry);
    }
    const toMix = (entry) => ({ ...entry.concept, unitNumber: entry.unitNumber, unitTitle: entry.unitTitle });
    const result = slots.map(({ target, mix }) => ({ unitNumber: target.unitNumber, concept: target.concept, mix: mix.map(toMix) }));
    // 개념보다 문항이 많으면 남는 자리는 요청 단원을 돌며 엔진이 개념을 고른다.
    for (let index = 0; result.length < count; index += 1)
        result.push({ unitNumber: units[index % units.length], mix: [] });
    return result.sort((left, right) => left.unitNumber - right.unitNumber);
}
