import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  LabelList,
} from 'recharts';
import { buildChartData, CHART_COLORS } from '../chartUtils';
import type { ChartAxis, ChartDataset } from '@/types/questionstem';
import s from './index.module.scss';

export interface ChartLineProps {
  axes: ChartAxis[];
  datasets: ChartDataset[];
  height?: number;
}

export const ChartLine: React.FC<ChartLineProps> = ({
  axes,
  datasets,
  height = 280,
}) => {
  if (!axes || !datasets) return null;
  const data = buildChartData(axes, datasets);

  return (
    <div className={s.wrapper} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={data}
          margin={{ top: 24, right: 20, bottom: 8, left: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#D9DCE2" />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 12, fontFamily: 'Noto Sans KR, sans-serif', fill: '#101113' }}
            axisLine={{ stroke: '#D9DCE2' }}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fontFamily: 'Noto Sans KR, sans-serif', fill: '#5C6370' }}
            axisLine={false}
            tickLine={false}
          />
          {datasets.map((ds, index) => (
            <Line
              key={ds.label}
              type="monotone"
              dataKey={ds.label}
              stroke={CHART_COLORS[index % CHART_COLORS.length]}
              strokeWidth={2}
              dot={{ r: 4, fill: CHART_COLORS[index % CHART_COLORS.length], strokeWidth: 0 }}
              activeDot={false}
            >
              <LabelList
                dataKey={ds.label}
                position="top"
                offset={8}
                style={{
                  fontSize: 11,
                  fontFamily: 'Noto Sans KR, sans-serif',
                  fill: '#101113',
                  fontWeight: 600,
                }}
              />
            </Line>
          ))}
          <Legend
            wrapperStyle={{
              fontSize: 12,
              fontFamily: 'Noto Sans KR, sans-serif',
              color: '#101113',
            }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};
