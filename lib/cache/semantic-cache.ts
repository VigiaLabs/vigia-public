/**
 * Semantic cache using Upstash Redis.
 * Falls back to no-op if UPSTASH_REDIS_REST_URL is not configured or @upstash/redis is not installed.
 */

interface CachedResponse {
  text: string;
  metadata: Record<string, unknown> | null;
  cachedAt: number;
}

let redis: any = null;
let redisChecked = false;
const CACHE_SCHEMA_VERSION = 'v12-official-tot-provenance';

async function getRedis() {
  if (redisChecked) return redis;
  redisChecked = true;

  if (!process.env.UPSTASH_REDIS_REST_URL) return null;

  try {
    // Dynamic require to avoid compile-time dependency
    const modPath = '@upstash/redis';
    const mod = await (Function('p', 'return import(p)')(modPath));
    redis = new mod.Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
    return redis;
  } catch {
    return null;
  }
}

function queryToKey(query: string): string {
  const normalized = query.toLowerCase().trim().replace(/[^\w\s]/g, '').replace(/\s+/g, ' ');
  return `vigia:cache:${CACHE_SCHEMA_VERSION}:${normalized}`;
}

export async function getCachedResponse(query: string): Promise<CachedResponse | null> {
  const r = await getRedis();
  if (!r) return null;

  try {
    const key = queryToKey(query);
    const cached = await r.get(key) as CachedResponse | null;
    if (cached && Date.now() - cached.cachedAt < 86_400_000) return cached;
    return null;
  } catch {
    return null;
  }
}

export async function setCachedResponse(
  query: string,
  response: CachedResponse
): Promise<void> {
  const r = await getRedis();
  if (!r) return;

  try {
    const key = queryToKey(query);
    await r.set(key, response, { ex: 86400 });
  } catch {
    // Cache write failure is non-critical
  }
}
