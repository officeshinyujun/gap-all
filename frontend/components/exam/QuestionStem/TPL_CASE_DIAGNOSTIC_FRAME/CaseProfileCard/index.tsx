import React from 'react';
import cs from 'classnames';
import { VStack } from '@shared/ui/VStack';
import { HStack } from '@shared/ui/HStack';
import type { CaseProfile } from '@/types/questionstem';
import s from './index.module.scss';

export interface CaseProfileCardProps {
  profile: CaseProfile;
  className?: string;
}

/**
 * CaseProfileCard
 * 사례 분석의 대상 프로필 박스.
 * name(이름/사례명)과 context(배경 설명)를 수능 사례 지문 스타일로 렌더링합니다.
 */
export const CaseProfileCard: React.FC<CaseProfileCardProps> = ({
  profile,
  className,
}) => {
  return (
    <div className={cs(s.card, className)}>
      <HStack gap={12} align="center" fullWidth>
        <div className={s.avatar}>
          <span className={s.avatarInitial}>
            {profile.name.charAt(0)}
          </span>
        </div>
        <VStack gap={4}>
          <span className={s.name}>{profile.name}</span>
          <span className={s.context}>{profile.context}</span>
        </VStack>
      </HStack>
    </div>
  );
};
