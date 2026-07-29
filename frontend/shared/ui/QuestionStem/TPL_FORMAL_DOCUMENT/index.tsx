import React from 'react';
import { VStack } from '@shared/ui/VStack';
import { StemBox } from '../_shared/StemBox';
import { StemLabel } from '../_shared/StemLabel';
import { DocFootnote } from './DocFootnote';
import type { TPL_FORMAL_DOCUMENT } from '@/types/questionstem';
import s from './index.module.scss';

export interface TPLFormalDocumentProps {
  data: TPL_FORMAL_DOCUMENT;
  label?: string;
}

export const TPLFormalDocument: React.FC<TPLFormalDocumentProps> = ({
  data,
  label,
}) => {
  const headerInfo = data.header_info || { title: '', date: '', author: '' };
  const paragraphs = data.paragraphs || [];
  const footnotes = (data.footnotes || []) || [];

  return (
    <StemBox>
      <VStack gap={16} fullWidth>
        <StemLabel>{label}</StemLabel>

        {/* 문서 전체를 하나의 박스로 */}
        <div className={s.docBox}>

          {/* 헤더 영역 */}
          <div className={s.docHeader}>
            <span className={s.docType}>{data.doc_type}</span>
            <h2 className={s.docTitle}>{headerInfo.title}</h2>
            <div className={s.docMeta}>
              <span className={s.metaItem}>
                <span className={s.metaKey}>날짜</span>
                <span className={s.metaValue}>{headerInfo.date}</span>
              </span>
              <span className={s.metaDivider}>|</span>
              <span className={s.metaItem}>
                <span className={s.metaKey}>작성자</span>
                <span className={s.metaValue}>{headerInfo.author}</span>
              </span>
            </div>
          </div>

          {/* 단락 영역 */}
          <div className={s.docBody}>
            {paragraphs.map((paragraph, index) => (
              <div key={index} className={s.paragraph}>
                {paragraph.sub_title && (
                  <p className={s.subTitle}>{paragraph.sub_title}</p>
                )}
                <p className={s.content}>{paragraph.content}</p>
              </div>
            ))}
          </div>

          {/* 각주 영역 */}
          {(data.footnotes || []).length > 0 && (
            <div className={s.footnoteSection}>
              <div className={s.footnoteDivider} />
              <VStack gap={4} fullWidth>
                {(data.footnotes || []).map((footnote, index) => (
                  <DocFootnote key={index} text={footnote} index={index + 1} />
                ))}
              </VStack>
            </div>
          )}
        </div>
      </VStack>
    </StemBox>
  );
};
