import { sanitizeSourceBlocksStimulus } from './source-blocks-stimulus';
import { SVG_DATA_URI_MAX_LENGTH, decodeSvgDataUri, isSafeSvgDataUri, svgAllowlistViolation } from './svg-allowlist';

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const ok = `<svg ${NS} viewBox="0 0 10 10" font-family="&#39;Noto Sans KR&#39;,sans-serif"><defs><pattern id="F1-ab12cd-hatch" patternUnits="userSpaceOnUse" width="4" height="4"><line x1="0" y1="0" x2="0" y2="4" stroke="#000"/></pattern><clipPath id="c1"><rect width="10" height="10"/></clipPath></defs><g clip-path="url(#c1)"><rect x="1" y="1" width="3" height="3" fill="url(#F1-ab12cd-hatch)"/><text x="5" y="5" text-anchor="middle">비율(%) &amp; 값<tspan x="5" dy="3">2줄</tspan></text></g></svg>`;
const uri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;

describe('svg allowlist', () => {
  it('accepts the engine vocabulary: shapes, text, local patterns and clip paths', () => {
    expect(svgAllowlistViolation(ok)).toBeNull();
    expect(isSafeSvgDataUri(uri(ok))).toBe(true);
    expect(decodeSvgDataUri(uri(ok))).toBe(ok);
  });

  it.each([
    ['script element', `<svg ${NS}><script>alert(1)</script></svg>`],
    ['foreignObject', `<svg ${NS}><foreignObject><div/></foreignObject></svg>`],
    ['image element', `<svg ${NS}><image x="0" y="0"/></svg>`],
    ['use element', `<svg ${NS}><use x="0"/></svg>`],
    ['style element', `<svg ${NS}><style>rect{fill:red}</style></svg>`],
    ['href attribute', `<svg ${NS}><g href="#a"/></svg>`],
    ['xlink:href attribute', `<svg ${NS}><rect xlink:href="https://x.test/a.svg"/></svg>`],
    ['on* event handler', `<svg ${NS} onload="alert(1)"></svg>`],
    ['event handler on a child', `<svg ${NS}><rect onclick="alert(1)"/></svg>`],
    ['style attribute', `<svg ${NS}><rect style="fill:url(https://x.test/a)"/></svg>`],
    ['external url() paint', `<svg ${NS}><rect fill="url(https://x.test/p.svg#a)"/></svg>`],
    ['javascript: url', `<svg ${NS}><rect fill="url(javascript:alert(1))"/></svg>`],
    ['javascript: in text', `<svg ${NS}><text>javascript:alert(1)</text></svg>`],
    ['external URL in text', `<svg ${NS}><text>https://evil.test</text></svg>`],
    ['other namespace', '<svg xmlns="http://evil.test/ns"></svg>'],
    ['comment', `<svg ${NS}><!-- x --></svg>`],
    ['CDATA', `<svg ${NS}><text><![CDATA[x]]></text></svg>`],
    ['entity declaration', `<!DOCTYPE svg [<!ENTITY x "y">]><svg ${NS}>&x;</svg>`],
    ['unknown entity', `<svg ${NS}><text>&x;</text></svg>`],
    ['unclosed svg', `<svg ${NS}><g>`],
    ['content after svg', `<svg ${NS}></svg><script>alert(1)</script>`],
    ['nested svg', `<svg ${NS}><svg></svg></svg>`],
    ['unquoted attribute', `<svg ${NS}><rect x=1/></svg>`],
    ['bad id', `<svg ${NS}><g id="a b"/></svg>`],
    ['text outside text elements', `<svg ${NS}>hello</svg>`],
  ])('rejects %s', (_, svg) => {
    expect(svgAllowlistViolation(svg)).not.toBeNull();
    expect(isSafeSvgDataUri(uri(svg))).toBe(false);
  });

  it('rejects malformed or oversized data URIs', () => {
    expect(decodeSvgDataUri('data:image/svg+xml;base64,@@@@')).toBeNull();
    expect(decodeSvgDataUri(`data:image/svg+xml;utf8,${ok}`)).toBeNull();
    expect(isSafeSvgDataUri(`data:image/svg+xml;base64,${'A'.repeat(SVG_DATA_URI_MAX_LENGTH)}`)).toBe(false);
    expect(isSafeSvgDataUri(42)).toBe(false);
  });
});

describe('sanitizeSourceBlocksStimulus with SVG figures', () => {
  const data = (src: unknown, extra: Record<string, unknown> = {}) => ({
    blocks: [{ type: 'text', text: '본문' }, { type: 'figure', figure_id: 'F1' }],
    figures: { F1: { src, alt: '막대그래프. …', kind: 'chart', ...extra } },
    choice_table: null,
  });

  it('keeps a safe SVG data URI and preserves the optional spec object', () => {
    const spec = { id: 'F1', kind: 'chart', categories: ['A', 'B'] };
    const sanitized = sanitizeSourceBlocksStimulus(data(uri(ok), { spec }));
    expect(sanitized?.figures.F1).toEqual({ src: uri(ok), alt: '막대그래프. …', kind: 'chart', spec });
    expect(sanitized?.figures.F1.spec).not.toBe(spec);
  });

  it('invalidates only the figure (src null → alt box) when the SVG fails the allowlist', () => {
    for (const bad of [
      `<svg ${NS}><script>alert(1)</script></svg>`,
      `<svg ${NS}><foreignObject/></svg>`,
      `<svg ${NS}><rect href="https://x.test"/></svg>`,
      `<svg ${NS} onload="alert(1)"></svg>`,
    ]) {
      const sanitized = sanitizeSourceBlocksStimulus(data(uri(bad)));
      expect(sanitized).not.toBeNull();
      expect(sanitized?.figures.F1.src).toBeNull();
      expect(sanitized?.figures.F1.alt).toBe('막대그래프. …');
    }
  });

  it('keeps the existing https/null behaviour and rejects other data URIs and non-object specs', () => {
    expect(sanitizeSourceBlocksStimulus(data('https://cdn.test/a.png'))?.figures.F1.src).toBe('https://cdn.test/a.png');
    expect(sanitizeSourceBlocksStimulus(data(null))?.figures.F1).toEqual({ src: null, alt: '막대그래프. …', kind: 'chart' });
    expect(sanitizeSourceBlocksStimulus(data('data:image/png;base64,AAAA'))).toBeNull();
    expect(sanitizeSourceBlocksStimulus(data('http://cdn.test/a.png'))).toBeNull();
    expect(sanitizeSourceBlocksStimulus(data(null, { spec: 'x' }))).toBeNull();
  });
});
