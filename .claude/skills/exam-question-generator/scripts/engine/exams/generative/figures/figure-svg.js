"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SVG_DATA_URI_PREFIX = void 0;
exports.figureIdPrefix = figureIdPrefix;
exports.renderFigureSvg = renderFigureSvg;
exports.svgToDataUri = svgToDataUri;
exports.renderFigure = renderFigure;
/**
 * figure spec → SVG 문자열 → 앱 figures 항목(data URI).
 * 같은 명세는 항상 같은 SVG가 된다(결정론). 순수 TS(Buffer만 쓰며 Node 18+에서 돈다).
 */
const stable_hash_1 = require("../../../common/stable-hash");
const figure_chart_svg_1 = require("./figure-chart-svg");
const figure_chart_ext_svg_1 = require("./figure-chart-ext-svg");
const figure_diagram_svg_1 = require("./figure-diagram-svg");
const figure_spec_1 = require("./figure-spec");
const figure_scene_svg_1 = require("./figure-scene-svg");
exports.SVG_DATA_URI_PREFIX = 'data:image/svg+xml;base64,';
/**
 * 그림 안 id(패턴·클립 경로)에 붙이는 접두: 그림 id + 명세 해시.
 * 한 시험지에 여러 문항의 F1이 함께 인라인되어도 서로 다른 그림의 id가 겹치지 않는다.
 */
function figureIdPrefix(spec) {
    return `${spec.id}-${(0, stable_hash_1.stableHash)(JSON.stringify(spec)).slice(0, 6)}`;
}
function renderFigureSvg(spec) {
    const prefix = figureIdPrefix(spec);
    if (spec.kind === 'scene')
        return (0, figure_scene_svg_1.renderSceneSvg)(spec, prefix);
    if (spec.kind === 'diagram')
        return (0, figure_diagram_svg_1.renderDiagramSvg)(spec, prefix);
    return (0, figure_spec_1.isCategoricalChart)(spec) ? (0, figure_chart_svg_1.renderChartSvg)(spec, prefix) : (0, figure_chart_ext_svg_1.renderExtChartSvg)(spec, prefix);
}
function svgToDataUri(svg) {
    return `${exports.SVG_DATA_URI_PREFIX}${Buffer.from(svg, 'utf8').toString('base64')}`;
}
function renderFigure(spec) {
    return {
        src: svgToDataUri(renderFigureSvg(spec)),
        alt: (0, figure_spec_1.figureAlt)(spec),
        kind: (0, figure_spec_1.figureKind)(spec),
        spec,
    };
}
