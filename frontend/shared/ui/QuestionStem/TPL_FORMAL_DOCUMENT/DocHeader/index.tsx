import React from 'react';
import cs from 'classnames';
import { VStack } from '@shared/ui/VStack';
import { HStack } from '@shared/ui/HStack';
import type { DocHeaderInfo } from '@/types/questionstem';
import s from './index.module.scss';

export interface DocHeaderProps {
  docType: string;
  headerInfo: DocHeaderInfo;
  className?: string;
}

/**
 * DocHeader
 * 공문서/보고서 상단 헤더 박스.
 * 문서 유형, 제목, 날짜, 작성자를 수능 공문서 지문 스타일로 렌더링합니다.
 */
export const DocHeader: React.FC<DocHeaderProps> = ({
  docType,
  headerInfo,
  className,
}) => {
  return (
    <div className={cs(s.headerBox, className)}>
      <VStack gap={8} fullWidth align="center">
        <span className={s.docType}>{docType}</span>
        <h2 className={s.title}>{headerInfo.title}</h2>
        <HStack gap={24} justify="center" fullWidth>
          <span className={s.meta}>
            <span className={s.metaKey}>날짜</span>
            <span className={s.metaValue}>{headerInfo.date}</span>
          </span>
          <span className={s.divider}>|</span>
          <span className={s.meta}>
            <span className={s.metaKey}>작성자</span>
            <span className={s.metaValue}>{headerInfo.author}</span>
          </span>
        </HStack>
      </VStack>
    </div>
  );
};
