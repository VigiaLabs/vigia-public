'use client';

import { useCallback, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useChat } from '@ai-sdk/react';
import type { FileUIPart, UIMessage } from 'ai';
import { getMessageText } from '@/lib/voice/get-message-text';
import {
  resolveTurnLanguage,
} from '@/lib/voice/locale';
import { stopSpeaking } from '@/lib/voice/speak-text';
import { stripMarkdown } from '@/lib/voice/strip-markdown';
import { transcribeVoiceBlob } from '@/lib/voice/transcribe-voice-blob';
import type { ResponseStyle } from '@/lib/settings/types';
import type { VoiceLocale } from '@/types/voice';

export type VoiceChatMessage = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

/**
 * True for transport-level failures (offline / dropped connection). These must
 * never surface as a "Failed to fetch" toast — the caller queues the turn for
 * replay instead.
 */
export function isNetworkError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const msg = error.message.toLowerCase();
  return (
    error.name === 'AbortError' ||
    error.name === 'TimeoutError' ||
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('network request failed') ||
    msg.includes('load failed') ||
    msg.includes('connection was lost') ||
    msg.includes('connection reset') ||
    msg.includes('connection terminated') ||
    msg.includes('socket hang up') ||
    msg.includes('timed out') ||
    msg.includes('timeout') ||
    msg.includes('status code 502') ||
    msg.includes('status code 503') ||
    msg.includes('status code 504') ||
    msg.includes('the internet connection appears to be offline') ||
    (error.name === 'TypeError' && msg.includes('fetch'))
  );
}

export type VoiceTurnContext = {
  text: string;
  locale: VoiceLocale;
};

export type VoiceChatFinishInfo = {
  isError: boolean;
  isAbort: boolean;
};

export type UseVoiceChatOptions = {
  id?: string;
  api?: string;
  initialMessages?: UIMessage[];
  /** Used when auto-detect is off or text detection is inconclusive. */
  defaultLocale?: VoiceLocale | null;
  autoDetectLanguage?: boolean;
  responseStyle?: ResponseStyle;
  onVoiceError?: (error: Error) => void;
  /** Called with transcribed text and detected locale before the message is sent to chat. */
  onBeforeSend?: (turn: VoiceTurnContext) => void | Promise<void>;
  onFinish?: (message: UIMessage, info: VoiceChatFinishInfo) => void | Promise<void>;
};

function buildChatRequestBody(
  locale: VoiceLocale | null,
  responseStyle?: ResponseStyle,
  requestBody?: Record<string, unknown>
) {
  return {
    ...requestBody,
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
  defaultLocale = null,
  autoDetectLanguage = true,
  responseStyle,
  onVoiceError,
  onBeforeSend,
  onFinish,
}: UseVoiceChatOptions = {}) {
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceLocale, setVoiceLocale] = useState<VoiceLocale | null>(null);
  const [pipelineSteps, setPipelineSteps] = useState<string[]>([]);
  const voiceTurnActiveRef = useRef(false);
  const turnLocaleRef = useRef<VoiceLocale | null>(null);
  // AI SDK reports transport failures through onError and then resolves the
  // sendMessage promise. We stash the error here so our wrappers can re-throw it
  // and let callers fall back to the offline queue.
  const lastRequestErrorRef = useRef<Error | null>(null);

  const chat = useChat({
    id,
    messages: initialMessages,
    onError: (error) => {
      lastRequestErrorRef.current = error;
      // Network errors are handled by the offline queue; don't flash a toast.
      if (!isNetworkError(error)) {
        onVoiceError?.(error);
      }
    },
    onData: (part) => {
      if (part.type !== 'data-vigia-step') return;
      const items = part.data as Array<{ vigia_step?: string }>;
      const step = items?.[0]?.vigia_step;
      if (!step) return;
      setPipelineSteps((prev) => (prev.includes(step) ? prev : [...prev, step]));
    },
    onFinish: async ({ message, isError, isAbort }) => {
      await onFinish?.(message, { isError, isAbort });
      voiceTurnActiveRef.current = false;
      turnLocaleRef.current = null;
    },
  });

  const sendMessage = useCallback(
    async (
      message: { text: string; files?: FileUIPart[] },
      options?: { locale?: VoiceLocale | null; requestBody?: Record<string, unknown> }
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

      lastRequestErrorRef.current = null;
      await chat.sendMessage(message, {
        body: buildChatRequestBody(locale, responseStyle, options?.requestBody),
      });

      // AI SDK swallows transport errors (calls onError, resolves anyway).
      // Re-raise so the caller can queue the turn for replay.
      const requestError = lastRequestErrorRef.current;
      lastRequestErrorRef.current = null;
      if (requestError) {
        chat.clearError();
        throw requestError;
      }
    },
    [autoDetectLanguage, chat.sendMessage, chat.clearError, defaultLocale, responseStyle]
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
        lastRequestErrorRef.current = null;
        await chat.sendMessage({ text }, { body: buildChatRequestBody(locale, responseStyle) });

        const requestError = lastRequestErrorRef.current;
        lastRequestErrorRef.current = null;
        if (requestError) {
          chat.clearError();
          throw requestError;
        }
      } catch (error) {
        voiceTurnActiveRef.current = false;
        turnLocaleRef.current = null;
        const err = error instanceof Error ? error : new Error('Voice processing failed');
        // Network failures are queued for replay by the caller — no toast.
        if (!isNetworkError(err)) {
          setVoiceError(err.message);
          onVoiceError?.(err);
        }
        throw err;
      } finally {
        setIsProcessingVoice(false);
      }
    },
    [chat.sendMessage, chat.clearError, onBeforeSend, onVoiceError, responseStyle]
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
