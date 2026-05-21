/** BCP-47 locales supported by the voice pipeline (India neural voices). */
export type VoiceLocale = 'en-IN' | 'hi-IN' | 'ta-IN';

export type VoiceProfile = {
  locale: VoiceLocale;
  langCode: VoiceLocale;
  voiceName: string;
  label: string;
};

export type TranscriptionResponse = {
  text: string;
  locale: VoiceLocale;
  confidence?: number;
};

export type SpeakRequest = {
  text: string;
  locale?: VoiceLocale;
};
