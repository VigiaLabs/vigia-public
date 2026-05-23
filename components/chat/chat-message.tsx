'use client';

import type { UIMessage } from 'ai';
import { motion } from 'framer-motion';
import { getMessageText } from '@/lib/voice/get-message-text';
import { cn } from '@/lib/utils';
import { MarkdownBody } from './markdown-body';

type Source = { id: string; label: string; trustLevel: string; url?: string };

type Props = {
  message: UIMessage;
  isActive?: boolean;
  isStreaming?: boolean;
  isSpeaking?: boolean;
  messageRef?: React.Ref<HTMLDivElement>;
  sources?: Source[];
  onOpenSource?: (sourceId: string) => void;
};

export function ChatMessage({
  message,
  isStreaming,
  isSpeaking,
  messageRef,
  sources,
  onOpenSource,
}: Props) {
  const text = getMessageText(message);
  if (!text) return null;

  const isUser = message.role === 'user';

  return (
    <div ref={messageRef} className={cn(isUser ? 'flex justify-end' : 'scroll-mt-32 md:scroll-mt-28')}>
      <motion.div
        layout
        transition={{ layout: { duration: 0.35, ease: [0.25, 0.1, 0.25, 1] } }}
        className={cn(
          isUser
            ? 'shell-bubble-user max-w-[85%] break-words whitespace-pre-wrap md:max-w-[70%]'
            : 'shell-bubble-assistant w-full'
        )}
      >
        {isUser ? (
          text
        ) : (
          <div className="relative">
            {isSpeaking && !isStreaming && (
              <div className="mb-2.5 flex items-center gap-2">
                <span className="shell-speaking-indicator" aria-hidden />
                <span className="text-[12px] font-medium text-text-muted">Reading aloud</span>
              </div>
            )}

            <MarkdownBody
              text={text}
              sources={sources}
              isStreaming={isStreaming}
              onOpenSource={onOpenSource}
            />
          </div>
        )}
      </motion.div>
    </div>
  );
}
