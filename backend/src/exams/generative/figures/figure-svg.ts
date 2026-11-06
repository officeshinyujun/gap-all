/**
 * figure spec → SVG 문자열 → 앱 figures 항목(data URI).
 * 같은 명세는 항상 같은 SVG가 된다(결정론). 순수 TS(Buffer만 쓰며 Node 18+에서 돈다).
 */
import { stableHash } from '../../../common/stable-hash';
import { renderChartSvg } from './figure-chart-svg';
import { renderExtChartSvg } from './figure-chart-ext-svg';
import { renderDiagramSvg } from './figure-diagram-svg';
import { figureAlt, figureKind, isCategoricalChart, type ExtChartSpec, type FigureSpec } from './figure-spec';
import { renderSceneSvg } from './figure-scene-svg';

export const SVG_DATA_URI_PREFIX = 'data:image/svg+xml;base64,';

export type RenderedFigure = Readonly<{
  src: string;
  alt: string;
  kind: 'chart' | 'diagram' | 'illustration';
  spec: FigureSpec;
}>;

/**
 * 그림 안 id(패턴·클립 경로)에 붙이는 접두: 그림 id + 명세 해시.
 * 한 시험지에 여러 문항의 F1이 함께 인라인되어도 서로 다른 그림의 id가 겹치지 않는다.
 */
export function figureIdPrefix(spec: FigureSpec): string {
  return `${spec.id}-${stableHash(JSON.stringify(spec)).slice(0, 6)}`;
}

export function renderFigureSvg(spec: FigureSpec): string {
  const prefix = figureIdPrefix(spec);
  if (spec.kind === 'scene') return renderSceneSvg(spec, prefix);
  if (spec.kind === 'diagram') return renderDiagramSvg(spec, prefix);
  return isCategoricalChart(spec) ? renderChartSvg(spec, prefix) : renderExtChartSvg(spec as ExtChartSpec, prefix);
}

export function svgToDataUri(svg: string): string {
  return `${SVG_DATA_URI_PREFIX}${Buffer.from(svg, 'utf8').toString('base64')}`;
}

export function renderFigure(spec: FigureSpec): RenderedFigure {
  return {
    src: svgToDataUri(renderFigureSvg(spec)),
    alt: figureAlt(spec),
    kind: figureKind(spec),
    spec,
  };
}
