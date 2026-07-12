'use client';

import { useCallback, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useChat } from '@ai-sdk/react';
import type { UIMessage } from 'ai';
import { getMessageText } from '@/lib/voice/get-message-text';
import {
  resolveTurnLanguage,
} from '@/lib/voice/locale';
import { speakText, stopSpeaking } from '@/lib/voice/speak-text';
import { stripMarkdown } from '@/lib/voice/strip-markdown';
import { transcribeVoiceBlob } from '@/lib/voice/transcribe-voice-blob';
import type { ResponseStyle } from '@/lib/settings/types';
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
  /** Used when auto-detect is off or text detection is inconclusive. */
  defaultLocale?: VoiceLocale | null;
  autoDetectLanguage?: boolean;
  responseStyle?: ResponseStyle;
  onVoiceError?: (error: Error) => void;
  /** Called with transcribed text and detected locale before the message is sent to chat. */
  onBeforeSend?: (turn: VoiceTurnContext) => void | Promise<void>;
  onFinish?: (message: UIMessage) => void | Promise<void>;
};

function buildChatRequestBody(
  locale: VoiceLocale | null,
  responseStyle?: ResponseStyle
) {
  return {
    responseLanguage: locale,
    voiceLocale: locale,
    responseStyle,
  };
}

/**
 * useChat + voice pipeline: transcribe blob → sendMessage → optional TTS on reply.
 */
export function useVoiceChat({
  id,
  api = '/api/chat',
  initialMessages,
  speakResponses = true,
  defaultLocale = null,
  autoDetectLanguage = true,
  responseStyle,
  onVoiceError,
  onBeforeSend,
  onFinish,
}: UseVoiceChatOptions = {}) {
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceLocale, setVoiceLocale] = useState<VoiceLocale | null>(null);
  const [pipelineSteps, setPipelineSteps] = useState<string[]>([]);
  const voiceTurnActiveRef = useRef(false);
  const turnLocaleRef = useRef<VoiceLocale | null>(null);

  const chat = useChat({
    id,
    messages: initialMessages,
    onError: (error) => {
      onVoiceError?.(error);
    },
    onData: (part) => {
      if (part.type !== 'data-vigia-step') return;
      const items = part.data as Array<{ vigia_step?: string }>;
      const step = items?.[0]?.vigia_step;
      if (!step) return;
      setPipelineSteps((prev) => (prev.includes(step) ? prev : [...prev, step]));
    },
    onFinish: async ({ message, isError, isAbort }) => {
      setPipelineSteps([]);
      await onFinish?.(message);

      if (isError || isAbort || message.role !== 'assistant') {
        voiceTurnActiveRef.current = false;
        turnLocaleRef.current = null;
        return;
      }

      if (!speakResponses || !voiceTurnActiveRef.current) {
        voiceTurnActiveRef.current = false;
        turnLocaleRef.current = null;
        return;
      }

      voiceTurnActiveRef.current = false;
      const speakLocale = turnLocaleRef.current;
      turnLocaleRef.current = null;

      const cleanText = stripMarkdown(getMessageText(message));
      if (!cleanText) return;

      setIsSpeaking(true);
      try {
        await speakText(cleanText, { locale: speakLocale ?? undefined });
      } catch (error) {
        const err = error instanceof Error ? error : new Error('Speech playback failed');
        setVoiceError(err.message);
        onVoiceError?.(err);
      } finally {
        setIsSpeaking(false);
      }
    },
  });

  const sendMessage = useCallback(
    async (
      message: { text: string },
      options?: { locale?: VoiceLocale | null }
    ) => {
      const text = message.text.trim();
      if (!text) return;

      const detected =
        autoDetectLanguage || options?.locale
          ? resolveTurnLanguage(text, options?.locale)?.code ?? null
          : null;
      const locale = detected ?? defaultLocale ?? null;

      turnLocaleRef.current = locale;
      flushSync(() => {
        setVoiceLocale(locale);
        setPipelineSteps([]);
      });

      await chat.sendMessage(message, {
        body: buildChatRequestBody(locale, responseStyle),
      });
    },
    [autoDetectLanguage, chat.sendMessage, defaultLocale, responseStyle]
  );

  const append = useCallback(
    async (message: VoiceChatMessage) => {
      if (message.role !== 'user') {
        throw new Error('Only user messages can be appended via sendMessage');
      }
      await sendMessage({ text: message.content });
    },
    [sendMessage]
  );

  const handleVoiceCapture = useCallback(
    async (blob: Blob) => {
      setVoiceError(null);
      setIsProcessingVoice(true);

      try {
        const { text, locale: sttLocale } = await transcribeVoiceBlob(blob);
        const locale = resolveTurnLanguage(text, sttLocale)?.code ?? sttLocale;

        flushSync(() => setVoiceLocale(locale));
        turnLocaleRef.current = locale;

        await onBeforeSend?.({ text, locale });

        voiceTurnActiveRef.current = true;
        setPipelineSteps([]);
        await chat.sendMessage({ text }, { body: buildChatRequestBody(locale, responseStyle) });
      } catch (error) {
        voiceTurnActiveRef.current = false;
        turnLocaleRef.current = null;
        const err = error instanceof Error ? error : new Error('Voice processing failed');
        setVoiceError(err.message);
        onVoiceError?.(err);
        throw err;
      } finally {
        setIsProcessingVoice(false);
      }
    },
    [chat.sendMessage, onBeforeSend, onVoiceError, responseStyle]
  );

  const clearVoiceError = useCallback(() => setVoiceError(null), []);

  const clearVoiceLocale = useCallback(() => {
    setVoiceLocale(null);
    turnLocaleRef.current = null;
  }, []);

  return {
    ...chat,
    sendMessage,
    append,
    handleVoiceCapture,
    isProcessingVoice,
    isSpeaking,
    voiceError,
    voiceLocale,
    turnLocaleRef,
    clearVoiceError,
    clearVoiceLocale,
    stopSpeaking,
    getMessageText,
    stripMarkdown,
    pipelineSteps,
  };
}
