'use client';

import type { UIMessage } from 'ai';
import {
  completePendingQuery,
  ensureDbReady,
  failPendingQuery,
  getMessagesByThread,
  getPendingQueries,
  isStuckOfflineAssistantMessage,
  markPendingQueryRetrying,
  recoverStuckOfflineQueries,
  resetFailedPendingQueries,
  resetRetryingPendingQueries,
  updateMessageContent,
  type PendingQuery,
} from '@/lib/db';

export type PendingQuerySyncResult = {
  synced: number;
  failed: number;
  threadIds: string[];
};

export type PendingQuerySyncState = {
  running: boolean;
  lastError: string | null;
};

let syncState: PendingQuerySyncState = { running: false, lastError: null };

function setSyncState(next: Partial<PendingQuerySyncState>) {
  syncState = { ...syncState, ...next };
  window.dispatchEvent(
    new CustomEvent('vigia:pending-query-sync-state', { detail: syncState })
  );
}

export function getPendingQuerySyncState(): PendingQuerySyncState {
  return syncState;
}

function browserOnline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine;
}

/** Wait until the app server responds — avoids replay racing a flaky reconnect. */
async function waitUntilReachable(maxWaitMs = 20_000): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (!browserOnline()) return false;
    try {
      const res = await fetch('/api/health', {
        method: 'HEAD',
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) return true;
    } catch {
      // keep trying
    }
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  return false;
}

type ReplayResult = {
  text: string;
  metadata?: Record<string, unknown>;
};

function parseSseChunk(raw: string, state: { text: string; metadata?: Record<string, unknown> }) {
  const payload = raw.trim();
  if (!payload || payload === '[DONE]') return;
  try {
    const chunk = JSON.parse(payload) as {
      type?: string;
      delta?: string;
      textDelta?: string;
      messageMetadata?: Record<string, unknown>;
    };
    const delta = chunk.delta ?? chunk.textDelta;
    if (chunk.type === 'text-delta' && delta) state.text += delta;
    if (chunk.type === 'message-metadata' && chunk.messageMetadata) {
      state.metadata = chunk.messageMetadata;
    }
  } catch {
    // ignore malformed chunks
  }
}

async function fetchChatAnswer(
  messages: UIMessage[],
  body: Record<string, unknown>
): Promise<ReplayResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120_000);

  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages, ...body }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(detail || `Chat replay failed (${response.status})`);
    }
    if (!response.body) throw new Error('Chat replay returned no body');

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const state: ReplayResult = { text: '' };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      // SSE events separated by blank lines (\n\n or \r\n\r\n)
      const parts = buffer.split(/\r?\n\r?\n/);
      buffer = parts.pop() ?? '';

      for (const part of parts) {
        for (const line of part.split(/\r?\n/)) {
          if (!line.startsWith('data:')) continue;
          parseSseChunk(line.slice(5), state);
        }
      }
    }

    // Flush trailing buffer
    if (buffer.trim()) {
      for (const line of buffer.split(/\r?\n/)) {
        if (!line.startsWith('data:')) continue;
        parseSseChunk(line.slice(5), state);
      }
    }

    return { text: state.text.trim(), metadata: state.metadata };
  } finally {
    clearTimeout(timeout);
  }
}

async function buildReplayMessages(query: PendingQuery): Promise<UIMessage[]> {
  const records = await getMessagesByThread(query.threadId);
  const messages: UIMessage[] = [];
  for (const record of records) {
    if (record.id === query.placeholderMessageId) continue;
    messages.push({
      id: record.id,
      role: record.role as UIMessage['role'],
      parts: [{ type: 'text', text: record.content }],
    });
    if (record.id === query.userMessageId) break;
  }
  if (!messages.some((m) => m.id === query.userMessageId)) {
    messages.push({
      id: query.userMessageId,
      role: 'user',
      parts: [{ type: 'text', text: query.text }],
    });
  }
  return messages;
}

async function replayOne(query: PendingQuery): Promise<void> {
  const messages = await buildReplayMessages(query);
  const { text, metadata } = await fetchChatAnswer(messages, {
    imageUrl: query.imageUrl,
    gps: query.gps,
  });

  if (!browserOnline()) {
    throw new Error('Connection dropped during queued query replay');
  }
  if (!text) throw new Error('Replay produced an empty answer');

  // Always replace the pending marker. Some successful chat paths return text
  // without metadata; retaining `vigia-pending-retry` would make the completed
  // answer look stuck and allow recovery to enqueue it again.
  const completedMetadata =
    metadata?.type === 'vigia-pending-retry' ? {} : (metadata ?? {});
  await updateMessageContent(query.placeholderMessageId, text, completedMetadata);
}

async function runSync(threadId?: string): Promise<PendingQuerySyncResult> {
  const result: PendingQuerySyncResult = { synced: 0, failed: 0, threadIds: [] };
  if (!browserOnline()) return result;

  setSyncState({ running: true, lastError: null });

  try {
    const reachable = await waitUntilReachable();
    if (!reachable) {
      setSyncState({ running: false, lastError: 'Waiting for network…' });
      return result;
    }

    await ensureDbReady();
    await resetRetryingPendingQueries();
    await resetFailedPendingQueries();
    await recoverStuckOfflineQueries();
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Recovery failed';
    console.error('[vigia] pending-query recovery failed:', error);
    setSyncState({ running: false, lastError: msg });
    return result;
  }

  let queued = await getPendingQueries();
  if (threadId) queued = queued.filter((q) => q.threadId === threadId);

  for (const query of queued) {
    if (!browserOnline()) break;
    await markPendingQueryRetrying(query.id);
    try {
      await replayOne(query);
      await completePendingQuery(query.id);
      result.synced += 1;
      if (!result.threadIds.includes(query.threadId)) {
        result.threadIds.push(query.threadId);
      }
      window.dispatchEvent(
        new CustomEvent('vigia:pending-queries-synced', {
          detail: { threadIds: [query.threadId] },
        })
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Replay failed';
      console.error('[vigia] pending-query replay failed:', error);
      await failPendingQuery(query.id, msg);
      result.failed += 1;
      setSyncState({ lastError: msg });
      if (!browserOnline()) break;
    }
  }

  window.dispatchEvent(new Event('vigia:pending-count-changed'));
  if (result.synced > 0) window.dispatchEvent(new Event('vigia:threads-updated'));
  setSyncState({ running: false });
  return result;
}

let inFlight: Promise<PendingQuerySyncResult> | null = null;

export function syncPendingQueries(threadId?: string): Promise<PendingQuerySyncResult> {
  if (inFlight) {
    // Coalesce reconnect/poll bursts. Chaining every 5-second poll behind a
    // 20-second reachability probe creates an unbounded replay backlog.
    return inFlight;
  }
  inFlight = runSync(threadId).finally(() => {
    inFlight = null;
  });
  return inFlight;
}

export function retryPendingQueriesForThread(threadId: string): Promise<PendingQuerySyncResult> {
  return syncPendingQueries(threadId);
}

export async function threadHasStuckOfflineQueries(threadId: string): Promise<boolean> {
  await ensureDbReady();
  const pending = await getPendingQueries();
  if (pending.some((q) => q.threadId === threadId)) return true;
  const records = await getMessagesByThread(threadId);
  return records.some(isStuckOfflineAssistantMessage);
}

export { isStuckOfflineAssistantMessage };
