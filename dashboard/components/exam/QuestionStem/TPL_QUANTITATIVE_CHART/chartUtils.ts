import type { ChartAxis, ChartDataset } from '@/types/questionstem';

/**
 * axes + datasets → Recharts용 data 배열로 변환
 *
 * 결과 예시:
 * [
 *   { key: 'math', label: '수학', max: 100, 국어: 80, 영어: 70 },
 *   ...
 * ]
 */
export const buildChartData = (
  axes: ChartAxis[],
  datasets: ChartDataset[],
): Record<string, string | number>[] => {
  const safeAxes = axes ?? [];
  const safeDatasets = datasets ?? [];
  return safeAxes.map((axis, axisIdx) => {
    const entry: Record<string, string | number> = {
      key: axis.key,
      label: axis.label,
      max: axis.max,
    };
    safeDatasets.forEach((ds) => {
      entry[ds.label] = ds.values[axisIdx] ?? 0;
    });
    return entry;
  });
};

/** 수능 시험지 느낌의 차트 색상 팔레트 (SCSS 변수 기반) */
export const CHART_COLORS = [
  '#3E78F7', // brand-primary
  '#5C6370', // text-secondary
  '#89DA7F', // text-correct
  '#DA7F7F', // text-wrong
  '#C1D3FA', // brand-secondary
];
