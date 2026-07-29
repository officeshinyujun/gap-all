import React from 'react';
import { VStack } from '@shared/ui/VStack';
import { HStack } from '@shared/ui/HStack';
import { StemBox } from '../_shared/StemBox';
import { StemLabel } from '../_shared/StemLabel';
import type { TPL_ANNOUNCEMENT } from '@/types/questionstem';
import s from './index.module.scss';

export interface TPLAnnouncementProps {
  data: TPL_ANNOUNCEMENT;
  label?: string;
}

export const TPLAnnouncement: React.FC<TPLAnnouncementProps> = ({ data, label }) => {
  return (
    <StemBox>
      <VStack gap={16} fullWidth>
        <StemLabel>{label}</StemLabel>
        <div className={s.annBox}>
          <h2 className={s.title}>{data.title}</h2>
          <div className={s.metaRow}>
            <span className={s.orgLabel}>주최: {data.organizer}</span>
            {data.schedule && (
              <span className={s.scheduleLabel}>
                기간: {data.schedule.start}{data.schedule.end ? ` ~ ${data.schedule.end}` : ''}
              </span>
            )}
          </div>
          {data.target && (
            <div className={s.targetRow}>
              <span className={s.targetLabel}>대상: {data.target}</span>
            </div>
          )}
          {data.location && (
            <div className={s.locationRow}>
              <span className={s.locationLabel}>장소: {data.location}</span>
            </div>
          )}
          <div className={s.details}>
            {(data.details ?? []).map((d, i) => (
              <div key={i} className={s.detailItem}>
                <span className={s.detailLabel}>[{d.label}]</span>
                <span className={s.detailContent}>{d.content}</span>
              </div>
            ))}
          </div>
          {data.contact && (
            <div className={s.contactRow}>
              <span className={s.contactLabel}>문의: {data.contact}</span>
            </div>
          )}
        </div>
      </VStack>
    </StemBox>
  );
};
