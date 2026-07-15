/**
 * Thin client for the VIGIASearch Fargate engine.
 *
 * The engine uses named SSE events (`event: step`, `event: text`, etc.).
 * This adapter normalizes them into the event union consumed by the web route.
 */

export type EngineEvent =
  | { type: 'step';       step: string }
  | { type: 'text-delta'; delta: string }
  | { type: 'metadata';   payload: Record<string, unknown> }
  | { type: 'done' }
  | { type: 'error';      message: string };

export interface EngineRequest {
  query: string;
  threadId?: string;
  messageId?: string;
  history?: Array<{ role: string; content: string }>;
  gps?: { lat: number; lng: number };
  imageUrl?: string;
  responseLanguage?: string;
  responseStyle?: string;
}

/**
 * Streams events from the Fargate VIGIASearch engine.
 * Throws if VIGIA_ENGINE_URL is not set — caller falls back to in-process pipeline.
 */
export async function* streamFromEngine(
  req: EngineRequest,
  signal?: AbortSignal,
): AsyncGenerator<EngineEvent> {
  const engineUrl = process.env.VIGIA_ENGINE_URL;
  if (!engineUrl) throw new Error('VIGIA_ENGINE_URL not set');

  const response = await fetch(`${engineUrl}/v1/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({
      query:             req.query,
      thread_id:         req.threadId,
      message_id:        req.messageId,
      history:           req.history ?? [],
      gps:               req.gps,
      image_url:         req.imageUrl,
      response_language: req.responseLanguage,
      response_style:    req.responseStyle,
    }),
    signal,
  });

  if (!response.ok || !response.body) {
    throw new Error(`Engine ${response.status}: ${await response.text()}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let eventName = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('event:')) {
          eventName = trimmed.slice(6).trim();
          continue;
        }
        if (!trimmed.startsWith('data:')) continue;
        const json = trimmed.slice(5).trim();
        if (!json) continue;
        try {
          const data = JSON.parse(json) as Record<string, unknown>;
          if (eventName === 'step' && typeof data.step === 'string') {
            yield { type: 'step', step: data.step };
          } else if (eventName === 'text' && typeof data.delta === 'string') {
            yield { type: 'text-delta', delta: data.delta };
          } else if (eventName === 'metadata') {
            yield { type: 'metadata', payload: data };
          } else if (eventName === 'done') {
            yield { type: 'done' };
          } else if (eventName === 'error') {
            yield { type: 'error', message: typeof data.message === 'string' ? data.message : 'Engine error' };
          } else if (typeof data.type === 'string') {
            yield data as EngineEvent;
          }
          eventName = '';
        } catch {
          eventName = '';
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
