import React from 'react';
import { VStack } from '@shared/ui/VStack';
import { StemBox } from '../_shared/StemBox';
import { StemLabel } from '../_shared/StemLabel';
import type { TPL_REPORT } from '@/types/questionstem';
import s from './index.module.scss';

export interface TPLReportProps {
  data: TPL_REPORT;
  label?: string;
}

export const TPLReport: React.FC<TPLReportProps> = ({ data, label }) => {
  return (
    <StemBox>
      <VStack gap={16} fullWidth>
        <StemLabel>{label}</StemLabel>
        <div className={s.reportBox}>
          <h2 className={s.title}>{data.title}</h2>
          <div className={s.metaRow}>
            {data.author && <span>작성자: {data.author}</span>}
            {data.date && <span>작성일: {data.date}</span>}
          </div>
          {data.metadata && data.metadata.length > 0 && (
            <div className={s.metadataGrid}>
              {data.metadata.map((m, i) => (
                <div key={i} className={s.metaItem}>
                  <span className={s.metaLabel}>{m.label}</span>
                  <span className={s.metaValue}>{m.value}</span>
                </div>
              ))}
            </div>
          )}
          <div className={s.sections}>
            {(data.sections ?? []).map((section, i) => (
              <div key={i} className={s.section}>
                <h3 className={s.sectionHeading}>{section.heading}</h3>
                <p className={s.sectionContent}>{section.content}</p>
                {section.table && (
                  <div className={s.tableWrapper}>
                    <table className={s.table}>
                      <thead>
                        <tr>
                          {section.table.headers.map((h, j) => (
                            <th key={j}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {section.table.rows.map((row, j) => (
                          <tr key={j}>
                            {row.map((cell, k) => (
                              <td key={k}>{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
          {data.conclusion && (
            <div className={s.conclusion}>
              <h3 className={s.conclusionTitle}>결론</h3>
              <p className={s.conclusionContent}>{data.conclusion}</p>
            </div>
          )}
        </div>
      </VStack>
    </StemBox>
  );
};
