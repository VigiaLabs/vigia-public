'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChatMessage } from '@/types';
import { InputBar } from './input-bar';
import { MessageFeed } from './message-feed';

export function ChatShell() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'seed-1',
      role: 'assistant',
      content: 'Ask about roads, budgets, tenders, or infrastructure.',
    },
  ]);
  const [value, setValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  async function handleSubmit(messageText: string) {
    const message = messageText.trim();
    if (!message || isSending) return;

    setError(null);

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: message,
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsSending(true);

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message }),
      });

      const data: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const errorMessage =
          typeof data === 'object' &&
          data !== null &&
          'error' in data &&
          typeof (data as { error?: unknown }).error === 'string'
            ? (data as { error: string }).error
            : 'Request failed';

        throw new Error(errorMessage);
      }

      const reply =
        typeof data === 'object' &&
        data !== null &&
        'reply' in data &&
        typeof (data as { reply?: unknown }).reply === 'string'
          ? (data as { reply: string }).reply
          : 'No reply returned.';

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: reply,
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Something went wrong.';

      setError(message);

      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `I could not complete that request. ${message}`,
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col">
      <div className="flex-1 pb-24">
        <MessageFeed messages={messages} />
        <div ref={bottomRef} />
      </div>

      {error ? (
        <div className="fixed bottom-20 left-0 right-0 z-20 md:left-[260px]">
          <div className="mx-auto max-w-3xl px-4 md:px-6">
            <div className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text-secondary shadow-sm">
              {error}
            </div>
          </div>
        </div>
      ) : null}

      <InputBar
        value={value}
        onChange={setValue}
        onSubmit={async () => {
          const current = value;
          setValue('');
          await handleSubmit(current);
        }}
        isSending={isSending}
      />
    </div>
  );
}