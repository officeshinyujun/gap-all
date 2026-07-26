'use client';

import React from 'react';
import { VStack } from '@shared/ui/VStack';
import { StemBox } from '../_shared/StemBox';
import { StemLabel } from '../_shared/StemLabel';
import type { TPL_QUANTITATIVE_CHART } from '@/types/questionstem';
import { ChartBar } from './ChartBar';
import { ChartLine } from './ChartLine';
import { ChartRadar } from './ChartRadar';
import s from './index.module.scss';

export interface TPLQuantitativeChartProps {
  data: TPL_QUANTITATIVE_CHART;
  label?: string;
}

export const TPLQuantitativeChart: React.FC<TPLQuantitativeChartProps> = ({
  data,
  label,
}) => {
  const datasets = data.datasets ?? [];
  const axes = data.axes ?? [];
  if (datasets.length === 0 || axes.length === 0) return null;
  const renderChart = () => {
    switch (data.chart_type) {
      case 'bar':
        return <ChartBar axes={axes} datasets={datasets} />;
      case 'line':
        return <ChartLine axes={axes} datasets={datasets} />;
      case 'radar':
        return <ChartRadar axes={axes} datasets={datasets} />;
      default:
        return (
          <div className={s.tableWrapper}>
            <table className={s.table}>
              <thead>
                <tr>
                  <th className={s.th}>구분</th>
                  {datasets.map((ds, dsIdx) => (
                    <th key={ds.label ?? dsIdx} className={s.th}>{ds.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {axes.map((axis, axisIdx) => (
                  <tr key={axis.key ?? axisIdx}>
                    <td className={s.tdLabel}>{axis.label}</td>
                    {datasets.map((ds, dsIdx) => (
                      <td key={ds.label ?? dsIdx} className={s.td}>
                        {(ds.values ?? [])[axisIdx] ?? '-'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
    }
  };

  return (
    <StemBox>
      <VStack gap={16} fullWidth>
        <StemLabel>{label}</StemLabel>
        {renderChart()}
      </VStack>
    </StemBox>
  );
};
