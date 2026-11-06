'use client';

// 실제 챗 화면(frontend/components/chat/ChatWindow)의 다크 토큰과 버블 규격을 그대로 옮긴 목업.
// --background-primary #040406 / --background-secondary #16161D / --brand-primary #5454D4
// --text-primary #ECECEF / --text-secondary #8F8FA3 / --border-primary #23232E

import React from 'react';

export const T = {
  bg: '#040406',
  bg2: '#16161D',
  bg3: '#1E1E28',
  brand: '#5454D4',
  text: '#ECECEF',
  sub: '#8F8FA3',
  border: '#23232E',
};

export type Line = { t: string; off?: boolean };
export type Msg =
  | { who: 'user'; text: string }
  | { who: 'ai'; blocks: (string | { h: string } | { li: Line[] })[] };

export function ChatMock({
  title, sub, messages, footer, compact,
}: {
  title: string;
  sub?: string;
  messages: Msg[];
  footer?: string;
  compact?: boolean;
}) {
  const fs = compact ? 10 : 11.5;
  return (
    <div style={{ ...S.shell, fontSize: fs }}>
      <div style={S.head}>
        <div style={{ ...S.headTitle, fontSize: fs }}>{title}</div>
        {sub && <div style={{ ...S.headSub, fontSize: fs - 2 }}>{sub}</div>}
      </div>

      <div style={S.body}>
        {messages.map((m, i) =>
          m.who === 'user' ? (
            <div key={i} style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
              <div style={{ ...S.bubble, background: T.brand, color: T.text }}>{m.text}</div>
            </div>
          ) : (
            <div key={i} style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 10 }}>
              <div style={{ ...S.bubble, background: T.bg2, color: T.text, maxWidth: '92%' }}>
                {m.blocks.map((b, j) => {
                  if (typeof b === 'string') return <p key={j} style={S.p}>{b}</p>;
                  if ('h' in b) return <div key={j} style={{ ...S.h, fontSize: fs + 0.5 }}>{b.h}</div>;
                  return (
                    <ul key={j} style={S.ul}>
                      {b.li.map((l, k) => (
                        <li key={k} style={{ ...S.li, ...(l.off ? S.off : null) }}>{l.t}</li>
                      ))}
                    </ul>
                  );
                })}
              </div>
            </div>
          ),
        )}
      </div>

      {footer !== undefined && (
        <div style={S.inputRow}>
          <div style={{ ...S.input, fontSize: fs - 1 }}>{footer || '궁금한 점을 입력하세요'}</div>
          <div style={S.send}>↑</div>
        </div>
      )}
    </div>
  );
}

const S: Record<string, React.CSSProperties> = {
  shell: {
    display: 'flex', flexDirection: 'column', height: '100%', background: T.bg,
    color: T.text, fontFamily: 'Wanted Sans, system-ui, sans-serif',
  },
  head: {
    padding: '10px 12px', borderBottom: `1px solid ${T.border}`, flexShrink: 0,
  },
  headTitle: { fontWeight: 600, color: T.text },
  headSub: { color: T.sub, marginTop: 3 },
  body: { flex: 1, padding: 12, overflow: 'hidden' },
  bubble: {
    maxWidth: '70%', padding: '8px 12px', borderRadius: 14, lineHeight: 1.7,
    wordBreak: 'break-word',
  },
  p: { margin: '0 0 8px 0' },
  h: { fontWeight: 600, margin: '12px 0 6px 0', color: T.text },
  ul: { margin: '4px 0 8px 0', paddingLeft: 16 },
  li: { margin: '0 0 4px 0' },
  off: {
    textDecoration: 'underline',
    textDecorationColor: '#CF6B6B',
    textDecorationStyle: 'wavy',
    textUnderlineOffset: 3,
  },
  inputRow: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
    borderTop: `1px solid ${T.border}`, flexShrink: 0,
  },
  input: {
    flex: 1, background: T.bg3, color: T.sub, borderRadius: 10, padding: '7px 10px',
  },
  send: {
    width: 24, height: 24, borderRadius: '50%', background: T.brand, color: '#fff',
    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, flexShrink: 0,
  },
};
