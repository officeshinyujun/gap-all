import React from 'react';
import { VStack } from '@shared/ui/VStack';
import { StemBox } from '../_shared/StemBox';
import { StemLabel } from '../_shared/StemLabel';
import type { TPL_STATISTICS, StatisticsEntry } from '@/types/questionstem';
import s from './index.module.scss';

export interface TPLStatisticsProps {
  data: TPL_STATISTICS;
  label?: string;
}

export const TPLStatistics: React.FC<TPLStatisticsProps> = ({ data, label }) => {
  const entries = data.data_entries ?? [];
  return (
    <StemBox>
      <VStack gap={16} fullWidth>
        <StemLabel>{label}</StemLabel>
        <div className={s.statBox}>
          <h2 className={s.title}>{data.title}</h2>
          {data.category_label && (
            <p className={s.categoryLabel}>구분: {data.category_label}</p>
          )}
          <table className={s.table}>
            <thead>
              <tr>
                <th>{data.category_label || '항목'}</th>
                <th>{data.unit || '값'}</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry: StatisticsEntry, i: number) => (
                <tr key={i}>
                  <td className={s.labelCell}>
                    {entry.label}
                    {entry.sub_label && (
                      <span className={s.subLabel}> ({entry.sub_label})</span>
                    )}
                  </td>
                  <td className={s.valueCell}>{entry.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.source && (
            <p className={s.source}>출처: {data.source}</p>
          )}
        </div>
      </VStack>
    </StemBox>
  );
};
