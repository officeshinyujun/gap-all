"use strict";
/**
 * 그림 명세 해석·글자 처리 공용 도우미(순수 TS).
 * strict JSON 스키마는 선택 필드를 null로 채우므로 null은 "없음"으로 읽는다.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.FigureParseError = void 0;
exports.isRecord = isRecord;
exports.str = str;
exports.optStr = optStr;
exports.num = num;
exports.optNum = optNum;
exports.arr = arr;
exports.strs = strs;
exports.optStrs = optStrs;
exports.recs = recs;
exports.oneOf = oneOf;
exports.optBool = optBool;
exports.mapFigureStrings = mapFigureStrings;
exports.collectFigureStrings = collectFigureStrings;
exports.countFigureNumbers = countFigureNumbers;
exports.seededRandom = seededRandom;
exports.fmtNum = fmtNum;
class FigureParseError extends Error {
}
exports.FigureParseError = FigureParseError;
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function str(value) {
    return typeof value === 'string' ? value.trim() : '';
}
/** 선택 문자열: 비었거나 null이면 undefined */
function optStr(value) {
    const text = str(value);
    return text === '' ? undefined : text;
}
function num(value, what) {
    if (typeof value !== 'number' || !Number.isFinite(value))
        throw new FigureParseError(`${what}는 유한한 숫자여야 합니다.`);
    return value;
}
function optNum(value, what) {
    return value === null || value === undefined ? undefined : num(value, what);
}
function arr(value, what) {
    if (!Array.isArray(value))
        throw new FigureParseError(`${what}는 배열이어야 합니다.`);
    return value;
}
function strs(value, what) {
    const values = arr(value, what);
    if (!values.every((entry) => typeof entry === 'string'))
        throw new FigureParseError(`${what}는 문자열 배열이어야 합니다.`);
    return values.map((entry) => entry.trim());
}
function optStrs(value, what) {
    return value === null || value === undefined ? undefined : strs(value, what);
}
function recs(value, what) {
    const values = arr(value, what);
    if (!values.every(isRecord))
        throw new FigureParseError(`${what}는 객체 배열이어야 합니다.`);
    return values;
}
function oneOf(value, options, what) {
    const text = str(value);
    if (!options.includes(text))
        throw new FigureParseError(`${what}는 ${options.join('|')} 중 하나여야 합니다.`);
    return text;
}
function optBool(value) {
    return typeof value === 'boolean' ? value : undefined;
}
// ------------------------------------------------------------
// 글자 처리: 그림 속 학생이 읽는 글자만 고른다(열거값·id·참조는 제외).
// ------------------------------------------------------------
/** 글자가 아니라 열거값·식별자·참조인 키 */
const NON_TEXT_KEYS = new Set([
    'id', 'kind', 'chartType', 'diagramType', 'layout', 'role', 'gender', 'age', 'render', 'axis', 'direction',
    'shape', 'mode', 'correlation', 'preset', 'from', 'to', 'parent', 'arrow', 'speaker',
]);
/** 명세 안 글자(라벨)를 모두 같은 규칙으로 바꾼다(표기 보정·라벨 정리). 숫자·열거값·참조는 그대로. */
function mapFigureStrings(value, fn) {
    const walk = (node, key) => {
        if (typeof node === 'string')
            return key !== null && NON_TEXT_KEYS.has(key) ? node : fn(node);
        if (Array.isArray(node))
            return node.map((entry) => walk(entry, key));
        if (isRecord(node))
            return Object.fromEntries(Object.entries(node).map(([childKey, child]) => [childKey, walk(child, childKey)]));
        return node;
    };
    return walk(value, null);
}
/** 명세 안 글자(라벨) 목록 */
function collectFigureStrings(value) {
    const found = [];
    mapFigureStrings(value, (text) => {
        if (text !== '')
            found.push(text);
        return text;
    });
    return found;
}
/** 명세 안 숫자 개수(분량 계산용) */
function countFigureNumbers(value) {
    if (typeof value === 'number')
        return 1;
    const children = Array.isArray(value) ? value : isRecord(value) ? Object.values(value) : [];
    if (children.length > 0)
        return children.reduce((sum, entry) => sum + countFigureNumbers(entry), 0);
    return 0;
}
/** 결정론적 난수(명세 해시로 시드) */
function seededRandom(seed) {
    let state = seed | 0 || 1;
    return () => {
        state = (state + 0x6d2b79f5) | 0;
        let value = Math.imul(state ^ (state >>> 15), 1 | state);
        value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}
function fmtNum(value) {
    const rounded = Math.round(value * 100) / 100;
    return rounded.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
}
