import React from 'react';
import cs from 'classnames';
import { VStack } from '@shared/ui/VStack';
import { HStack } from '@shared/ui/HStack';
import type { CanvasContent, CanvasImageData } from '@/types/questionstem';
import s from './index.module.scss';

export interface SceneCanvasProps {
  content?: CanvasContent | null;
  className?: string;
}

/**
 * SceneCanvas
 * 수업 장면의 중앙 칠판/화면 영역.
 * type에 따라 텍스트, 표(2D 배열), 이미지를 렌더링합니다.
 *
 * - type: 'text'  → data: string
 * - type: 'table' → data: string[][] (행 × 열)
 * - type: 'image' → data: { src: string; alt?: string }
 */
export const SceneCanvas: React.FC<SceneCanvasProps> = ({ content, className }) => {
  if (!content) return null;
  const VALID_TYPES = ['text', 'table', 'image', 'mind_map', 'key_map'];
  const safeType = VALID_TYPES.includes(content.type) ? content.type : 'text';
  const data = content.data;
  const renderContent = () => {
    switch (safeType) {
      case 'text':
        return <p className={s.textContent}>{typeof data === 'string' ? data : JSON.stringify(data)}</p>;

      case 'table': {
        const tableData = Array.isArray(data) ? (data as string[][]) : [];
        return (
          <div className={s.tableWrapper}>
            <table className={s.table}>
              <tbody>
                {tableData.map((row, rowIdx) => (
                  <tr key={rowIdx}>
                    {row.map((cell, cellIdx) => (
                      <td
                        key={cellIdx}
                        className={cs(s.td, rowIdx === 0 && s.tdHeader)}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      }

      case 'image': {
        const imgData = data as any;
        if (!imgData || typeof imgData !== 'object') return null;
        return (
          <img
            src={imgData.src}
            alt={imgData.alt ?? '수업 자료'}
            className={s.image}
          />
        );
      }

      case 'mind_map': {
        const raw = typeof data === 'string' ? data : '';
        const colonIdx = raw.indexOf(':');
        const center = colonIdx !== -1 ? raw.slice(0, colonIdx).trim() : raw;
        const branches =
          colonIdx !== -1
            ? raw
                .slice(colonIdx + 1)
                .split(',')
                .map((item: string) => item.replace(/^\[|\]$/g, '').trim())
                .filter(Boolean)
            : [];
        return (
          <VStack gap={12} align="center" className={s.mindMap}>
            <span className={s.mindMapCenter}>{center}</span>
            <HStack gap={8} align="center" justify="center" wrap="wrap" className={s.mindMapBranches}>
              {branches.map((branch: string, idx: number) => (
                <span key={idx} className={s.mindMapBranch}>{branch}</span>
              ))}
            </HStack>
          </VStack>
        );
      }

      case 'key_map': {
        const items = (typeof data === 'string' ? data : '').split('<->').map((s: string) => s.trim());
        return (
          <HStack gap={8} align="center" justify="center" wrap="wrap" className={s.keyMap}>
            {items.map((item, idx) => (
              <React.Fragment key={idx}>
                <span className={s.keyMapItem}>{item}</span>
                {idx < items.length - 1 && (
                  <span className={s.keyMapArrow}>↔</span>
                )}
              </React.Fragment>
            ))}
          </HStack>
        );
      }

      default:
        return null;
    }
  };

  return (
    <VStack gap={8} align="center" className={cs(s.canvas, className)}>
      <div className={s.canvasHeader}>
        <span className={s.canvasLabel}>▣ 학습 자료</span>
      </div>
      <div className={s.canvasBody}>{renderContent()}</div>
    </VStack>
  );
};
