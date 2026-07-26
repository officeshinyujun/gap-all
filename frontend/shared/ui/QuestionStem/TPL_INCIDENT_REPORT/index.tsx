import React from 'react';
import { VStack } from '@/components/general/VStack';
import { HStack } from '@/components/general/HStack';
import { StemBox } from '../_shared/StemBox';
import { StemLabel } from '../_shared/StemLabel';
import type { TPL_INCIDENT_REPORT } from '@/types/questionstem';
import s from './index.module.scss';

export interface TPLIncidentReportProps {
  data: TPL_INCIDENT_REPORT;
  label?: string;
}

function InfoRow({ label, value }: { label: string; value?: string }) {
  if (!value) return null;
  return (
    <div className={s.infoRow}>
      <span className={s.infoLabel}>{label}</span>
      <span className={s.infoValue}>{value}</span>
    </div>
  );
}

export const TPLIncidentReport: React.FC<TPLIncidentReportProps> = ({ data, label }) => {
  return (
    <StemBox>
      <VStack gap={16} fullWidth>
        <StemLabel>{label}</StemLabel>
        <div className={s.reportBox}>
          <h2 className={s.title}>{data.title}</h2>
          <div className={s.headerBadge}>{data.incident_type}</div>
          <div className={s.infoGrid}>
            <InfoRow label="발생 일시" value={data.date} />
            <InfoRow label="발생 장소" value={data.location} />
            <InfoRow label="피해" value={data.damage} />
            <InfoRow label="대응" value={data.response} />
            <InfoRow label="예방 대책" value={data.prevention} />
          </div>
          <div className={s.section}>
            <h3 className={s.sectionTitle}>사고 개요</h3>
            <p className={s.sectionContent}>{data.overview}</p>
          </div>
          {data.cause && (
            <div className={s.section}>
              <h3 className={s.sectionTitle}>발생 원인</h3>
              <p className={s.sectionContent}>{data.cause}</p>
            </div>
          )}
          {data.timeline && data.timeline.length > 0 && (
            <div className={s.section}>
              <h3 className={s.sectionTitle}>타임라인</h3>
              <div className={s.timeline}>
                {data.timeline.map((ev, i) => (
                  <HStack key={i} gap={8} align="start" className={s.timelineItem}>
                    <span className={s.timelineTime}>{ev.time}</span>
                    <span className={s.timelineArrow}>→</span>
                    <span className={s.timelineEvent}>{ev.event}</span>
                  </HStack>
                ))}
              </div>
            </div>
          )}
        </div>
      </VStack>
    </StemBox>
  );
};
