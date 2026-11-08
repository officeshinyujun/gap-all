"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GENERATIVE_STIMULUS_SHAPES = exports.GENERATIVE_FIGURE_SHAPES = exports.GENERATIVE_TEXTUAL_SHAPES = exports.GENERATIVE_RESPONSE_MODES = exports.GENERATIVE_VALIDATOR_VERSION = exports.GENERATIVE_PROMPT_VERSION = exports.GENERATIVE_SPEC_VERSION = void 0;
exports.isFigureShape = isFigureShape;
exports.GENERATIVE_SPEC_VERSION = 'generative-spec-v1';
exports.GENERATIVE_PROMPT_VERSION = 'generative-prompt-v1';
exports.GENERATIVE_VALIDATOR_VERSION = 'generative-validator-v1';
/** 실제 기출 응답 형식. sequence(순서 배열)는 0.3% 미만이라 생성하지 않는다. */
exports.GENERATIVE_RESPONSE_MODES = [
    'truth_combination',
    'statement',
    'short_label',
    'pair_table',
];
/** 글·표·대화로 쓰는 제시문 블록 구성(그림 없음). */
exports.GENERATIVE_TEXTUAL_SHAPES = [
    'text',
    'table+text',
    'table',
    'dialogue',
    'dialogue+text',
];
/**
 * 엔진이 그림을 그리는 제시문 구성: 그래프(chart)는 figure spec 수치로, 인물 그림(scene)은 배치·역할로 그린다.
 * 기출의 도식·사진처럼 엔진이 못 그리는 그림은 계획하지 않는다(글·표로 바꾸어 쓴다).
 */
exports.GENERATIVE_FIGURE_SHAPES = ['chart+text', 'chart', 'diagram+text', 'diagram', 'scene+dialogue'];
exports.GENERATIVE_STIMULUS_SHAPES = [...exports.GENERATIVE_TEXTUAL_SHAPES, ...exports.GENERATIVE_FIGURE_SHAPES];
function isFigureShape(shape) {
    return exports.GENERATIVE_FIGURE_SHAPES.includes(shape);
}
