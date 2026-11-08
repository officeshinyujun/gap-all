"use strict";
/** 그림 SVG를 문자열로 만드는 작은 도우미(순수 TS). 렌더러끼리 공유한다. */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SVG_NS = exports.FIGURE_FONT_FAMILY = void 0;
exports.fmt = fmt;
exports.escapeXml = escapeXml;
exports.el = el;
exports.textEl = textEl;
exports.multilineText = multilineText;
exports.svgRoot = svgRoot;
exports.textWidth = textWidth;
exports.wrapText = wrapText;
exports.arrowHead = arrowHead;
exports.arrowLine = arrowLine;
exports.arrowPath = arrowPath;
exports.centeredLines = centeredLines;
exports.FIGURE_FONT_FAMILY = "'Noto Sans KR','Apple SD Gothic Neo','Malgun Gothic','NanumGothic',sans-serif";
exports.SVG_NS = 'http://www.w3.org/2000/svg';
function fmt(value) {
    const rounded = Math.round(value * 100) / 100;
    return Object.is(rounded, -0) ? '0' : String(rounded);
}
function escapeXml(value) {
    return value
        .replace(/&/gu, '&amp;')
        .replace(/</gu, '&lt;')
        .replace(/>/gu, '&gt;')
        .replace(/"/gu, '&quot;')
        .replace(/'/gu, '&#39;');
}
function attrs(values) {
    return Object.entries(values)
        .filter(([, value]) => value !== undefined && value !== null && value !== '')
        .map(([key, value]) => ` ${key}="${typeof value === 'number' ? fmt(value) : escapeXml(String(value))}"`)
        .join('');
}
function el(tag, values = {}, children) {
    const inner = children === undefined ? undefined : Array.isArray(children) ? children.join('') : children;
    return inner === undefined || inner === '' ? `<${tag}${attrs(values)}/>` : `<${tag}${attrs(values)}>${inner}</${tag}>`;
}
function textEl(x, y, content, values = {}) {
    return `<text${attrs({ x, y, ...values })}>${escapeXml(content)}</text>`;
}
/** 여러 줄 글자: 줄마다 tspan(가운데 정렬 기준점 x) */
function multilineText(x, y, lines, lineHeight, values = {}) {
    if (lines.length === 1)
        return textEl(x, y, lines[0] ?? '', values);
    const spans = lines.map((line, index) => `<tspan${attrs({ x, dy: index === 0 ? 0 : lineHeight })}>${escapeXml(line)}</tspan>`);
    return `<text${attrs({ x, y, ...values })}>${spans.join('')}</text>`;
}
function svgRoot(width, height, body, extra = {}) {
    return `<svg${attrs({
        xmlns: exports.SVG_NS,
        viewBox: `0 0 ${fmt(width)} ${fmt(height)}`,
        'font-family': exports.FIGURE_FONT_FAMILY,
        ...extra,
    })}>${body.join('')}</svg>`;
}
/** 글자 폭 어림(한글·전각 1em, 숫자·라틴 0.58em, 공백 0.3em) */
function textWidth(value, fontSize) {
    let width = 0;
    for (const char of value) {
        const code = char.codePointAt(0) ?? 0;
        if (char === ' ')
            width += 0.3;
        else if (code >= 0x1100 || '○△□●■◆◇％'.includes(char))
            width += 1;
        else if (/[()[\],.:;'’‘|]/u.test(char))
            width += 0.35;
        else if (/[%MWmw@]/u.test(char))
            width += 0.85;
        else
            width += 0.58;
    }
    return width * fontSize;
}
/** 폭 안에 들어가게 어절 단위로 줄을 나눈다(어절 하나가 넘치면 글자 단위). 최대 maxLines줄. */
function wrapText(value, maxWidth, fontSize, maxLines = 2) {
    if (textWidth(value, fontSize) <= maxWidth)
        return [value];
    const words = value.split(/\s+/u).filter((word) => word !== '');
    const lines = [];
    let current = '';
    const pushWord = (word) => {
        const candidate = current === '' ? word : `${current} ${word}`;
        if (textWidth(candidate, fontSize) <= maxWidth || current === '') {
            current = candidate;
        }
        else {
            lines.push(current);
            current = word;
        }
    };
    for (const word of words) {
        if (textWidth(word, fontSize) > maxWidth) {
            // 어절이 너무 길면 글자 단위로 나눈다.
            for (const char of word) {
                if (textWidth(current + char, fontSize) > maxWidth && current !== '') {
                    lines.push(current);
                    current = char;
                }
                else {
                    current += char;
                }
            }
            continue;
        }
        pushWord(word);
    }
    if (current !== '')
        lines.push(current);
    if (lines.length <= maxLines)
        return lines;
    return [...lines.slice(0, maxLines - 1), lines.slice(maxLines - 1).join(' ')];
}
/** 채운 삼각형 화살촉(끝점 x,y, 방향 각도: 0=오른쪽, 90=아래). <marker> 대신 polygon만 쓴다. */
function arrowHead(x, y, degrees, size = 8, fill = '#000') {
    const angle = (degrees * Math.PI) / 180;
    const back = (offset) => {
        const bx = x - size * Math.cos(angle) + offset * Math.sin(angle);
        const by = y - size * Math.sin(angle) - offset * Math.cos(angle);
        return `${fmt(bx)},${fmt(by)}`;
    };
    return el('polygon', { points: `${fmt(x)},${fmt(y)} ${back(size * 0.42)} ${back(-size * 0.42)}`, fill });
}
/** 화살표 선(끝에 화살촉). both면 양쪽에. */
function arrowLine(x1, y1, x2, y2, options = {}) {
    const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
    const size = options.size ?? 8;
    const shorten = size * 0.8;
    const length = Math.hypot(x2 - x1, y2 - y1) || 1;
    const ux = (x2 - x1) / length;
    const uy = (y2 - y1) / length;
    const sx = options.both ? x1 + ux * shorten : x1;
    const sy = options.both ? y1 + uy * shorten : y1;
    return [
        el('line', { x1: sx, y1: sy, x2: x2 - ux * shorten, y2: y2 - uy * shorten, stroke: '#000', 'stroke-width': options.width ?? 1.3, 'stroke-dasharray': options.dash }),
        arrowHead(x2, y2, angle, size),
        options.both ? arrowHead(x1, y1, angle + 180, size) : '',
    ].join('');
}
/** 꺾인 경로 화살표(마지막 선분 방향으로 화살촉) */
function arrowPath(points, options = {}) {
    if (points.length < 2)
        return '';
    const size = options.size ?? 8;
    const [px, py] = points[points.length - 2];
    const [x, y] = points[points.length - 1];
    const length = Math.hypot(x - px, y - py) || 1;
    const trimmed = [...points.slice(0, -1), [x - ((x - px) / length) * size * 0.8, y - ((y - py) / length) * size * 0.8]];
    return [
        el('polyline', { points: trimmed.map(([a, b]) => `${fmt(a)},${fmt(b)}`).join(' '), fill: 'none', stroke: '#000', 'stroke-width': options.width ?? 1.3, 'stroke-linejoin': 'round' }),
        arrowHead(x, y, (Math.atan2(y - py, x - px) * 180) / Math.PI, size),
    ].join('');
}
/** 상자 안 여러 줄 글자(가운데 정렬) */
function centeredLines(cx, cy, lines, fontSize, lineHeight = fontSize + 3, values = {}) {
    const startY = cy - ((lines.length - 1) * lineHeight) / 2 + fontSize * 0.36;
    return multilineText(cx, startY, lines, lineHeight, { 'text-anchor': 'middle', 'font-size': fontSize, ...values });
}
