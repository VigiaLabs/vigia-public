import Dexie, { type Table } from 'dexie';

export interface Thread {
  id: string;
  title: string;
  updatedAt: number;
}

export interface Message {
  id: string;
  threadId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
  metadata?: Record<string, unknown>;
}

export interface PendingSubmission {
  id: string;
  threadId: string;
  createdAt: number;
  text: string;
  imageUrl?: string;
  gps?: { lat: number; lng: number };
  status: 'pending' | 'syncing' | 'failed';
  retryCount: number;
  lastError?: string;
}

/**
 * A cloud search that could not complete because the device was offline (or the
 * connection dropped mid-flight). It is replayed against /api/chat when
 * connectivity returns, and its `placeholderMessageId` bubble is rewritten with
 * the real answer.
 */
export interface PendingQuery {
  id: string;
  threadId: string;
  createdAt: number;
  text: string;
  imageUrl?: string;
  gps?: { lat: number; lng: number };
  /** Persisted user message that this query corresponds to. */
  userMessageId: string;
  /** Assistant placeholder bubble to replace once the replay succeeds. */
  placeholderMessageId: string;
  status: 'pending' | 'retrying' | 'failed';
  retryCount: number;
  lastError?: string;
}

class VigiaDB extends Dexie {
  threads!: Table<Thread>;
  messages!: Table<Message>;
  outbox!: Table<PendingSubmission>;
  pendingQueries!: Table<PendingQuery>;

  constructor() {
    super('VigiaDB');
    this.version(1).stores({
      threads: 'id, updatedAt',
      messages: 'id, threadId, createdAt',
    });
    // v2: adds metadata column (no index change needed, Dexie handles it)
    this.version(2).stores({
      threads: 'id, updatedAt',
      messages: 'id, threadId, createdAt',
    });
    this.version(3).stores({
      threads: 'id, updatedAt',
      messages: 'id, threadId, createdAt',
      outbox: 'id, threadId, createdAt, status',
    });
    // v4: queue for offline / interrupted cloud searches replayed on reconnect
    this.version(4).stores({
      threads: 'id, updatedAt',
      messages: 'id, threadId, createdAt',
      outbox: 'id, threadId, createdAt, status',
      pendingQueries: 'id, threadId, createdAt, status',
    });
  }
}

export const db = new VigiaDB();

/** Open Dexie and apply schema migrations (including pendingQueries v4). */
export async function ensureDbReady(): Promise<void> {
  await db.open();
}

if (typeof window !== 'undefined') {
  void ensureDbReady().catch((error) => {
    console.error('[vigia] IndexedDB init failed:', error);
  });
}

export async function createThread(id: string, title: string): Promise<void> {
  await db.threads.put({ id, title, updatedAt: Date.now() });
}

export async function saveMessage(
  threadId: string,
  role: 'user' | 'assistant',
  content: string,
  metadata?: Record<string, unknown>
): Promise<string> {
  const id = crypto.randomUUID();
  await db.messages.put({ id, threadId, role, content, createdAt: Date.now(), metadata });
  await db.threads.update(threadId, { updatedAt: Date.now() });
  return id;
}

export async function updateMessageMetadata(
  messageId: string,
  metadata: Record<string, unknown>
): Promise<void> {
  await db.messages.update(messageId, { metadata });
}

export async function updateMessageContent(
  messageId: string,
  content: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await db.messages.update(messageId, {
    content,
    ...(metadata !== undefined ? { metadata } : {}),
  });
}

export async function getThreads(limit = 30): Promise<Thread[]> {
  return db.threads.orderBy('updatedAt').reverse().limit(limit).toArray();
}

export async function getMessagesByThread(threadId: string): Promise<Message[]> {
  return db.messages.where('threadId').equals(threadId).sortBy('createdAt');
}

export async function deleteThread(threadId: string): Promise<void> {
  await db.messages.where('threadId').equals(threadId).delete();
  await db.threads.delete(threadId);
}

export async function getStorageStats(): Promise<{
  threadCount: number;
  messageCount: number;
}> {
  const [threadCount, messageCount] = await Promise.all([
    db.threads.count(),
    db.messages.count(),
  ]);
  return { threadCount, messageCount };
}

export async function clearAllChatData(): Promise<void> {
  await db.messages.clear();
  await db.threads.clear();
}

export async function pruneOldThreads(retentionDays: number): Promise<number> {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  const oldThreads = await db.threads.where('updatedAt').below(cutoff).toArray();

  for (const thread of oldThreads) {
    await deleteThread(thread.id);
  }

  return oldThreads.length;
}

export async function queueSubmission(
  submission: Omit<PendingSubmission, 'id' | 'createdAt' | 'status' | 'retryCount'>
): Promise<string> {
  const id = crypto.randomUUID();
  await db.outbox.put({
    ...submission,
    id,
    createdAt: Date.now(),
    status: 'pending',
    retryCount: 0,
  });
  return id;
}

export async function getPendingSubmissionCount(): Promise<number> {
  return db.outbox.where('status').anyOf('pending', 'failed').count();
}

