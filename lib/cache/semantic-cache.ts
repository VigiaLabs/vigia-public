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
// Bumped for the scoped cache key (P-CRIT-1): keys now include response language
// and style, so pre-fix entries (which collided across languages) are abandoned.
const CACHE_SCHEMA_VERSION = 'v19-lang-style-scoped';

async function getRedis() {
  if (redisChecked) return redis;
  redisChecked = true;

  if (!process.env.UPSTASH_REDIS_REST_URL) return null;

  try {
    // Optional dependency (Upstash is prod-only). The `as string` keeps this a
    // runtime-resolved import so tsc doesn't require the types to be installed,
    // while avoiding the previous Function()/eval indirection (P-BUG-1).
    const mod = await import('@upstash/redis' as string);
    redis = new mod.Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
    return redis;
  } catch {
    // @upstash/redis not installed or failed to init — caching degrades to no-op.
    console.warn('[semantic-cache] Redis unavailable — caching disabled');
    return null;
  }
}

/**
 * Cache key scope (P-CRIT-1): a cached answer is only valid for the same query
 * AND the same response language AND the same response style AND the same coarse
 * location. Without language a Hindi speaker could get a cached English answer;
 * without style a "concise" request could return a cached "detailed" one; without
 * location a road-scoped answer could leak across regions.
 *
 * The query normalizer uses Unicode property escapes (\p{L}\p{N}) so non-Latin
 * scripts (Devanagari, Tamil, etc.) survive — the previous ASCII \w stripped all
 * Indic characters, collapsing every non-Latin query to the same blank key.
 */
export function queryToKey(
  query: string,
  language: string,
  style: string,
  geo = '',
): string {
  const normalized = query
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ');
  const lang = (language || 'default').toLowerCase();
  const sty = (style || 'default').toLowerCase();
  const loc = geo || 'noloc';
  return `vigia:cache:${CACHE_SCHEMA_VERSION}:${lang}:${sty}:${loc}:${normalized}`;
}

export async function getCachedResponse(
  query: string,
  language = 'default',
  style = 'default',
  geo = '',
): Promise<CachedResponse | null> {
  const r = await getRedis();
  if (!r) return null;

  try {
    const key = queryToKey(query, language, style, geo);
    const cached = await r.get(key) as CachedResponse | null;
    if (cached && Date.now() - cached.cachedAt < 86_400_000) return cached;
    return null;
  } catch {
    return null;
  }
}

export async function setCachedResponse(
  query: string,
  response: CachedResponse,
  language = 'default',
  style = 'default',
  geo = '',
): Promise<void> {
  const r = await getRedis();
  if (!r) return;

  try {
    const key = queryToKey(query, language, style, geo);
    await r.set(key, response, { ex: 86400 });
  } catch {
    // Cache write failure is non-critical
  }
}
