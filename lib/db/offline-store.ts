import Dexie, { type Table } from 'dexie';
import type {
  AppSettings,
  CachedResponse,
  OfflineRequest,
  StagedEvidence,
  ChatThread,
  ThreadMessage,
} from './types';

class VigiaOfflineDB extends Dexie {
  // legacy
  requests!: Table<OfflineRequest>;
  responses!: Table<CachedResponse>;
  evidence!: Table<StagedEvidence>;
  settings!: Table<AppSettings>;

  // new
  threads!: Table<ChatThread>;
  messages!: Table<ThreadMessage>;

  constructor() {
    super('vigia-offline');

    // v1 legacy schema
    this.version(1).stores({
      requests: 'id, timestamp, status',
      responses: 'id, requestId, timestamp',
      evidence: 'id, timestamp, status',
      settings: 'key',
    });

    // v2 adds proper threads/messages
    this.version(2).stores({
      requests: 'id, timestamp, status, threadId',
      responses: 'id, requestId, timestamp',
      evidence: 'id, timestamp, status',
      settings: 'key',
      threads: 'id, updatedAt, createdAt, status',
      messages: 'id, threadId, createdAt, syncStatus, requestId',
    });
  }
}

export const db = new VigiaOfflineDB();

export const DEFAULT_RETENTION_DAYS = 45;

function computeTitleFromFirstUserMessage(text: string) {
  const t = text.trim();
  if (!t) return 'New thread';
  return t.length > 48 ? `${t.slice(0, 48)}…` : t;
}

/**
 * Runs only once: migrates existing legacy requests/responses into thread/message model.
 * Conservative: each legacy request becomes its own single-turn thread.
 */
export async function runLegacyMigrationIfNeeded(): Promise<void> {
  const flag = await db.settings.get('legacyMigrationV1toV2');
  if (flag?.value === 'done') return;

  const legacy = await db.requests.orderBy('timestamp').toArray();
  if (!legacy.length) {
    await db.settings.put({ key: 'legacyMigrationV1toV2', value: 'done' });
    return;
  }

  for (const req of legacy) {
    const threadId = req.id; // stable mapping; avoids extra id generation
    const createdAt = req.timestamp ?? Date.now();

    const thread: ChatThread = {
      id: threadId,
      createdAt,
      updatedAt: createdAt,
      title: computeTitleFromFirstUserMessage(req.query),
      status: 'active',
    };

    await db.threads.put(thread);

    const userMsg: ThreadMessage = {
      id: `m:${req.id}:user`,
      threadId,
      createdAt,
      role: 'user',
      content: req.query,
      syncStatus: req.status === 'pending' ? 'pending' : req.status === 'failed' ? 'failed' : 'synced',
      requestId: req.id,
    };

    await db.messages.put(userMsg);

    const res = await db.responses.where('requestId').equals(req.id).first();
    if (res?.content) {
      const assistantMsg: ThreadMessage = {
        id: `m:${req.id}:assistant`,
        threadId,
        createdAt: res.timestamp ?? createdAt,
        role: 'assistant',
        content: res.content,
        syncStatus: 'synced',
        requestId: req.id,
      };
      await db.messages.put(assistantMsg);

      await db.threads.update(threadId, {
        updatedAt: assistantMsg.createdAt,
      });
    }

    // link legacy request to thread
    await db.requests.update(req.id, { threadId });
  }

  await db.settings.put({ key: 'legacyMigrationV1toV2', value: 'done' });
}

/** THREAD APIs */
export async function createThread(firstUserText?: string): Promise<string> {
  const id = crypto.randomUUID();
  const now = Date.now();

  const thread: ChatThread = {
    id,
    createdAt: now,
    updatedAt: now,
    title: firstUserText ? computeTitleFromFirstUserMessage(firstUserText) : 'New thread',
    status: 'active',
  };

  await db.threads.put(thread);
  return id;
}

export async function touchThread(threadId: string, at = Date.now()): Promise<void> {
  await db.threads.update(threadId, { updatedAt: at });
}

export async function getThreads(limit = 30): Promise<ChatThread[]> {
  return db.threads.orderBy('updatedAt').reverse().limit(limit).toArray();
}

export async function getThread(threadId: string): Promise<ChatThread | undefined> {
  return db.threads.get(threadId);
}

export async function getThreadMessages(threadId: string): Promise<ThreadMessage[]> {
  return db.messages.where('threadId').equals(threadId).sortBy('createdAt');
}

export async function addMessage(message: ThreadMessage): Promise<void> {
  await db.messages.put(message);
  await touchThread(message.threadId, message.createdAt);
}

/** QUEUE + SYNC (new model) */
export async function queueUserMessage(threadId: string, content: string): Promise<string> {
  const id = crypto.randomUUID();
  const msg: ThreadMessage = {
    id,
    threadId,
    createdAt: Date.now(),
    role: 'user',
    content,
    syncStatus: 'pending',
  };
  await addMessage(msg);
  return id;
}

