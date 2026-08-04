import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { PipeTable } from '@/shared/ui/pipe-table';

interface MarkdownWithTableProps {
  children: string;
  className?: string;
}

/**
 * Checks if a line is a GFM table separator (e.g. |---|---|)
 */
function isGfmSeparator(line: string): boolean {
  return /^\|?[\s:-]+\|[\s|:-]+\|?$/.test(line.trim());
}

/**
 * Checks if a line is a table row (starts/ends with | or has | separator)
 */
function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  return (
    trimmed.includes('|') &&
    trimmed.split('|').filter((c) => c.trim() !== '').length >= 2
  );
}

/**
 * Detects whether the content contains GFM-style tables
 * (header row followed by separator row) or pure pipe tables.
 *
 * Only routes to PipeTable when:
 * - GFM separator between pipe rows is detected, OR
 * - EVERY non-empty line is a table row (pure table mode)
 */
function shouldUsePipeTable(content: string): boolean {
  const lines = content.split('\n');
  const nonEmptyLines = lines.filter((l) => l.trim() !== '');

  if (nonEmptyLines.length === 0) return false;

  // Check for GFM pattern: header rows with separator
  for (let i = 0; i < nonEmptyLines.length - 1; i++) {
    if (isGfmSeparator(nonEmptyLines[i]) && i > 0 && isTableRow(nonEmptyLines[i - 1])) {
      return true;
    }
    if (isTableRow(nonEmptyLines[i]) && isGfmSeparator(nonEmptyLines[i + 1])) {
      return true;
    }
  }

  // Pure table mode: every non-empty line is a table row
  return nonEmptyLines.every((line) => isTableRow(line) || isGfmSeparator(line));
}

/**
 * Renders markdown content with proper table support.
 *
 * - GFM tables (with separator lines) and pure pipe tables → PipeTable
 * - All other content → ReactMarkdown with GFM support
 *
 * This prevents false positives where inline `|` in regular text
 * is mistaken for table content.
 */
export const MarkdownWithTable: React.FC<MarkdownWithTableProps> = ({
  children,
  className,
}) => {
  if (!children) return null;

  if (shouldUsePipeTable(children)) {
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