export async function syncPendingSubmissions(): Promise<{ synced: number; failed: number }> {
  const submissions = await db.outbox.where('status').anyOf('pending', 'failed').sortBy('createdAt');
  let synced = 0;
  let failed = 0;

  for (const submission of submissions) {
    await db.outbox.update(submission.id, { status: 'syncing' });
    try {
      const response = await fetch('/api/evidence', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: submission.text,
          imageUrl: submission.imageUrl,
          gps: submission.gps,
          threadId: submission.threadId,
          messageId: submission.id,
        }),
      });
      const payload = await response.json() as Record<string, unknown>;
      if (!response.ok) {
        throw new Error(typeof payload.error === 'string' ? payload.error : `HTTP ${response.status}`);
      }
      const answer = typeof payload.auditFinding === 'string' && payload.auditFinding.trim()
        ? payload.auditFinding
        : 'The queued report was analysed. Open its evidence details for the source-linked result.';
      await saveMessage(submission.threadId, 'assistant', answer, {
        type: 'vigia-evidence',
        ...payload,
      });
      await db.outbox.delete(submission.id);
      synced += 1;
    } catch (error) {
      await db.outbox.update(submission.id, {
        status: 'failed',
        retryCount: submission.retryCount + 1,
        lastError: error instanceof Error ? error.message : 'Sync failed',
      });
      failed += 1;
    }
  }

  if (synced > 0) window.dispatchEvent(new Event('vigia:threads-updated'));
  return { synced, failed };
}

// ─── Pending cloud queries (offline / interrupted) ──────────────────────────

export async function queuePendingQuery(
  query: Omit<PendingQuery, 'id' | 'createdAt' | 'status' | 'retryCount'>
): Promise<string> {
  await ensureDbReady();
  const id = crypto.randomUUID();
  await db.pendingQueries.put({
    ...query,
    id,
    createdAt: Date.now(),
    status: 'pending',
    retryCount: 0,
  });
  return id;
}

export async function getPendingQueries(): Promise<PendingQuery[]> {
  await ensureDbReady();
  return db.pendingQueries.where('status').anyOf('pending', 'failed', 'retrying').sortBy('createdAt');
}

export async function getPendingQueryCount(): Promise<number> {
  return db.pendingQueries.where('status').anyOf('pending', 'failed', 'retrying').count();
}

export async function resetRetryingPendingQueries(): Promise<void> {
  const retrying = await db.pendingQueries.where('status').equals('retrying').toArray();
  await Promise.all(retrying.map((q) => db.pendingQueries.update(q.id, { status: 'pending' })));
}

export async function resetFailedPendingQueries(): Promise<void> {
  await ensureDbReady();
  const failed = await db.pendingQueries.where('status').equals('failed').toArray();
  await Promise.all(failed.map((q) => db.pendingQueries.update(q.id, { status: 'pending' })));
}

const LEGACY_OFFLINE_SNIPPET = 'Cloud road-document search is unavailable offline';

export function isStuckOfflineAssistantMessage(
  message: Pick<Message, 'role' | 'content' | 'metadata'>
): boolean {
  if (message.role !== 'assistant') return false;
  if (message.content.includes(LEGACY_OFFLINE_SNIPPET)) return true;
  if (message.metadata?.type === 'vigia-pending-retry') return true;
  if (
    message.metadata?.type === 'vigia-evidence' &&
    Array.isArray(message.metadata.claims) &&
    message.metadata.claims.some(
      (claim) =>
        typeof claim === 'object' &&
        claim != null &&
        (claim as { predicate?: string; status?: string }).predicate === 'cloud-search' &&
        (claim as { status?: string }).status === 'unavailable'
    )
  ) {
    return true;
  }
  return false;
}

/**
 * Older builds saved a static "unavailable offline" assistant bubble without
 * enqueueing a pending query. Recover those so reconnect replay still works.
 */
export async function recoverStuckOfflineQueries(): Promise<number> {
  await ensureDbReady();
  const existing = await db.pendingQueries.toArray();
  const queuedPlaceholders = new Set(existing.map((q) => q.placeholderMessageId));
  const queuedUsers = new Set(existing.map((q) => q.userMessageId));

  const threads = await db.threads.toArray();
  let recovered = 0;

  for (const thread of threads) {
    const threadMessages = await getMessagesByThread(thread.id);
    for (let i = 0; i < threadMessages.length; i += 1) {
      const assistant = threadMessages[i];
      if (!isStuckOfflineAssistantMessage(assistant)) continue;
      if (queuedPlaceholders.has(assistant.id)) continue;

      const user = i > 0 ? threadMessages[i - 1] : undefined;
      if (!user || user.role !== 'user') continue;
      if (queuedUsers.has(user.id)) continue;

      await queuePendingQuery({
        threadId: thread.id,
        userMessageId: user.id,
        text: user.content,
        placeholderMessageId: assistant.id,
      });
      queuedPlaceholders.add(assistant.id);
      queuedUsers.add(user.id);
      recovered += 1;
    }
  }
  return recovered;
}

export async function markPendingQueryRetrying(id: string): Promise<void> {
  await db.pendingQueries.update(id, { status: 'retrying' });
}

export async function completePendingQuery(id: string): Promise<void> {
  await db.pendingQueries.delete(id);
}

export async function failPendingQuery(id: string, error: string): Promise<void> {
  const existing = await db.pendingQueries.get(id);
  await db.pendingQueries.update(id, {
    status: 'failed',
    retryCount: (existing?.retryCount ?? 0) + 1,
    lastError: error,
  });
}
