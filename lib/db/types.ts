export interface OfflineRequest {
  id: string;
  timestamp: number;
  query: string;
  status: 'pending' | 'synced' | 'failed';
  retryCount: number;
  aiState?: string;

  // legacy bridge (optional)
  threadId?: string;
}

export interface CachedResponse {
  id: string;
  requestId: string;
  timestamp: number;
  content: string;
  sources: string;
}

export interface StagedEvidence {
  id: string;
  timestamp: number;
  filename: string;
  mimeType: string;
  blob: Blob;
  metadata: string;
  status: 'staged' | 'uploaded' | 'failed';
}

export interface AppSettings {
  key: string;
  value: string;
}

/** New: conversation threads */
export interface ChatThread {
  id: string;
  createdAt: number;
  updatedAt: number;
  title: string;
  status: 'active' | 'archived';
}

/** New: messages belonging to a thread */
export interface ThreadMessage {
  id: string;
  threadId: string;
  createdAt: number;
  role: 'user' | 'assistant' | 'system';
  content: string;

  /**
   * Sync state for offline-first.
   * - pending: user message saved locally, not yet sent
   * - synced: successfully processed/stored
   * - failed: send/processing failed (eligible for retry later)
   */
  syncStatus: 'pending' | 'synced' | 'failed';

  /** Optional link back to the legacy request id */
  requestId?: string;
}