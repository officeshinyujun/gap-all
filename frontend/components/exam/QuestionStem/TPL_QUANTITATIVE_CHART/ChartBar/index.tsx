import React from 'react';
import {
  BarChart,
  Bar,
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

export interface ChartBarProps {
  axes: ChartAxis[];
  datasets: ChartDataset[];
  height?: number;
}

export const ChartBar: React.FC<ChartBarProps> = ({
  axes,
  datasets,
  height = 280,
}) => {
  const data = buildChartData(axes, datasets);

  return (
    <div className={s.wrapper} style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          margin={{ top: 24, right: 20, bottom: 8, left: 0 }}
          barCategoryGap="30%"
          barGap={4}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#D9DCE2" vertical={false} />
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
            <Bar
              key={ds.label}
              dataKey={ds.label}
              fill={CHART_COLORS[index % CHART_COLORS.length]}
              radius={[2, 2, 0, 0]}
            >
              <LabelList
                dataKey={ds.label}
                position="top"
                style={{
                  fontSize: 11,
                  fontFamily: 'Noto Sans KR, sans-serif',
                  fill: '#101113',
                  fontWeight: 600,
                }}
              />
            </Bar>
          ))}
          <Legend
            wrapperStyle={{
              fontSize: 12,
              fontFamily: 'Noto Sans KR, sans-serif',
              color: '#101113',
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};
