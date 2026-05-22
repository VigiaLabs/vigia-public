/** BCP-47 locale code (e.g. hi-IN, en-IN). Not limited to a fixed set. */
export type VoiceLocale = string;

export type VoiceProfile = {
  locale: VoiceLocale;
  langCode: VoiceLocale;
  voiceName: string;
  label: string;
};

export type DetectedLanguage = {
  code: VoiceLocale;
  name: string;
  nativeName: string;
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
