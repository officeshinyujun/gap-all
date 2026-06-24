import React from 'react';
import { VStack } from '@shared/ui/VStack';
import { HStack } from '@shared/ui/HStack';
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
  return (
    <StemBox>
      <VStack gap={16} fullWidth>
        <StemLabel>{label}</StemLabel>

        {/* 프로필 + 서술 통합 박스 */}
        <div className={s.caseBox}>
          {/* 프로필 헤더 */}
          <div className={s.profileHeader}>
            <HStack gap={10} align="center">
              <div className={s.avatar}>
                <span className={s.avatarInitial}>{data.case_profile.name.charAt(0)}</span>
              </div>
              <VStack gap={2}>
                <span className={s.profileName}>{data.case_profile.name}</span>
                <span className={s.profileContext}>{data.case_profile.context}</span>
              </VStack>
            </HStack>
          </div>

          {/* 서술 본문 */}
          <div className={s.narrativeBody}>
            <p className={s.narrativeText}>{data.narrative}</p>
          </div>
        </div>
      </VStack>
    </StemBox>
  );
};
