import React from 'react';
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Legend,
  ResponsiveContainer,
  LabelList,
} from 'recharts';
import { buildChartData, CHART_COLORS } from '../chartUtils';
import type { ChartAxis, ChartDataset } from '@/types/questionstem';
import s from './index.module.scss';

export interface ChartRadarProps {
  axes: ChartAxis[];
  datasets: ChartDataset[];
  height?: number;
}

export const ChartRadar: React.FC<ChartRadarProps> = ({
  axes,
  datasets,
  height = 280,
}) => {
  if (!axes || !datasets) return null;
  const data = buildChartData(axes, datasets);

  return (
    <div className={s.wrapper} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <RadarChart data={data} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
          <PolarGrid stroke="#D9DCE2" />
          <PolarAngleAxis
            dataKey="label"
            tick={{ fontSize: 12, fontFamily: 'Noto Sans KR, sans-serif', fill: '#101113' }}
          />
          <PolarRadiusAxis
            tick={{ fontSize: 10, fill: '#5C6370' }}
            axisLine={false}
          />
          {datasets.map((ds, index) => (
            <Radar
              key={ds.label}
              name={ds.label}
              dataKey={ds.label}
              stroke={CHART_COLORS[index % CHART_COLORS.length]}
              fill={CHART_COLORS[index % CHART_COLORS.length]}
              fillOpacity={0.15}
              strokeWidth={2}
            >
              <LabelList
                dataKey={ds.label}
                position="outside"
                style={{
                  fontSize: 11,
                  fontFamily: 'Noto Sans KR, sans-serif',
                  fill: '#101113',
                  fontWeight: 600,
                }}
              />
            </Radar>
          ))}
          <Legend
            wrapperStyle={{
              fontSize: 12,
              fontFamily: 'Noto Sans KR, sans-serif',
              color: '#101113',
            }}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
};
