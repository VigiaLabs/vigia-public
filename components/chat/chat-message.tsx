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
  isSpeaking?: boolean;
  messageRef?: React.Ref<HTMLDivElement>;
  sources?: Source[];
};

export function ChatMessage({ message, isActive, isSpeaking, messageRef, sources }: Props) {
  const text = getMessageText(message);
  if (!text) return null;

  const isUser = message.role === 'user';

  return (
    <div ref={messageRef} className={cn(isUser ? 'flex justify-end' : 'scroll-mt-32 md:scroll-mt-28')}>
      <motion.div
        layout
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
            {isSpeaking && (
              <motion.span
                className="absolute left-0 top-4 h-[calc(100%-2rem)] w-0.5 rounded-full bg-gradient-to-b from-[#1f3a5f] via-[#b8683c] to-[#2f7c66]"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
                aria-hidden
              />
            )}
            {(isActive || isSpeaking) && (
              <div className="flex items-center justify-end gap-3 pb-3">
                {isActive && <span className="shell-answer-live">Live</span>}
              </div>
            )}
            <MarkdownBody text={text} sources={sources} />
          </div>
        )}
      </motion.div>
    </div>
  );
}
