import React from 'react';
import cs from 'classnames';
import { HStack } from '@/components/general/HStack';
import s from './index.module.scss';

export interface PromoBulletProps {
  text: string;
  /** 불릿 인덱스 (0부터 시작, 아이콘 변형용) */
  index: number;
  className?: string;
}

const BULLET_ICONS = ['▶', '◆', '●', '★', '■'];

/**
 * PromoBullet
 * 광고/홍보물의 불릿 항목.
 * 수능 영어 광고문 지문의 특징/혜택 목록 항목을 렌더링합니다.
 */
export const PromoBullet: React.FC<PromoBulletProps> = ({
  text,
  index,
  className,
}) => {
  return (
    <HStack gap={8} align="start" className={cs(s.bullet, className)}>
      <span className={s.icon}>{BULLET_ICONS[index % BULLET_ICONS.length]}</span>
      <span className={s.text}>{text}</span>
    </HStack>
  );
};
