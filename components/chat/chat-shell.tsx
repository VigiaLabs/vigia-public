'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ChatMessage } from '@/types';
import {
  addAssistantMessage,
  createThread,
  getThread,
  getThreadMessages,
  queueUserMessage,
} from '@/lib/db/offline-store';
import { runStartupMaintenance, syncAndCleanup } from '@/lib/db/sync';
import { useOnlineStatus } from '@/lib/db/use-online-status';
import { InputBar } from './input-bar';
import { MessageFeed } from './message-feed';

type Props = {
  selectedThreadId?: string | null;
};

const SEED_MESSAGES: ChatMessage[] = [
  {
    id: 'seed-1',
    role: 'assistant',
    content: 'Ask about roads, budgets, tenders, or infrastructure.',
  },
];

export function ChatShell({ selectedThreadId }: Props) {
  const router = useRouter();
  const isOnline = useOnlineStatus();

  const [messages, setMessages] = useState<ChatMessage[]>(SEED_MESSAGES);
  const [threadTitle, setThreadTitle] = useState<string | null>(null);

  const [value, setValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);

  const effectiveThreadId = useMemo(
    () => selectedThreadId ?? null,
    [selectedThreadId]
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  useEffect(() => {
    void runStartupMaintenance();
  }, []);

  // Load selected thread (full conversation)
  useEffect(() => {
    let cancelled = false;

    async function loadThread() {
      if (!effectiveThreadId) {
        setThreadTitle(null);
        setMessages(SEED_MESSAGES);
        setError(null);
        return;
      }

      const [thread, msgs] = await Promise.all([
        getThread(effectiveThreadId),
        getThreadMessages(effectiveThreadId),
      ]);

      if (cancelled) return;

      setThreadTitle(thread?.title ?? 'Thread');

      setMessages(
        msgs.map((m) => ({
          id: m.id,
          role: m.role === 'system' ? 'assistant' : m.role,
          content: m.content,
        }))
      );
      setError(null);
    }

    void loadThread();
    return () => {
      cancelled = true;
    };
  }, [effectiveThreadId]);

  // Sync on reconnect; then reload current thread so new assistant msgs appear
  useEffect(() => {
    async function onReconnect() {
      if (!navigator.onLine) return;
      const res = await syncAndCleanup();

      if (res.synced > 0 && effectiveThreadId) {
        const msgs = await getThreadMessages(effectiveThreadId);
        setMessages(
          msgs.map((m) => ({
            id: m.id,
            role: m.role === 'system' ? 'assistant' : m.role,
            content: m.content,
          }))
        );
      }
    }

    if (isOnline) void onReconnect();

    window.addEventListener('online', onReconnect);
    return () => window.removeEventListener('online', onReconnect);
  }, [isOnline, effectiveThreadId]);

  async function handleSubmit(messageText: string) {
    const text = messageText.trim();
    if (!text || isSending) return;

    setError(null);
    setIsSending(true);

    let threadId = effectiveThreadId;

    // Create thread lazily on first message, then navigate to it (professional behavior)
    if (!threadId) {
      threadId = await createThread(text);
      router.push(`/t/${threadId}`);
    }

    // Always queue locally first (offline-first)
    const messageId = await queueUserMessage(threadId, text);

    // Optimistic UI append
    setMessages((prev) => {
      const withoutSeed =
        prev.length === 1 && prev[0]?.id === 'seed-1' ? [] : prev;
      return [...withoutSeed, { id: messageId, role: 'user', content: text }];
    });

    try {
      if (!navigator.onLine) {
        setIsSending(false);
        return;
      }

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: text }),
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

      const assistantId = await addAssistantMessage(threadId, reply);

      setMessages((prev) => [
        ...prev,
        { id: assistantId, role: 'assistant', content: reply },
      ]);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setError(msg);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `I could not complete that request. ${msg}`,
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col">
      {effectiveThreadId ? (
        <div className="border-b border-border bg-surface/30">
          <div className="mx-auto max-w-3xl px-4 py-3 md:px-6">
            <div className="text-xs font-medium uppercase tracking-[0.16em] text-text-muted">
              Thread
            </div>
            <div className="mt-1 text-sm font-medium text-text-primary line-clamp-1">
              {threadTitle ?? 'Thread'}
            </div>
          </div>
        </div>
      ) : null}

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