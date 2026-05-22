'use client';

import { useState } from 'react';
import { useActions, useUIState } from '@ai-sdk/rsc';
import type { AI } from '@/app/ai/provider';
import { ArrowUp } from 'lucide-react';

export function AuditChatShell() {
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { submitAuditRequest } = useActions() as {
    submitAuditRequest: (payload: unknown) => Promise<React.ReactNode>;
  };
  const [messages, setMessages] = useUIState<typeof AI>();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isLoading) return;

    setInput('');
    setIsLoading(true);

    // Append user message to UI
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: 'user',
        display: (
          <div className="flex justify-end">
            <div className="shell-bubble-user max-w-[70%]">
              {text}
            </div>
          </div>
        ),
      },
    ]);

    try {
      // Golden path demo payload
      const response = await submitAuditRequest({
        text,
        imageUrl: 'https://example.com/severe-damage.jpg',
        gps: { lat: 19.076, lng: 72.877 },
        threadId: 'demo-thread',
        messageId: crypto.randomUUID(),
      });

      // Append streamed response
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          display: response,
        },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Request failed';
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          display: (
            <div className="shell-card px-4 py-3 text-sm text-red-700">
              {msg}
            </div>
          ),
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Messages */}
      <div className="flex-1 space-y-6 overflow-y-auto px-4 py-6">
        {messages.length === 0 && (
          <div className="py-12 text-center text-sm text-text-muted">
            Ask about roads, budgets, tenders, or infrastructure.
          </div>
        )}
        {messages.map((msg) => (
          <div key={msg.id}>{msg.display}</div>
        ))}
      </div>

      {/* Input */}
      <form
        onSubmit={handleSubmit}
        className="sticky bottom-0 border-t border-border bg-white px-4 py-4"
      >
        <div className="shell-input-shell flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Audit a road, budget, or contract..."
            disabled={isLoading}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-text-muted disabled:opacity-50"
            aria-label="Audit query"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="flex h-8 w-8 items-center justify-center rounded-full text-text-secondary transition-colors disabled:text-[#d4d4d8] enabled:hover:bg-[#f4f4f5] enabled:text-text-primary"
            aria-label="Submit"
          >
            {isLoading ? (
              <div className="h-3 w-3 animate-spin rounded-full border-2 border-[#b8b0a0] border-t-text-primary" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
