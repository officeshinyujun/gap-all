/**
 * 그림 src로 허용하는 인라인 SVG(data:image/svg+xml;base64,…)의 엄격한 허용 목록 검사.
 *
 * 앱은 이 SVG를 페이지에 인라인으로 넣는다(웹 글꼴을 쓰기 위해). 그래서 스크립트·외부 참조가 될 수 있는 것은
 * 모두 거부한다: 허용 태그·속성 밖의 것, script/foreignObject/image/use, href·xlink:href, on* 이벤트,
 * style 속성·요소, url(#로컬 id) 밖의 url(), javascript:, 외부 URL, 주석·CDATA·처리 지시·DOCTYPE·엔티티 선언.
 * 프런트엔드(frontend/shared/utils/svgFigure.ts)가 같은 규칙을 한 번 더 적용한다.
 */

export const SVG_DATA_URI_PREFIX = 'data:image/svg+xml;base64,';
/** base64 문자열 기준 최대 길이(약 200KB) */
export const SVG_DATA_URI_MAX_LENGTH = 200 * 1024;

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

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
const TAG_PATTERN = /<(\/?)([A-Za-z][A-Za-z0-9]*)((?:\s+[A-Za-z][A-Za-z0-9-]*\s*=\s*(?:"[^"<>]*"|'[^'<>]*'))*)\s*(\/?)>/gu;
const ATTRIBUTE_PATTERN = /([A-Za-z][A-Za-z0-9-]*)\s*=\s*(?:"([^"<>]*)"|'([^'<>]*)')/gu;
const ID_VALUE = /^[A-Za-z][A-Za-z0-9_-]{0,63}$/u;
const LOCAL_URL = /^url\(#[A-Za-z][A-Za-z0-9_-]{0,63}\)$/u;
const ENTITY = /&(?!(?:amp|lt|gt|quot|apos|#\d{1,6}|#x[0-9A-Fa-f]{1,6});)/u;

/** 검사 통과면 null, 아니면 거부 사유 */
export function svgAllowlistViolation(svg: string): string | null {
  const source = svg.trim();
  if (!source.startsWith('<svg')) return 'SVG가 <svg>로 시작하지 않습니다.';
  if (/<[!?]/u.test(source)) return '주석·CDATA·DOCTYPE·처리 지시는 허용하지 않습니다.';
  if (ENTITY.test(source)) return '허용하지 않는 엔티티 참조가 있습니다.';
  if (/javascript\s*:|data\s*:|https?\s*:\/\/(?!www\.w3\.org\/2000\/svg)|\/\//iu.test(source.replace(/xmlns="http:\/\/www\.w3\.org\/2000\/svg"/gu, ''))) {
    return '외부 URL·스크립트 URL이 있습니다.';
  }
  const stack: string[] = [];
  let cursor = 0;
  let rootClosed = false;
  for (const match of source.matchAll(TAG_PATTERN)) {
    const start = match.index ?? 0;
    const between = source.slice(cursor, start);
    if (between.includes('<') || between.includes('>')) return '해석할 수 없는 태그가 있습니다.';
    if (between.trim() !== '' && !['text', 'tspan', 'title', 'desc'].includes(stack[stack.length - 1] ?? '')) {
      return '글자는 text·tspan·title·desc 안에만 둘 수 있습니다.';
    }
    if (rootClosed) return '<svg> 뒤에 내용이 있습니다.';
    cursor = start + match[0].length;
    const [, closing, tag, attributeText, selfClosing] = match;
    if (!ALLOWED_TAGS.has(tag)) return `허용하지 않는 요소 <${tag}>`;
    if (closing === '/') {
      if (attributeText.trim() !== '' || selfClosing === '/') return `닫는 태그 </${tag}> 형식이 잘못되었습니다.`;
      if (stack.pop() !== tag) return `</${tag}> 짝이 맞지 않습니다.`;
      if (stack.length === 0) rootClosed = true;
      continue;
    }
    if (stack.length === 0 && tag !== 'svg') return '최상위 요소는 <svg>여야 합니다.';
    if (stack.length > 0 && tag === 'svg') return '<svg> 안에 <svg>를 둘 수 없습니다.';
    const issue = attributeViolation(tag, attributeText);
    if (issue !== null) return issue;
    if (selfClosing === '/') {
      if (stack.length === 0) rootClosed = true;
    } else {
      stack.push(tag);
    }
  }
  if (source.slice(cursor).trim() !== '') return '<svg> 뒤에 내용이 있습니다.';
  if (stack.length !== 0 || !rootClosed) return '<svg>가 닫히지 않았습니다.';
  return null;
}

function attributeViolation(tag: string, attributeText: string): string | null {
  const seen = new Set<string>();
  let consumed = '';
  for (const match of attributeText.matchAll(ATTRIBUTE_PATTERN)) {
    consumed += match[0];
    const name = match[1];
    const value = match[2] ?? match[3] ?? '';
    if (seen.has(name)) return `<${tag}> 속성 ${name}이(가) 중복됩니다.`;
    seen.add(name);
    if (!ALLOWED_ATTRIBUTES.has(name)) return `허용하지 않는 속성 ${name}`;
    if (name === 'xmlns' && (tag !== 'svg' || value !== SVG_NAMESPACE)) return 'xmlns는 <svg>의 SVG 이름공간만 허용합니다.';
    if (name === 'id' && !ID_VALUE.test(value)) return `id "${value}" 형식이 잘못되었습니다.`;
    if (/url\s*\(/iu.test(value) && !LOCAL_URL.test(value.trim())) return '로컬 id(url(#…)) 밖의 url()은 허용하지 않습니다.';
    if (/[\\@]|expression\s*\(/iu.test(value)) return `속성 ${name} 값에 허용하지 않는 문자가 있습니다.`;
  }
  if (consumed.replace(/\s+/gu, '') !== attributeText.replace(/\s+/gu, '')) return `<${tag}> 속성을 해석할 수 없습니다.`;
  return null;
}

/** data URI를 SVG 문자열로 푼다. 형식이 틀리면 null. */
export function decodeSvgDataUri(src: string): string | null {
  if (!src.startsWith(SVG_DATA_URI_PREFIX) || src.length > SVG_DATA_URI_MAX_LENGTH) return null;
  const payload = src.slice(SVG_DATA_URI_PREFIX.length);
  if (payload === '' || !/^[A-Za-z0-9+/]+={0,2}$/u.test(payload) || payload.length % 4 !== 0) return null;
  try {
    const decoded = Buffer.from(payload, 'base64').toString('utf8');
    return decoded.includes('�') ? null : decoded;
  } catch {
    return null;
  }
}

/** 안전한 인라인 SVG data URI인가 */
export function isSafeSvgDataUri(src: unknown): src is string {
  if (typeof src !== 'string') return false;
  const svg = decodeSvgDataUri(src);
  return svg !== null && svgAllowlistViolation(svg) === null;
}
