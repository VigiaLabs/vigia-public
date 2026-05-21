import type { VoiceLocale } from '@/types/voice';
import { getVoiceProfile } from '@/lib/voice/locale';

export function escapeSsml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function buildSsml(text: string, locale: VoiceLocale): string {
  const { langCode, voiceName } = getVoiceProfile(locale);

  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${langCode}">
  <voice name="${voiceName}">
    ${escapeSsml(text)}
  </voice>
</speak>`;
}
