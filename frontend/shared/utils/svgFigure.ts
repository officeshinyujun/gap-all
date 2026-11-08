// ============================================================
// AI 출제 그림(인라인 SVG data URI) 안전 검사 — Web·PDF 렌더러 공용
// 서버(backend/src/exams/svg-allowlist.ts)와 같은 허용 목록을 한 번 더 적용한다.
// 인라인으로 넣어야 SVG 글자가 페이지 웹 글꼴(Noto Sans KR)을 쓴다(<img> 안 SVG는 웹 글꼴을 못 씀).
// ============================================================

export const SVG_DATA_URI_PREFIX = 'data:image/svg+xml;base64,';
const SVG_DATA_URI_MAX_LENGTH = 200 * 1024;

const ALLOWED_TAGS = new Set([
  'svg', 'g', 'defs', 'pattern', 'clipPath', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon',
  'path', 'text', 'tspan', 'title', 'desc',
]);

const ALLOWED_ATTRIBUTES = new Set([
  'xmlns', 'id', 'viewBox', 'width', 'height', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'cx', 'cy', 'r', 'rx', 'ry',
  'dx', 'dy', 'd', 'points', 'transform', 'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width',
  'stroke-dasharray', 'stroke-dashoffset', 'stroke-linecap', 'stroke-linejoin', 'stroke-opacity',
  'stroke-miterlimit', 'opacity', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor',
  'dominant-baseline', 'letter-spacing', 'patternUnits', 'patternContentUnits', 'patternTransform',
  'clip-path', 'clipPathUnits', 'clip-rule', 'preserveAspectRatio', 'role', 'aria-label', 'aria-hidden',
  'vector-effect', 'shape-rendering', 'paint-order',
]);

const TEXT_TAGS = new Set(['text', 'tspan', 'title', 'desc']);
const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const TAG_PATTERN = /<(\/?)([A-Za-z][A-Za-z0-9]*)((?:\s+[A-Za-z][A-Za-z0-9-]*\s*=\s*(?:"[^"<>]*"|'[^'<>]*'))*)\s*(\/?)>/g;
const ATTRIBUTE_PATTERN = /([A-Za-z][A-Za-z0-9-]*)\s*=\s*(?:"([^"<>]*)"|'([^'<>]*)')/g;
const ID_VALUE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/;
const LOCAL_URL = /^url\(#[A-Za-z][A-Za-z0-9_-]{0,63}\)$/;
const ENTITY = /&(?!(?:amp|lt|gt|quot|apos|#\d{1,6}|#x[0-9A-Fa-f]{1,6});)/;
const EXTERNAL = /javascript\s*:|data\s*:|https?\s*:\/\/|\/\//i;

export function isSvgDataUri(src: string | null | undefined): src is string {
  return typeof src === 'string' && src.startsWith(SVG_DATA_URI_PREFIX);
}

/** base64 SVG data URI → SVG 문자열(UTF-8). 형식이 틀리면 null. */
export function decodeSvgDataUri(src: string): string | null {
  if (!isSvgDataUri(src) || src.length > SVG_DATA_URI_MAX_LENGTH) return null;
  const payload = src.slice(SVG_DATA_URI_PREFIX.length);
  if (!payload || payload.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(payload)) return null;
  try {
    const binary = atob(payload);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

function attributeViolation(tag: string, attributeText: string): boolean {
  const seen = new Set<string>();
  let consumed = '';
  for (const match of attributeText.matchAll(ATTRIBUTE_PATTERN)) {
    consumed += match[0];
    const name = match[1];
    const value = match[2] ?? match[3] ?? '';
    if (seen.has(name) || !ALLOWED_ATTRIBUTES.has(name)) return true;
    seen.add(name);
    if (name === 'xmlns' && (tag !== 'svg' || value !== SVG_NAMESPACE)) return true;
    if (name === 'id' && !ID_VALUE.test(value)) return true;
    if (/url\s*\(/i.test(value) && !LOCAL_URL.test(value.trim())) return true;
    if (/[\\@]|expression\s*\(/i.test(value)) return true;
  }
  return consumed.replace(/\s+/g, '') !== attributeText.replace(/\s+/g, '');
}

/** 허용 목록 검사: 통과하면 true. script·foreignObject·image·use·href·on*·style·외부 URL은 모두 거부한다. */
export function isAllowedSvg(svg: string): boolean {
  const source = svg.trim();
  if (!source.startsWith('<svg') || /<[!?]/.test(source) || ENTITY.test(source)) return false;
  if (EXTERNAL.test(source.split(`xmlns="${SVG_NAMESPACE}"`).join(''))) return false;
  const stack: string[] = [];
  let cursor = 0;
  let rootClosed = false;
  for (const match of source.matchAll(TAG_PATTERN)) {
    const start = match.index ?? 0;
    const between = source.slice(cursor, start);
    if (between.includes('<') || between.includes('>') || rootClosed) return false;
    if (between.trim() !== '' && !TEXT_TAGS.has(stack[stack.length - 1] ?? '')) return false;
    cursor = start + match[0].length;
    const [, closing, tag, attributeText, selfClosing] = match;
    if (!ALLOWED_TAGS.has(tag)) return false;
    if (closing === '/') {
      if (attributeText.trim() !== '' || selfClosing === '/' || stack.pop() !== tag) return false;
      if (stack.length === 0) rootClosed = true;
      continue;
    }
    if ((stack.length === 0) !== (tag === 'svg')) return false;
    if (attributeViolation(tag, attributeText)) return false;
    if (selfClosing === '/') {
      if (stack.length === 0) rootClosed = true;
    } else {
      stack.push(tag);
    }
  }
  return source.slice(cursor).trim() === '' && stack.length === 0 && rootClosed;
}

/** 인라인으로 넣어도 안전한 SVG 마크업. 아니면 null(호출 측은 설명 상자를 보여 준다). */
export function safeInlineSvg(src: string | null | undefined): string | null {
  if (!isSvgDataUri(src)) return null;
  const svg = decodeSvgDataUri(src);
  return svg !== null && isAllowedSvg(svg) ? svg : null;
}
