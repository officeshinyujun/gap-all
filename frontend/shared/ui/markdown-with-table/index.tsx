import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { PipeTable } from '@/shared/ui/pipe-table';

interface MarkdownWithTableProps {
  children: string;
  className?: string;
}

/**
 * Renders markdown content with proper table support.
 *
 * - If the content contains pipe-delimited table blocks, the pipe
 *   lines are extracted and rendered as HTML tables via <PipeTable>.
 * - Non-table content is rendered by ReactMarkdown with GFM support.
 */
export const MarkdownWithTable: React.FC<MarkdownWithTableProps> = ({
  children,
  className,
}) => {
  if (!children) return null;

  // Check for pipe-delimited table content
  const hasPipeTable = children.split('\n').some((line) => {
    const trimmed = line.trim();
    return (
      trimmed.includes('|') &&
      trimmed.split('|').filter((c) => c.trim() !== '').length >= 2
    );
  });

  if (hasPipeTable) {
    return (
      <div className={className}>
        <PipeTable className={className}>{children}</PipeTable>
      </div>
    );
  }

  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{children}</ReactMarkdown>
    </div>
  );
};

export default MarkdownWithTable;
