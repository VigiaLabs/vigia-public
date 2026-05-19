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
  if (status === 'pending') return 'text-amber-600';
  if (status === 'failed') return 'text-red-600';
  return 'text-gray-400';
}

export function MessageFeed({ messages }: MessageFeedProps) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 md:px-6 lg:px-8">
      <div className="space-y-12">
        {messages.map((message, idx) => (
          <div key={message.id} style={{ animation: `message-appear 0.3s ease-out ${idx * 50}ms forwards` }} className="opacity-0">
            {message.role === 'user' ? (
              // User message: compact, visually secondary, right-aligned
              <div className="flex justify-end">
                <div className="flex flex-col items-end gap-2 max-w-[70%]">
                  <div className="rounded-md bg-gray-900 px-4 py-2.5 text-sm text-white break-words">
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
              // Assistant message: structured intelligence output
              <div className="space-y-6">
                {/* Main content block - editorial, no bubble styling */}
                <div className="prose-body max-w-2xl">
                  {/* Parse content into logical sections */}
                  {message.content.split('\n\n').map((paragraph, idx) => {
                    const trimmed = paragraph.trim();
                    if (!trimmed) return null;

                    // Detect section headers (lines starting with ##)
                    if (trimmed.startsWith('##')) {
                      return (
                        <div key={idx} className="mt-8 first:mt-0">
                          <h3 className="text-lg font-semibold text-gray-900 mb-3">
                            {trimmed.replace(/^##\s*/, '')}
                          </h3>
                        </div>
                      );
                    }

                    // Detect numbered lists
                    if (/^\d+\./.test(trimmed)) {
                      const items = trimmed.split('\n').filter(line => /^\d+\./.test(line));
                      return (
                        <ol key={idx} className="list-decimal list-inside space-y-2 text-gray-700 leading-relaxed">
                          {items.map((item, i) => (
                            <li key={i} className="text-base">
                              {item.replace(/^\d+\.\s*/, '')}
                            </li>
                          ))}
                        </ol>
                      );
                    }

                    // Detect bullet lists
                    if (/^[-•]/.test(trimmed)) {
                      const items = trimmed.split('\n').filter(line => /^[-•]/.test(line));
                      return (
                        <ul key={idx} className="list-disc list-inside space-y-2 text-gray-700 leading-relaxed">
                          {items.map((item, i) => (
                            <li key={i} className="text-base">
                              {item.replace(/^[-•]\s*/, '')}
                            </li>
                          ))}
                        </ul>
                      );
                    }

                    // Regular paragraph
                    return (
                      <p key={idx} className="text-gray-900 leading-relaxed text-base whitespace-pre-wrap break-words">
                        {trimmed}
                      </p>
                    );
                  })}
                </div>

                {/* Subtle metadata footer if needed - only show for completeness */}
                <div className="text-xs text-gray-500 pt-4 border-t border-gray-100">
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