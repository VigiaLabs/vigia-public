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

/**
 * Sync pending messages and cleanup (only if something was synced).
 */
export async function syncAndCleanup(): Promise<{
  synced: number;
  failed: number;
}> {
  const pending = await getPendingMessages();

  let synced = 0;
  let failed = 0;

  for (const msg of pending) {
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

      // Only add assistant message if one doesn't already exist for this user message
      // Check if there's already an assistant message after this user message
      const laterAssistant = await db.messages
        .where('threadId')
        .equals(msg.threadId)
        .filter((m: any) => m.role === 'assistant' && m.createdAt > msg.createdAt)
        .first();
      
      // If no later assistant message exists, add one
      if (!laterAssistant) {
        await addAssistantMessage(msg.threadId, reply, msg.id);
      }
      
      await markMessageSynced(msg.id);
      synced += 1;
    } catch {
      await markMessageFailed(msg.id);
      failed += 1;
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