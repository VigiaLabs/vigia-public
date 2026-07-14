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

class VigiaDB extends Dexie {
  threads!: Table<Thread>;
  messages!: Table<Message>;
  outbox!: Table<PendingSubmission>;

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
  }
}

export const db = new VigiaDB();

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
