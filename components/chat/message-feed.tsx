import type { ChatMessage } from '@/types';

type MessageFeedProps = {
  messages: ChatMessage[];
};

export function MessageFeed({ messages }: MessageFeedProps) {
  return (
    <div className="mx-auto max-w-3xl px-4 py-8 md:px-6">
      <div className="space-y-6">
        {messages.map((message) => (
          <div
            key={message.id}
            className={
              message.role === 'user' ? 'flex justify-end' : 'flex justify-start'
            }
          >
            <div
              className={
                message.role === 'user'
                  ? 'max-w-[80%] rounded-2xl bg-gray-100 px-5 py-3 text-sm font-sans text-gray-800'
                  : 'max-w-[85%] space-y-3 rounded-2xl border border-border bg-surface px-5 py-4 font-serif text-base leading-relaxed text-text-primary shadow-sm'
              }
            >
              <p>{message.content}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}