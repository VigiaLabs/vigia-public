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

class VigiaDB extends Dexie {
  threads!: Table<Thread>;
  messages!: Table<Message>;

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
