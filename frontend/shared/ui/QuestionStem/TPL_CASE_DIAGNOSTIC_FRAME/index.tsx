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
  const narrative = data.narrative || '';
  const profiles = Array.isArray(data.case_profile)
    ? data.case_profile
    : data.case_profile
      ? [data.case_profile]
      : [];

  return (
    <StemBox>
      <VStack gap={16} fullWidth>
        <StemLabel>{label}</StemLabel>

        {/* 프로필 + 서술 통합 박스 */}
        <div className={s.caseBox}>
          {/* 프로필 헤더 (단일 또는 복수) */}
          {profiles.map((profile, pi) => (
            <div key={profile.name || `profile-${pi}`} className={pi > 0 ? s.profileHeader + ' ' + s.profileHeaderGap : s.profileHeader}>
              <HStack gap={10} align="center">
                <div className={s.avatar}>
                  <span className={s.avatarInitial}>{profile.name?.charAt(0) || '?'}</span>
                </div>
                <VStack gap={2}>
                  <span className={s.profileName}>{profile.name || '알 수 없음'}</span>
                  {profile.context ? (
                    <span className={s.profileContext}>{profile.context}</span>
                  ) : null}
                </VStack>
              </HStack>
            </div>
          ))}

          {/* 서술 본문 */}
          {narrative && (
            <div className={s.narrativeBody}>
              <p className={s.narrativeText}>{narrative}</p>
            </div>
          )}

          {/* 체크리스트 항목 */}
          {Array.isArray(data.check_items) && data.check_items.length > 0 && (
            <div className={s.checkItemsSection}>
              {data.check_items.map((item, i) => (
                <CaseCheckItem key={item.id || `ci-${i}`} item={item} />
              ))}
            </div>
          )}
        </div>
      </VStack>
    </StemBox>
  );
};
