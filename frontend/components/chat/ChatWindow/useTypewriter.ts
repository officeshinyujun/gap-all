import { useEffect, useRef } from 'react';
import type { Message } from './types';

const CHARS_PER_SEC = 300;

export function useTypewriter(
  messages: Message[],
  enabled: boolean,
  typingProgress: Record<string, number>,
  setTypingProgress: React.Dispatch<React.SetStateAction<Record<string, number>>>,
) {
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const aiMessages = messages.filter((m) => m.sender === 'AI');
    if (aiMessages.length === 0) return;

    const lastAi = aiMessages[aiMessages.length - 1];
    const fullText = lastAi.message;
    const msgId = lastAi.id;

    if ((typingProgress[msgId] ?? 0) >= fullText.length) return;

    const startTime = performance.now();
    const startPos = typingProgress[msgId] ?? 0;

    const animate = (now: number) => {
      const elapsed = (now - startTime) / 1000;
      const revealed = Math.min(
        startPos + Math.floor(elapsed * CHARS_PER_SEC),
        fullText.length,
      );
      setTypingProgress((prev) => ({ ...prev, [msgId]: revealed }));

      if (revealed < fullText.length) {
        animFrameRef.current = requestAnimationFrame(animate);
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [messages, enabled, typingProgress, setTypingProgress]);
}
