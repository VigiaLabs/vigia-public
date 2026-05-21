'use client';

import { useCallback, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useChat } from '@ai-sdk/react';
import type { UIMessage } from 'ai';
import { getMessageText } from '@/lib/voice/get-message-text';
import { speakText, stopSpeaking } from '@/lib/voice/speak-text';
import { stripMarkdown } from '@/lib/voice/strip-markdown';
import { transcribeVoiceBlob } from '@/lib/voice/transcribe-voice-blob';
import type { VoiceLocale } from '@/types/voice';

export type VoiceChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export type VoiceTurnContext = {
  text: string;
  locale: VoiceLocale;
};

export type UseVoiceChatOptions = {
  id?: string;
  api?: string;
  initialMessages?: UIMessage[];
  /** When true, assistant replies are spoken after voice-initiated turns. */
  speakResponses?: boolean;
  onVoiceError?: (error: Error) => void;
  /** Called with transcribed text and detected locale before the message is sent to chat. */
  onBeforeSend?: (turn: VoiceTurnContext) => void | Promise<void>;
  onFinish?: (message: UIMessage) => void | Promise<void>;
};

/**
 * useChat + voice pipeline: transcribe blob → sendMessage → optional TTS on reply.
 */
export function useVoiceChat({
  id,
  api = '/api/chat',
  initialMessages,
  speakResponses = true,
  onVoiceError,
  onBeforeSend,
  onFinish,
}: UseVoiceChatOptions = {}) {
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceLocale, setVoiceLocale] = useState<VoiceLocale | null>(null);
  const voiceTurnActiveRef = useRef(false);

  const chat = useChat({
    id,
    messages: initialMessages,
    onError: (error) => {
      onVoiceError?.(error);
    },
    onFinish: async ({ message, isError, isAbort }) => {
      await onFinish?.(message);

      if (isError || isAbort || message.role !== 'assistant') {
        voiceTurnActiveRef.current = false;
        return;
      }

      if (!speakResponses || !voiceTurnActiveRef.current) {
        voiceTurnActiveRef.current = false;
        return;
      }

      voiceTurnActiveRef.current = false;

      const cleanText = stripMarkdown(getMessageText(message));
      if (!cleanText) return;

      setIsSpeaking(true);
      try {
        await speakText(cleanText, { locale: voiceLocale ?? undefined });
      } catch (error) {
        const err = error instanceof Error ? error : new Error('Speech playback failed');
        setVoiceError(err.message);
        onVoiceError?.(err);
      } finally {
        setIsSpeaking(false);
      }
    },
  });

  const append = useCallback(
    async (message: VoiceChatMessage) => {
      if (message.role !== 'user') {
        throw new Error('Only user messages can be appended via sendMessage');
      }
      await chat.sendMessage({ text: message.content });
    },
    [chat.sendMessage]
  );

  const handleVoiceCapture = useCallback(
    async (blob: Blob) => {
      setVoiceError(null);
      setIsProcessingVoice(true);

      try {
        const { text, locale } = await transcribeVoiceBlob(blob);

        flushSync(() => setVoiceLocale(locale));

        await onBeforeSend?.({ text, locale });

        voiceTurnActiveRef.current = true;
        await chat.sendMessage({ text });
      } catch (error) {
        voiceTurnActiveRef.current = false;
        const err = error instanceof Error ? error : new Error('Voice processing failed');
        setVoiceError(err.message);
        onVoiceError?.(err);
        throw err;
      } finally {
        setIsProcessingVoice(false);
      }
    },
    [chat.sendMessage, onBeforeSend, onVoiceError]
  );

  const clearVoiceError = useCallback(() => setVoiceError(null), []);

  const clearVoiceLocale = useCallback(() => setVoiceLocale(null), []);

  return {
    ...chat,
    append,
    handleVoiceCapture,
    isProcessingVoice,
    isSpeaking,
    voiceError,
    voiceLocale,
    clearVoiceError,
    clearVoiceLocale,
    stopSpeaking,
    getMessageText,
    stripMarkdown,
  };
}
