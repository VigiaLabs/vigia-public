import {
  addAssistantMessage,
  cleanupOfflineData,
  db,
  getPendingMessages,
  markMessageFailed,
  markMessageSynced,
  runLegacyMigrationIfNeeded,
} from './offline-store';

/**
 * Run at app start. Includes legacy migration + conservative cleanup.
 */
export async function runStartupMaintenance(): Promise<void> {
  try {
    await runLegacyMigrationIfNeeded();
  } catch {
    // ignore migration errors (non-critical)
  }

  try {
    await cleanupOfflineData();
  } catch {
    // ignore cleanup errors (non-critical)
  }
}

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

/**
 * Sync pending messages with retry + exponential backoff, then cleanup.
 */
export async function syncAndCleanup(): Promise<{
  synced: number;
  failed: number;
}> {
  const pending = await getPendingMessages();

  let synced = 0;
  let failed = 0;

  for (const msg of pending) {
    let attempt = 0;
    let success = false;

    while (attempt < MAX_RETRIES && !success) {
      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: msg.content }),
        });

        const data: unknown = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(
            typeof data === 'object' &&
              data !== null &&
              'error' in data &&
              typeof (data as { error?: unknown }).error === 'string'
              ? (data as { error: string }).error
              : 'Sync failed'
          );
        }

        const reply =
          typeof data === 'object' &&
          data !== null &&
          'reply' in data &&
          typeof (data as { reply?: unknown }).reply === 'string'
            ? (data as { reply: string }).reply
            : 'No reply returned.';

        // Deduplicate: only add assistant message if none exists for this request
        const existing = await db.messages
          .where('requestId')
          .equals(msg.id)
          .first();

        if (!existing) {
          await addAssistantMessage(msg.threadId, reply, msg.id);
        }

        await markMessageSynced(msg.id);
        synced += 1;
        success = true;
      } catch {
        attempt += 1;
        if (attempt >= MAX_RETRIES) {
          await markMessageFailed(msg.id);
          failed += 1;
        } else {
          await new Promise((r) => setTimeout(r, BASE_DELAY_MS * 2 ** (attempt - 1)));
        }
      }
    }
  }

  if (synced > 0) {
    try {
      await cleanupOfflineData();
    } catch {
      // ignore
    }
  }

  return { synced, failed };
}