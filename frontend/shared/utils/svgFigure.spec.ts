// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { normalizeSourceBlocks } from './sourceBlocks';
import { decodeSvgDataUri, isAllowedSvg, safeInlineSvg } from './svgFigure';
import { ENGINE_FIGURE_SVGS } from './fixtures/engineFigures';

const NS = 'xmlns="http://www.w3.org/2000/svg"';
const SAFE = `<svg ${NS} viewBox="0 0 10 10" font-family="&#39;Noto Sans KR&#39;"><defs><pattern id="F1-ab-hatch" patternUnits="userSpaceOnUse" width="4" height="4"><line x1="0" y1="0" x2="0" y2="4" stroke="#000"/></pattern></defs><rect x="1" y="1" width="3" height="3" fill="url(#F1-ab-hatch)"/><text x="5" y="5">비율(%)</text></svg>`;
const uri = (svg: string) => `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;

describe('svg figure allowlist (client)', () => {
  it('decodes UTF-8 base64 and accepts engine SVG', () => {
    expect(decodeSvgDataUri(uri(SAFE))).toBe(SAFE);
    expect(isAllowedSvg(SAFE)).toBe(true);
    expect(safeInlineSvg(uri(SAFE))).toBe(SAFE);
  });

  it.each([
    `<svg ${NS}><script>alert(1)</script></svg>`,
    `<svg ${NS}><foreignObject><div/></foreignObject></svg>`,
    `<svg ${NS}><image x="0"/></svg>`,
    `<svg ${NS}><use x="0"/></svg>`,
    `<svg ${NS}><rect href="#a"/></svg>`,
    `<svg ${NS}><rect xlink:href="https://x.test/a"/></svg>`,
    `<svg ${NS} onload="alert(1)"></svg>`,
    `<svg ${NS}><rect style="fill:red"/></svg>`,
    `<svg ${NS}><rect fill="url(https://x.test/a)"/></svg>`,
    `<svg ${NS}><text>javascript:alert(1)</text></svg>`,
    `<svg ${NS}><!-- c --></svg>`,
    `<svg ${NS}></svg><img src="x" onerror="alert(1)">`,
  ])('rejects %s', (svg) => {
    expect(isAllowedSvg(svg)).toBe(false);
    expect(safeInlineSvg(uri(svg))).toBeNull();
  });

  it('ignores non-SVG sources and malformed data URIs', () => {
    expect(safeInlineSvg('https://cdn.test/a.png')).toBeNull();
    expect(safeInlineSvg(null)).toBeNull();
    expect(safeInlineSvg('data:image/svg+xml;base64,@@@')).toBeNull();
  });

  it('keeps the data URI src and the optional spec when normalizing stimulus data', () => {
    const data = normalizeSourceBlocks({
      blocks: [{ type: 'figure', figure_id: 'F1' }],
      figures: { F1: { src: uri(SAFE), alt: '그래프', kind: 'chart', spec: { chartType: 'bar' } } },
    });
    expect(data.figures.F1).toEqual({ src: uri(SAFE), alt: '그래프', kind: 'chart', spec: { chartType: 'bar' } });
  });

  it.each(Object.entries(ENGINE_FIGURE_SVGS))('accepts engine %s SVG (polygon arrowheads, tspans, arcs, patterns)', (_, svg) => {
    expect(isAllowedSvg(svg)).toBe(true);
    expect(safeInlineSvg(uri(svg))).toBe(svg);
  });
});
