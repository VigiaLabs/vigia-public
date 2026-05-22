'use client';

import type { UIMessage } from 'ai';
import { motion } from 'framer-motion';
import { getMessageText } from '@/lib/voice/get-message-text';
import { cn } from '@/lib/utils';

type Props = {
  message: UIMessage;
  isActive?: boolean;
  isSpeaking?: boolean;
  messageRef?: React.Ref<HTMLDivElement>;
};

export function ChatMessage({ message, isActive, isSpeaking, messageRef }: Props) {
  const text = getMessageText(message);
  if (!text) return null;

  const isUser = message.role === 'user';

  return (
    <div ref={messageRef} className={cn(isUser ? 'flex justify-end' : 'scroll-mt-28')}
    >
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
          <div
            className={cn(
              'shell-answer-card transition-[box-shadow,background-color] duration-300',
              isActive && 'bg-[#fafafa] shadow-[0_0_0_1px_rgba(228,228,231,0.9),0_8px_24px_rgba(0,0,0,0.08)]',
              isSpeaking && 'ring-1 ring-[#e6d9c7]'
            )}
          >
            {!isUser && isSpeaking && (
              <motion.span
                className="absolute left-0 top-4 h-[calc(100%-2rem)] w-0.5 rounded-full bg-gradient-to-b from-[#1f3a5f] via-[#b8683c] to-[#2f7c66]"
                animate={{ opacity: [0.5, 1, 0.5] }}
                transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
                aria-hidden
              />
            )}
            <div className="flex items-center justify-between gap-3 pb-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="shell-answer-tag">Answer</span>
                <span className="shell-answer-meta">VIGIA analysis</span>
              </div>
              {isActive && <span className="shell-answer-live">Live</span>}
            </div>
            <div className="shell-answer-body whitespace-pre-wrap break-words">
              {text}
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
