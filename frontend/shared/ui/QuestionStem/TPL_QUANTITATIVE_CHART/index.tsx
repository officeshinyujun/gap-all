'use client';

import React from 'react';
import { VStack } from '@/components/general/VStack';
import { StemBox } from '../_shared/StemBox';
import { StemLabel } from '../_shared/StemLabel';
import type { TPL_QUANTITATIVE_CHART } from '@/types/questionstem';
import s from './index.module.scss';

export interface TPLQuantitativeChartProps {
  data: TPL_QUANTITATIVE_CHART;
  label?: string;
}

export const TPLQuantitativeChart: React.FC<TPLQuantitativeChartProps> = ({
  data,
  label,
}) => {
  return (
    <StemBox>
      <VStack gap={16} fullWidth>
        <StemLabel>{label}</StemLabel>
        <div className={s.tableWrapper}>
          <table className={s.table}>
            <thead>
              <tr>
                <th className={s.th}>구분</th>
                {data.datasets.map((ds, dsIdx) => (
                  <th key={ds.label ?? dsIdx} className={s.th}>{ds.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.axes.map((axis, axisIdx) => (
                <tr key={axis.key ?? axisIdx}>
                  <td className={s.tdLabel}>{axis.label}</td>
                  {data.datasets.map((ds, dsIdx) => (
                    <td key={ds.label ?? dsIdx} className={s.td}>
                      {ds.values[axisIdx] ?? '-'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </VStack>
    </StemBox>
  );
};
