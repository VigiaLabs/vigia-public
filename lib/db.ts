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
  }
}

export const db = new VigiaDB();

export async function createThread(id: string, title: string): Promise<void> {
  await db.threads.put({ id, title, updatedAt: Date.now() });
}

export async function saveMessage(
  threadId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<string> {
  const id = crypto.randomUUID();
  await db.messages.put({ id, threadId, role, content, createdAt: Date.now() });
  await db.threads.update(threadId, { updatedAt: Date.now() });
  return id;
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