export async function addAssistantMessage(
  threadId: string,
  content: string,
  requestId?: string
): Promise<string> {
  const id = crypto.randomUUID();
  const msg: ThreadMessage = {
    id,
    threadId,
    createdAt: Date.now(),
    role: 'assistant',
    content,
    syncStatus: 'synced',
    requestId,
  };
  await addMessage(msg);
  return id;
}

export async function markMessageSynced(messageId: string): Promise<void> {
  await db.messages.update(messageId, { syncStatus: 'synced' });
}

export async function markMessageFailed(messageId: string): Promise<void> {
  await db.messages.update(messageId, { syncStatus: 'failed' });
}

export async function getPendingMessages(): Promise<ThreadMessage[]> {
  return db.messages.where('syncStatus').equals('pending').toArray();
}

/** LEGACY APIs kept (used by older code paths or migration safety) */
export async function saveQueryOffline(query: string): Promise<string> {
  const id = crypto.randomUUID();
  await db.requests.put({
    id,
    timestamp: Date.now(),
    query,
    status: 'pending',
    retryCount: 0,
  });
  return id;
}

export async function saveCachedResponse(
  requestId: string,
  content: string,
  sources: string = '[]'
): Promise<string> {
  const id = crypto.randomUUID();
  await db.responses.put({
    id,
    requestId,
    timestamp: Date.now(),
    content,
    sources,
  });
  return id;
}

export async function getCachedResponse(requestId: string): Promise<CachedResponse | undefined> {
  return db.responses.where('requestId').equals(requestId).first();
}

export async function getRequestAndResponse(
  requestId: string
): Promise<{ request: OfflineRequest; response?: CachedResponse } | null> {
  const request = await db.requests.get(requestId);
  if (!request) return null;
  const response = await getCachedResponse(requestId);
  return { request, response };
}

/** Sidebar helper: queue stats (prefer new message queue; include legacy for safety) */
export async function getQueueStats(): Promise<{
  pending: number;
  synced: number;
  failed: number;
}> {
  const [pendingMsg, failedMsg] = await Promise.all([
    db.messages.where('syncStatus').equals('pending').count(),
    db.messages.where('syncStatus').equals('failed').count(),
  ]);

  // legacy counts (can be removed later once migration is stable)
  const [pendingReq, syncedReq, failedReq] = await Promise.all([
    db.requests.where('status').equals('pending').count(),
    db.requests.where('status').equals('synced').count(),
    db.requests.where('status').equals('failed').count(),
  ]);

  return {
    pending: pendingMsg + pendingReq,
    failed: failedMsg + failedReq,
    synced: syncedReq, // “synced” is less meaningful for messages; keep legacy total for now
  };
}

/** Conservative cleanup (keeps pending messages + pending legacy requests) */
export async function cleanupOfflineData(options?: {
  retentionDays?: number;
}): Promise<{
  deletedThreads: number;
  deletedMessages: number;
  deletedRequests: number;
  deletedResponses: number;
  deletedEvidence: number;
}> {
  const retentionDays = options?.retentionDays ?? DEFAULT_RETENTION_DAYS;
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  // Delete old messages that are NOT pending
  const oldMsgs = await db.messages
    .where('createdAt')
    .below(cutoff)
    .and((m) => m.syncStatus !== 'pending')
    .toArray();

  let deletedMessages = 0;
  if (oldMsgs.length) {
    await db.messages.bulkDelete(oldMsgs.map((m) => m.id));
    deletedMessages = oldMsgs.length;
  }

  // Delete threads with no remaining messages and old updatedAt
  const threads = await db.threads.where('updatedAt').below(cutoff).toArray();
  let deletedThreads = 0;
  for (const t of threads) {
    const count = await db.messages.where('threadId').equals(t.id).count();
    if (count === 0) {
      await db.threads.delete(t.id);
      deletedThreads += 1;
    }
  }

  // Legacy: delete old terminal requests, keep pending
  const oldTerminalReq = await db.requests
    .where('timestamp')
    .below(cutoff)
    .and((r) => r.status !== 'pending')
    .toArray();

  let deletedRequests = 0;
  if (oldTerminalReq.length) {
    await db.requests.bulkDelete(oldTerminalReq.map((r) => r.id));
    deletedRequests = oldTerminalReq.length;
  }

  const [deletedResponses, deletedEvidence] = await Promise.all([
    db.responses.where('timestamp').below(cutoff).delete(),
    db.evidence.where('timestamp').below(cutoff).delete(),
  ]);

  return {
    deletedThreads,
    deletedMessages,
    deletedRequests,
    deletedResponses,
    deletedEvidence,
  };
}

export async function pruneOldData(olderThanDays: number): Promise<void> {
  await cleanupOfflineData({ retentionDays: olderThanDays });
}