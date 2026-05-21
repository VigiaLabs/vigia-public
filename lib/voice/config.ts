/**
 * Voice pipeline environment configuration (supports legacy and current variable names).
 */
export function getDeepgramApiKey(): string | undefined {
  return (
    process.env.DEEPGRAM_API_KEY?.trim() || process.env.DEEPGRAM_KEY?.trim() || undefined
  );
}

export function getAzureTtsConfig(): { apiKey: string; region: string } | null {
  const apiKey = (
    process.env.AZURE_KEY ??
    process.env.AZURE_TTS_KEY
  )?.trim();
  const region = (
    process.env.REGION ??
    process.env.AZURE_TTS_REGION
  )?.trim();

  if (!apiKey || !region) return null;
  return { apiKey, region };
}
