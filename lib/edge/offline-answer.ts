import type { VigiaEvidenceMetadata } from '@/types/evidence';
import { getEdgePackMetadata, queryEmergencyContacts, queryPwdHelpdesks } from './sync';

export async function buildOfflineAnswer(
  text: string,
  gps?: { lat: number; lng: number }
): Promise<{ text: string; metadata: VigiaEvidenceMetadata } | null> {
  const emergencyIntent = /\b(112|1033|emergency|ambulance|accident|police|fire|helpline)\b/i.test(text);
  const authorityIntent = /\b(complaint|authority|executive engineer|pwd|public works|grievance|cpgrams)\b/i.test(text);
  if (!emergencyIntent && !authorityIntent) return null;

  const lat = gps?.lat ?? 0;
  const lng = gps?.lng ?? 0;
  const [contacts, helpdesks, pack] = await Promise.all([
    emergencyIntent ? queryEmergencyContacts(lat, lng, 8) : Promise.resolve([]),
    authorityIntent ? queryPwdHelpdesks(lat, lng, 8) : Promise.resolve([]),
    getEdgePackMetadata(),
  ]);
  const records = [...contacts, ...helpdesks];
  const cacheAgeHours = pack.lastSyncAt ? Math.floor((Date.now() - pack.lastSyncAt) / 3_600_000) : undefined;
  const stale = pack.lastSyncAt === 0 || Date.now() - pack.lastSyncAt > 24 * 60 * 60 * 1000;
  const sources = Array.from(new Map(records.map((record) => [record.sourceUrl, {
    id: record.sourceUrl,
    label: new URL(record.sourceUrl).hostname,
    trustLevel: 'official-portal',
    url: record.sourceUrl,
  }])).values());

  const lines = ['**Cached offline result** — verify availability when connectivity returns.'];
  for (const contact of contacts) lines.push(`- ${contact.name}: **${contact.phone}** (${contact.scope})`);
  for (const helpdesk of helpdesks) {
    const channels = [helpdesk.phone, helpdesk.email].filter(Boolean).join(' · ') || 'Use the linked official portal';
    lines.push(`- ${helpdesk.designation}, ${helpdesk.division}: ${channels}`);
  }
  if (records.length === 0) lines.push('- No matching source-linked record exists in this offline pack.');

  return {
    text: lines.join('\n'),
    metadata: {
      type: 'vigia-evidence',
      sources,
      claims: records.map((record) => ({
        category: 'authority-contact',
        status: 'verified',
        subject: 'name' in record && record.name ? record.name : 'Published authority contact',
        predicate: 'phone' in record && record.phone ? 'contact-phone' : 'contact-channel',
        value: 'phone' in record && record.phone ? record.phone : ('email' in record ? record.email ?? undefined : undefined),
        sourceId: record.sourceUrl,
        sourceQuote: record.sourceQuote,
        sourceLocator: 'offline source registry',
        retrievedAt: record.verifiedAt,
      })),
      offline: {
        mode: 'offline',
        lastSyncAt: pack.lastSyncAt || undefined,
        cacheAgeHours,
        packVersion: pack.version ?? undefined,
        stale,
      },
    },
  };
}
