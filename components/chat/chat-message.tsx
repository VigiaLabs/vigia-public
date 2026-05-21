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
    <div
      ref={messageRef}
      className={cn(isUser ? 'flex justify-end' : 'scroll-mt-28')}
    >
      <motion.div
        layout
        className={cn(
          isUser
            ? 'shell-bubble-user max-w-[70%] break-words whitespace-pre-wrap'
            : 'shell-bubble-assistant relative whitespace-pre-wrap rounded-2xl transition-[box-shadow,background-color] duration-300',
          !isUser &&
            isActive &&
            'bg-[#fbf8f2] px-4 py-3 shadow-[0_0_0_1px_rgba(235,228,216,0.9),0_8px_32px_rgba(17,17,17,0.04)]',
          !isUser && isSpeaking && 'ring-1 ring-[#ebe4d8]/80'
        )}
      >
        {!isUser && isSpeaking && (
          <motion.span
            className="absolute -left-0.5 top-4 h-[calc(100%-2rem)] w-0.5 rounded-full bg-gradient-to-b from-[#4285F4] via-[#EA4335] to-[#34A853]"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ repeat: Infinity, duration: 1.6, ease: 'easeInOut' }}
            aria-hidden
          />
        )}
        {text}
      </motion.div>
    </div>
  );
}
