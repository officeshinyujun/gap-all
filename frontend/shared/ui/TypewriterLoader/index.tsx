import React, { useState, useEffect } from 'react';
import Typo from '@shared/ui/Typo';

interface TypewriterLoaderProps {
  text?: string;
  size?: React.ComponentProps<typeof Typo.MD>['size'];
  color?: React.ComponentProps<typeof Typo.MD>['color'];
  typingSpeed?: number;
  deletingSpeed?: number;
  pauseDelay?: number;
}

export const TypewriterLoader: React.FC<TypewriterLoaderProps> = ({
  text = '로딩중..',
  size = 14,
  color = 'secondary',
  typingSpeed = 150,
  deletingSpeed = 100,
  pauseDelay = 1000,
}) => {
  const [displayText, setDisplayText] = useState(text);
  const [isDeleting, setIsDeleting] = useState(true);
  const [isPaused, setIsPaused] = useState(true); // Start with a pause before deleting

  useEffect(() => {
    if (isPaused) {
      const timeout = setTimeout(() => {
        setIsPaused(false);
      }, pauseDelay);
      return () => clearTimeout(timeout);
    }

    const timeout = setTimeout(() => {
      if (isDeleting) {
        if (displayText.length === 0) {
          setIsDeleting(false);
        } else {
          setDisplayText(displayText.slice(0, -1));
        }
      } else {
        if (displayText.length === text.length) {
          setIsDeleting(true);
          setIsPaused(true); // Pause when fully typed
        } else {
          setDisplayText(text.slice(0, displayText.length + 1));
        }
      }
    }, isDeleting ? deletingSpeed : typingSpeed);

    return () => clearTimeout(timeout);
  }, [displayText, isDeleting, isPaused, text, typingSpeed, deletingSpeed, pauseDelay]);

  // Use a relative wrapper with an invisible copy of the full text to preserve width/height,
  // preventing the chat bubble from jumping around as text length changes.
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      {/* Invisible placeholder for layout */}
      <span style={{ visibility: 'hidden', whiteSpace: 'pre' }}>
        <Typo.MD size={size} color={color}>{text}</Typo.MD>
      </span>
      {/* Absolutely positioned animating text */}
      <span style={{ position: 'absolute', left: 0, top: 0, whiteSpace: 'pre' }}>
        <Typo.MD size={size} color={color}>{displayText}</Typo.MD>
      </span>
    </div>
  );
};
