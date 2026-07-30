import React from 'react';

interface PipeTableProps {
  children: string;
  className?: string;
}

/**
 * Renders pipe-delimited text as an HTML table.
 * Handles markdown that uses pipes without GFM separator lines.
 *
 * Rules:
 * - Lines containing `|` that look like table rows are grouped.
 * - The FIRST row in a group is the header.
 * - Consecutive pipe lines form one table.
 * - Non-pipe lines appear between tables as plain text.
 */
export const PipeTable: React.FC<PipeTableProps> = ({ children, className }) => {
  const lines = children.split('\n');
  const elements: React.ReactNode[] = [];

  let tableRows: string[][] = [];
  let plainLines: string[] = [];

  const flushTable = () => {
    if (tableRows.length < 2) {
      plainLines.push(...tableRows.map((r) => r.join(' | ')));
      tableRows = [];
      return;
    }
    const header = tableRows[0];
    const body = tableRows.slice(1);
    elements.push(
      <table key={`t-${elements.length}`}>
        <thead>
          <tr>
            {header.map((cell, i) => (
              <th key={i}>{cell.trim()}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci}>{cell.trim()}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>,
    );
    tableRows = [];
  };

  const flushPlainText = () => {
    if (plainLines.length > 0) {
      elements.push(
        <p key={`p-${elements.length}`}>{plainLines.join('\n')}</p>,
      );
      plainLines = [];
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const cells = trimmed
      .split('|')
      .map((c) => c.trim())
      .filter((c) => c !== '');

    if (cells.length >= 2) {
      flushPlainText();
      tableRows.push(cells);
    } else {
      flushTable();
      plainLines.push(line);
    }
  }
  flushTable();
  flushPlainText();

  return <div className={className}>{elements}</div>;
};

export default PipeTable;
