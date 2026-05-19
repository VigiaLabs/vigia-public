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
  const [threadCreatedAt, setThreadCreatedAt] = useState<number | null>(null);
  const [isLoadingThread, setIsLoadingThread] = useState(false);

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
        setThreadCreatedAt(null);
        setMessages(SEED_MESSAGES);
        setError(null);
        setIsLoadingThread(false);
        return;
      }

      setIsLoadingThread(true);

      const [thread, msgs] = await Promise.all([
        getThread(effectiveThreadId),
        getThreadMessages(effectiveThreadId),
      ]);

      if (cancelled) return;

      setThreadTitle(thread?.title ?? 'Search');
      setThreadCreatedAt(thread?.createdAt ?? null);

      // Deduplicate messages by ID (prevent sync duplicates)
      const seen = new Set<string>();
      const uniqueMsgs = msgs
        .filter((m) => {
          if (seen.has(m.id)) return false;
          seen.add(m.id);
          return true;
        })
        .map((m) => ({
          id: m.id,
          role: m.role === 'system' ? 'assistant' : m.role,
          content: m.content,
          syncStatus: m.syncStatus,
        }));

      setMessages(uniqueMsgs);
      setError(null);
      setIsLoadingThread(false);
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
            syncStatus: m.syncStatus,
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
    <div className="relative flex min-h-screen flex-col bg-white">
      {/* Message area with loading state */}
      <div className="flex-1 pb-32 pt-6">
        {isLoadingThread ? (
          <div className="flex items-center justify-center py-12">
            <div className="space-y-4 w-full max-w-2xl px-4">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className={`rounded-xl p-4 ${
                    i % 2 === 0
                      ? 'ml-auto w-2/3 bg-gray-900/5'
                      : 'mr-auto w-2/3 bg-white'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="h-3 w-full rounded bg-gray-200 animate-pulse" />
                    <div className="h-3 w-4/5 rounded bg-gray-200 animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <MessageFeed messages={messages} />
        )}
        <div ref={bottomRef} className="h-2" />
      </div>

      {/* Error message */}
      {error ? (
        <div className="fixed bottom-40 left-0 right-0 z-20 md:left-[260px]">
          <div className="mx-auto w-full max-w-3xl px-4 md:px-8">
            <div className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-700">
              <p>{error}</p>
            </div>
          </div>
        </div>
      ) : null}

      {/* Input bar */}
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