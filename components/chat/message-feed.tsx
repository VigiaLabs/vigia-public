import type { ChatMessage } from '@/types';

type MessageFeedProps = {
  messages: ChatMessage[];
};

function getSyncStatusLabel(status?: string): string {
  if (status === 'pending') return 'Sending...';
  if (status === 'failed') return 'Failed to send';
  return '';
}

function getSyncStatusColor(status?: string): string {
  if (status === 'pending') return 'text-amber-700';
  if (status === 'failed') return 'text-red-600';
  return 'text-text-muted';
}

export function MessageFeed({ messages }: MessageFeedProps) {
  return (
    <div className="mx-auto w-full max-w-[900px] px-4 py-8 md:px-6 lg:px-8">
      <div className="space-y-10">
        {messages.map((message, idx) => (
          <div
            key={message.id}
            style={{ animation: `message-appear 0.3s ease-out ${idx * 50}ms forwards` }}
            className="opacity-0"
          >
            {message.role === 'user' ? (
              <div className="flex justify-end">
                <div className="flex flex-col items-end gap-2 max-w-[85%] md:max-w-[70%]">
                  <div className="shell-bubble-user break-words">
                    <p>{message.content}</p>
                  </div>
                  {message.syncStatus && (
                    <div className={`text-xs ${getSyncStatusColor(message.syncStatus)}`}>
                      {getSyncStatusLabel(message.syncStatus)}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="shell-answer-card">
                  <div className="flex items-center justify-between gap-3 pb-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="shell-answer-tag">Answer</span>
                      <span className="shell-answer-meta">VIGIA analysis</span>
                    </div>
                  </div>
                  {message.content.split('\n\n').map((paragraph, idx) => {
                    const trimmed = paragraph.trim();
                    if (!trimmed) return null;

                    if (trimmed.startsWith('##')) {
                      return (
                        <div key={idx} className="mt-8 first:mt-0">
                          <h3 className="mb-3 text-lg font-semibold text-text-primary">
                            {trimmed.replace(/^##\s*/, '')}
                          </h3>
                        </div>
                      );
                    }

                    if (/^\d+\./.test(trimmed)) {
                      const items = trimmed.split('\n').filter((line) => /^\d+\./.test(line));
                      return (
                        <ol className="list-decimal list-inside space-y-2 leading-relaxed text-text-secondary" key={idx}>
                          {items.map((item, i) => (
                            <li key={i} className="text-[15px]">
                              {item.replace(/^\d+\.\s*/, '')}
                            </li>
                          ))}
                        </ol>
                      );
                    }

                    if (/^[-•]/.test(trimmed)) {
                      const items = trimmed.split('\n').filter((line) => /^[-•]/.test(line));
                      return (
                        <ul className="list-disc list-inside space-y-2 leading-relaxed text-text-secondary" key={idx}>
                          {items.map((item, i) => (
                            <li key={i} className="text-[15px]">
                              {item.replace(/^[-•]\s*/, '')}
                            </li>
                          ))}
                        </ul>
                      );
                    }

                    return (
                      <p key={idx} className="shell-answer-body whitespace-pre-wrap break-words">
                        {trimmed}
                      </p>
                    );
                  })}
                </div>

                <div className="border-t border-border pt-4 text-xs text-text-muted">
                  Intelligence output from VIGIA
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}