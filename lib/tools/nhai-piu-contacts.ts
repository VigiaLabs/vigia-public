import contacts from '@/data/v2/nhai-piu-contacts.json';
import type { IndiaGeo } from './geo-resolve';
import type { UnifiedResult } from './search-unified';

function canonicalRoad(text: string): string | null {
  const match = text.match(/\bNH[-\s]?(\d+[A-Z]?)\b/i);
  return match ? `NH-${match[1].toUpperCase()}` : null;
}

export function searchNhaiPiuContacts(query: string, geo?: IndiaGeo): UnifiedResult[] {
  const roadNumber = canonicalRoad(query);
  const district = geo?.district?.toLowerCase();
  return contacts.records
    .filter((record) => {
      const roadMatches = roadNumber ? record.roadNumbers.includes(roadNumber) : true;
      const districtMatches = district ? record.district.toLowerCase() === district : true;
      return roadMatches && districtMatches && Boolean(roadNumber || district);
    })
    .map((record) => ({
      chunkText: [
        `Official NHAI project contact for ${record.roadNumbers.join(', ')} in ${record.district} district.`,
        `Authority: ${record.authority}.`,
        `Name: ${record.name}.`,
        `Designation: ${record.designation}.`,
        `Phone: ${record.phone}.`,
        `Email: ${record.email}.`,
        `Document date: ${record.documentDate}.`,
      ].join(' '),
      similarity: 1,
      sourceType: 'nhai_piu_contact',
      state: record.state,
      district: record.district,
      roadNumber: record.roadNumbers[0],
      concessionaire: null,
      sourcePdfHash: record.sourcePdfSha256,
      metadata: {
        authority: record.authority,
        name: record.name,
        designation: record.designation,
        phone: record.phone,
        email: record.email,
        document_date: record.documentDate,
        source_url: record.sourceUrl,
        document_title: record.documentTitle,
        source_locator: record.sourceLocator,
        page_number: record.pageNumber,
        excerpt: record.sourceExcerpt,
      },
    }));
}
