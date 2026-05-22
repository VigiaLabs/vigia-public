import type { TranscriptionResponse } from '@/types/voice';

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      if (typeof dataUrl !== 'string') {
        reject(new Error('Failed to read audio blob'));
        return;
      }
      const base64 = dataUrl.split(',')[1] ?? '';
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read audio blob'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Upload recorded audio to the transcription API.
 */
export async function transcribeVoiceBlob(blob: Blob): Promise<TranscriptionResponse> {
  const audio = await blobToBase64(blob);

  const response = await fetch('/api/voice/transcribe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      audio,
      mimeType: blob.type || 'audio/webm',
    }),
  });

  const data = (await response.json()) as TranscriptionResponse & { error?: string };

  if (!response.ok) {
    throw new Error(data.error ?? response.statusText);
  }

  if (!data.text?.trim()) {
    throw new Error('No speech detected. Please try again.');
  }

  return {
    text: data.text.trim(),
    locale: data.locale ?? 'en-IN',
    confidence: data.confidence,
  };
}
