import React from 'react';
import { VStack } from '@/components/general/VStack';
import { HStack } from '@/components/general/HStack';
import { StemBox } from '../_shared/StemBox';
import { StemLabel } from '../_shared/StemLabel';
import { CaseCheckItem } from './CaseCheckItem';
import type { TPL_CASE_DIAGNOSTIC_FRAME } from '@/types/questionstem';
import s from './index.module.scss';

export interface TPLCaseDiagnosticFrameProps {
  data: TPL_CASE_DIAGNOSTIC_FRAME;
  label?: string;
}

export const TPLCaseDiagnosticFrame: React.FC<TPLCaseDiagnosticFrameProps> = ({
  data,
  label,
}) => {
  const profile = data.case_profile;
  const narrative = data.narrative || '';

  return (
    <StemBox>
      <VStack gap={16} fullWidth>
        <StemLabel>{label}</StemLabel>

        {/* 프로필 + 서술 통합 박스 */}
        <div className={s.caseBox}>
          {/* 프로필 헤더 */}
          {profile && (
            <div className={s.profileHeader}>
              <HStack gap={10} align="center">
                <div className={s.avatar}>
                  <span className={s.avatarInitial}>{profile.name?.charAt(0) || '?'}</span>
                </div>
                <VStack gap={2}>
                  <span className={s.profileName}>{profile.name || '알 수 없음'}</span>
                  <span className={s.profileContext}>{profile.context || ''}</span>
                </VStack>
              </HStack>
            </div>
          )}

          {/* 서술 본문 */}
          {narrative && (
            <div className={s.narrativeBody}>
              <p className={s.narrativeText}>{narrative}</p>
            </div>
          )}
        </div>
      </VStack>
    </StemBox>
  );
};
