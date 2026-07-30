import { VStack } from '@shared/ui/VStack';
import Typo from '@shared/ui/Typo';
import { API_BASE_URL } from '@shared/lib/auth';
import { TypewriterLoader } from '@shared/ui/TypewriterLoader';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Message } from './types';
import s from './ChatMessageBubble.module.scss';

interface Props {
  msg: Message;
  typewriterEnabled: boolean;
  typingProgress: Record<string, number>;
}

const markdownComponents = {
  a: ({ href, children, ...props }: any) => (
    <a href={href} target="_blank" rel="noopener noreferrer" {...props}>
      {children}
    </a>
  ),
};

export function ChatMessageBubble({ msg, typewriterEnabled, typingProgress }: Props) {
  const isUser = msg.sender === 'USER';

  return (
    <div className={`${s.bubble} ${isUser ? s.userBubble : s.aiBubble}`}>
      {isUser ? (
        msg.message.startsWith('[IMAGE:') ? (
          <img
            src={`${API_BASE_URL}/chat/images/${msg.message.slice(7, -1)}`}
            alt="Uploaded"
            className={s.uploadedImage}
          />
        ) : msg.message.startsWith('[LOCAL_IMAGE:') ? (
          <VStack gap={4} align="end">
            <img
              src={msg.message.slice(13, -1)}
              alt="Uploading"
              className={`${s.uploadedImage} ${s.localImage}`}
            />
            <TypewriterLoader text="이미지 분석 중.." size={12} color="secondary" />
          </VStack>
        ) : (
          <Typo.MD size={14} color="primary" className={s.userText}>
            {msg.message}
          </Typo.MD>
        )
      ) : (
        <AiMarkdown
          fullText={msg.message}
          msgId={msg.id}
          typewriterEnabled={typewriterEnabled}
          typingProgress={typingProgress}
        />
      )}
    </div>
  );
}

function AiMarkdown({
  fullText,
  msgId,
  typewriterEnabled,
  typingProgress,
}: {
  fullText: string;
  msgId: string;
  typewriterEnabled: boolean;
  typingProgress: Record<string, number>;
}) {
  const revealed = typewriterEnabled ? (typingProgress[msgId] ?? fullText.length) : fullText.length;
  const isTyping = typewriterEnabled && revealed < fullText.length;
  const displayText = isTyping ? fullText.slice(0, revealed) : fullText;

  return (
    <div className={s.markdown}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {displayText}
      </ReactMarkdown>
    </div>
  );
}
