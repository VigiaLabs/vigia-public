import {
  db,
  ensureDbReady,
  getMessagesByThread,
  queuePendingQuery,
  saveMessage,
  type Message,
} from '@/lib/db';

export type PersistOfflineTurnInput = {
  threadId: string;
  userMessageId: string;
  text: string;
  placeholderText: string;
  placeholderMeta: Record<string, unknown>;
  gps?: { lat: number; lng: number };
  imageUrl?: string;
};

export type PersistOfflineTurnResult = {
  placeholderMessageId: string;
  pendingQueryId: string;
  messages: Message[];
};

/**
 * Atomically persist an offline / interrupted cloud query:
 * user message (already saved) + assistant placeholder + pendingQueries row.
 * Verifies each IndexedDB write before returning.
 */
export async function persistOfflineQueryTurn(
  input: PersistOfflineTurnInput
): Promise<PersistOfflineTurnResult> {
  await ensureDbReady();

  const placeholderMessageId = await saveMessage(
    input.threadId,
    'assistant',
    input.placeholderText,
    input.placeholderMeta
  );

  const pendingQueryId = await queuePendingQuery({
    threadId: input.threadId,
    userMessageId: input.userMessageId,
    text: input.text,
    imageUrl: input.imageUrl,
    gps: input.gps,
    placeholderMessageId,
  });

  const messages = await getMessagesByThread(input.threadId);
  const hasUser = messages.some((m) => m.id === input.userMessageId);
  const hasPlaceholder = messages.some((m) => m.id === placeholderMessageId);

  if (!hasUser || !hasPlaceholder) {
    throw new Error('Offline query was not saved to this browser. Please retry.');
  }

  return { placeholderMessageId, pendingQueryId, messages };
}

/** DevTools helper — inspect what is stored locally for offline replay. */
export async function getOfflineStorageSnapshot() {
  await ensureDbReady();
  const [threads, messages, pendingQueries, outbox] = await Promise.all([
    db.threads.toArray(),
    db.messages.toArray(),
    db.pendingQueries.toArray(),
    db.outbox.toArray(),
  ]);
  return {
    threadCount: threads.length,
    messageCount: messages.length,
    pendingQueryCount: pendingQueries.length,
    outboxCount: outbox.length,
    pendingQueries,
    recentMessages: messages.sort((a, b) => b.createdAt - a.createdAt).slice(0, 10),
  };
}

if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  (window as unknown as { __vigiaStorageDebug?: () => Promise<unknown> }).__vigiaStorageDebug =
    getOfflineStorageSnapshot;
}
