import React from 'react';
import { VStack } from '@shared/ui/VStack';
import { HStack } from '@shared/ui/HStack';
import { StemBox } from '../_shared/StemBox';
import { StemLabel } from '../_shared/StemLabel';
import type { TPL_ARTICLE } from '@/types/questionstem';
import s from './index.module.scss';

export interface TPLArticleProps {
  data: TPL_ARTICLE;
  label?: string;
}

export const TPLArticle: React.FC<TPLArticleProps> = ({ data, label }) => {
  return (
    <StemBox>
      <VStack gap={16} fullWidth>
        <StemLabel>{label}</StemLabel>
        <div className={s.articleBox}>
          <h2 className={s.title}>{data.title}</h2>
          {data.byline && (
            <p className={s.byline}>{data.byline}</p>
          )}
          {data.published_date && (
            <p className={s.date}>{data.published_date}</p>
          )}
          <div className={s.body}>
            {(data.body_paragraphs ?? []).map((p, i) => (
              <p key={i} className={s.paragraph}>{p}</p>
            ))}
          </div>
          {data.source && (
            <p className={s.source}>출처: {data.source}</p>
          )}
        </div>
      </VStack>
    </StemBox>
  );
};
