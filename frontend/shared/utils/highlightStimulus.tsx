import React from 'react';

interface HighlightPart {
  text: string;
  highlight: boolean;
}

function splitByQuotes(text: string, quotes: string[]): HighlightPart[] {
  if (!text || quotes.length === 0) return [{ text, highlight: false }];

  const sortedQuotes = [...quotes].sort((a, b) => b.length - a.length);
  const parts: HighlightPart[] = [{ text, highlight: false }];

  for (const quote of sortedQuotes) {
    const newParts: HighlightPart[] = [];
    for (const part of parts) {
      if (part.highlight) { newParts.push(part); continue; }
      const idx = part.text.indexOf(quote);
      if (idx === -1) { newParts.push(part); continue; }
      if (idx > 0) newParts.push({ text: part.text.slice(0, idx), highlight: false });
      newParts.push({ text: quote, highlight: true });
      if (idx + quote.length < part.text.length) newParts.push({ text: part.text.slice(idx + quote.length), highlight: false });
    }
    parts.splice(0, parts.length, ...newParts);
  }

  return parts;
}

export function HighlightedStimulus({
  text,
  quotes,
  highlightClassName,
}: {
  text: string;
  quotes: string[];
  highlightClassName?: string;
}) {
  const parts = splitByQuotes(text, quotes);
  return (
    <>
      {parts.map((p, i) =>
        p.highlight
          ? <mark key={i} className={highlightClassName} style={highlightClassName ? undefined : { background: 'var(--brand-secondary)', color: 'var(--brand-primary)', borderRadius: 3, padding: '0 2px', fontWeight: 600 }}>{p.text}</mark>
          : <span key={i}>{p.text}</span>
      )}
    </>
  );
}
