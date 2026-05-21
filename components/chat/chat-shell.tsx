'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import type { UIMessage } from 'ai';
import {
  createThread,
  saveMessage,
  getMessagesByThread,
} from '@/lib/db';
import { ChatMessage } from '@/components/chat/chat-message';
import { InputBar } from '@/components/chat/input-bar';
import {
  VoiceSessionBar,
  type VoiceSessionPhase,
} from '@/components/chat/voice-session-bar';
import { useVoiceChat } from '@/hooks/use-voice-chat';
import { getMessageText } from '@/lib/voice/get-message-text';
import { speakText, stopSpeaking } from '@/lib/voice/speak-text';
import { stripMarkdown } from '@/lib/voice/strip-markdown';
import type { VoiceLocale } from '@/types/voice';

type Props = { threadId?: string };

function toUIMessages(
  records: Array<{ id: string; role: string; content: string }>
): UIMessage[] {
  return records.map((m) => ({
    id: m.id,
    role: m.role as UIMessage['role'],
    parts: [{ type: 'text', text: m.content }],
  }));
}

function notifyThreadsUpdated() {
  window.dispatchEvent(new Event('vigia:threads-updated'));
}

export function ChatShell({ threadId: initialThreadId }: Props) {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(
    initialThreadId ?? null
  );

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoadingSpeech, setIsLoadingSpeech] = useState(false);
  const [isVoiceTurn, setIsVoiceTurn] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [sendLocation, setSendLocation] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const activeMessageRef = useRef<HTMLDivElement | null>(null);
  const voiceTurnRef = useRef(false);
  const loadedThreadRef = useRef<string | null>(null);

  const isTTSActive = isSpeaking || isLoadingSpeech;

  const ensureThread = useCallback(
    async (title: string) => {
      let threadId = currentThreadId;
      if (threadId) return threadId;

      threadId = crypto.randomUUID();
      const trimmedTitle = title.length > 40 ? `${title.slice(0, 40)}…` : title;
      await createThread(threadId, trimmedTitle);
      setCurrentThreadId(threadId);
      notifyThreadsUpdated();
      router.replace(`/t/${threadId}`);
      return threadId;
    },
    [currentThreadId, router]
  );

  const stopTTS = useCallback(() => {
    stopSpeaking();
    setIsSpeaking(false);
    setIsLoadingSpeech(false);
    setSpeakingMessageId(null);
  }, []);

  const interruptSpeaking = useCallback(() => {
    stopTTS();
    voiceTurnRef.current = false;
    setIsVoiceTurn(false);
  }, [stopTTS]);

  const playTTS = useCallback(
    async (text: string, messageId: string, locale?: VoiceLocale) => {
      stopTTS();
      setIsLoadingSpeech(true);
      setIsSpeaking(true);
      setSpeakingMessageId(messageId);

      try {
        await speakText(text, { locale });
      } finally {
        setIsLoadingSpeech(false);
        setIsSpeaking(false);
        setSpeakingMessageId(null);
      }
    },
    [stopTTS]
  );

  const {
    messages,
    sendMessage,
    handleVoiceCapture,
    isProcessingVoice,
    voiceError,
    voiceLocale,
    clearVoiceError,
    clearVoiceLocale,
    status,
    setMessages,
  } = useVoiceChat({
    id: currentThreadId ?? undefined,
    speakResponses: false,
    onVoiceError: (err) => setError(err.message),
    onBeforeSend: async ({ text }) => {
      const threadId = await ensureThread(text);
      await saveMessage(threadId, 'user', text);
    },
    onFinish: async (message) => {
      const threadId = currentThreadId;
      if (threadId && message.role === 'assistant') {
        const text = getMessageText(message);
        if (text) await saveMessage(threadId, 'assistant', text);
        notifyThreadsUpdated();
      }

      if (!voiceTurnRef.current || message.role !== 'assistant') return;
      voiceTurnRef.current = false;

      const cleanText = stripMarkdown(getMessageText(message));
      if (!cleanText) {
        setIsVoiceTurn(false);
        return;
      }

      try {
        await playTTS(cleanText, message.id, voiceLocale ?? undefined);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        const msg = err instanceof Error ? err.message : 'Speech playback failed';
        setError(msg);
      } finally {
        setIsVoiceTurn(false);
      }
    },
  });

  const isSending = status === 'streaming' || status === 'submitted';
  const isBusy = isSending || isProcessingVoice || isVoiceRecording;

  const voiceSessionPhase = useMemo((): VoiceSessionPhase | null => {
    if (!isVoiceTurn && !isTTSActive) return null;
    if (isVoiceRecording) return 'listening';
    if (isProcessingVoice) return 'transcribing';
    if (isTTSActive) return 'speaking';
    if (isSending) return 'thinking';
    return null;
  }, [
    isVoiceTurn,
    isVoiceRecording,
    isProcessingVoice,
    isTTSActive,
    isSending,
  ]);

  const lastAssistantId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return messages[i].id;
    }
    return null;
  }, [messages]);

  const scrollToActiveMessage = useCallback((behavior: ScrollBehavior = 'smooth') => {
    requestAnimationFrame(() => {
      activeMessageRef.current?.scrollIntoView({ behavior, block: 'end' });
      bottomRef.current?.scrollIntoView({ behavior, block: 'end' });
    });
  }, []);

  useEffect(() => {
    return () => stopTTS();
  }, [stopTTS]);

  useEffect(() => {
    setCurrentThreadId(initialThreadId ?? null);
  }, [initialThreadId]);

  useEffect(() => {
    if (!initialThreadId) {
      if (!isVoiceTurn && !isSending && !isTTSActive) {
        setMessages([]);
      }
      loadedThreadRef.current = null;
      return;
    }

    const threadToLoad = initialThreadId;
    if (loadedThreadRef.current === threadToLoad) return;

    // Keep in-flight voice/chat stream when URL updates after ensureThread()
    if (
      threadToLoad === currentThreadId &&
      messages.length > 0 &&
      (isVoiceTurn || isSending || isTTSActive)
    ) {
      loadedThreadRef.current = threadToLoad;
      return;
    }

    loadedThreadRef.current = threadToLoad;

    async function load() {
      const msgs = await getMessagesByThread(threadToLoad);
      if (!msgs.length) return;
      setMessages(toUIMessages(msgs));
    }
    void load();
  }, [
    initialThreadId,
    currentThreadId,
    messages.length,
    setMessages,
    isVoiceTurn,
    isSending,
    isTTSActive,
  ]);

  useEffect(() => {
    if (!messages.length) return;
    if (!isVoiceTurn && !isTTSActive && !isSending) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      return;
    }
    scrollToActiveMessage();
  }, [messages, isSending, isTTSActive, isVoiceTurn, isProcessingVoice, scrollToActiveMessage]);

  function handleInputChange(next: string) {
    if (isTTSActive || isVoiceTurn) interruptSpeaking();
    setValue(next);
  }

  function handleImageFile(file: File) {
    if (!file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => setImageDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  }

  function handlePaste(e: React.ClipboardEvent) {
    for (const item of e.clipboardData.items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) handleImageFile(file);
        break;
      }
    }
  }

  const onVoiceCapture = async (blob: Blob) => {
    clearVoiceError();
    setError(null);
    voiceTurnRef.current = true;
    setIsVoiceTurn(true);
    try {
      await handleVoiceCapture(blob);
    } catch {
      voiceTurnRef.current = false;
      setIsVoiceTurn(false);
    }
  };

  async function handleSubmit() {
    const text = value.trim();
    if (!text || isBusy) return;

    if (isTTSActive || isVoiceTurn) interruptSpeaking();
    clearVoiceLocale();
    setValue('');
    setError(null);
    clearVoiceError();

    const threadId = await ensureThread(text);
    await saveMessage(threadId, 'user', text);

    try {
      await sendMessage({ text });
      setImageDataUrl(null);
      setSendLocation(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setError(msg);
    }
  }

  const displayError = error ?? voiceError;

  return (
    <div className="relative flex min-h-screen flex-col bg-transparent">
      <div className="flex-1 pb-40 pt-5 md:pt-6">
        {messages.length === 0 ? (
          <div className="flex min-h-screen flex-col items-center px-4 pt-36">
            <div className="w-full max-w-2xl space-y-10 text-center">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
              >
                <h1 className="mb-2 text-6xl font-light tracking-tight text-text-primary">
                  VIGIA
                </h1>
                <p className="text-sm text-text-muted">Infrastructure intelligence</p>
              </motion.div>

              <motion.div
                className="flex flex-wrap justify-center gap-3"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.5 }}
              >
                {['Build infrastructure plan', 'Analyze budget', 'Track spatial data'].map(
                  (action, i) => (
                    <motion.button
                      key={action}
                      type="button"
                      className="inline-flex items-center rounded-full border border-border bg-white px-4 py-2 text-xs font-medium text-text-secondary transition-all hover:scale-105 hover:border-text-primary hover:text-text-primary active:animate-button-bounce"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, delay: 0.58 + i * 0.08 }}
                      onClick={() => {
                        if (isTTSActive || isVoiceTurn) interruptSpeaking();
                        setValue(action);
                      }}
                    >
                      {action}
                    </motion.button>
                  )
                )}
              </motion.div>
            </div>
          </div>
        ) : (
          <div className="mx-auto w-full min-w-0 max-w-3xl px-4 md:px-6">
            <div className="space-y-6">
              {messages.map((msg) => {
                const isAssistant = msg.role === 'assistant';
                const isActive =
                  isAssistant &&
                  msg.id === (speakingMessageId ?? lastAssistantId) &&
                  (isTTSActive || isSending || isVoiceTurn);
                const isSpeakingThis =
                  isTTSActive && msg.id === (speakingMessageId ?? lastAssistantId);

                return (
                  <ChatMessage
                    key={msg.id}
                    message={msg}
                    isActive={isActive}
                    isSpeaking={isSpeakingThis}
                    messageRef={isActive ? activeMessageRef : undefined}
                  />
                );
              })}
            </div>
          </div>
        )}
        <div ref={bottomRef} className="h-2" />
      </div>

      {displayError && (
        <div className="fixed bottom-36 left-0 right-0 z-20 md:left-[260px]">
          <div className="mx-auto w-full max-w-3xl px-4 md:px-6">
            <div className="shell-card px-4 py-2.5 text-sm text-red-700">{displayError}</div>
          </div>
        </div>
      )}

      <motion.div
        className="fixed bottom-0 left-0 right-0 z-20 md:left-[260px]"
        initial={false}
        animate={{ y: messages.length === 0 ? '-32vh' : 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        <motion.div
          className="pointer-events-none absolute inset-0"
          animate={messages.length === 0 ? { height: 0 } : { height: 112 }}
          transition={{ duration: 0.5 }}
          style={{
            background:
              messages.length === 0
                ? 'transparent'
                : 'linear-gradient(to bottom, transparent, rgb(250, 248, 243))',
          }}
        />
        <div className="relative w-full px-4 py-4 md:px-6">
          <div className="mx-auto w-full max-w-3xl">
            {voiceSessionPhase && (
              <VoiceSessionBar
                phase={voiceSessionPhase}
                onStopSpeaking={
                  voiceSessionPhase === 'speaking' ? interruptSpeaking : undefined
                }
              />
            )}
            <InputBar
              value={value}
              onChange={handleInputChange}
              onSubmit={() => void handleSubmit()}
              isSending={isSending}
              onVoiceCapture={onVoiceCapture}
              isProcessingVoice={isProcessingVoice}
              isSpeaking={isTTSActive}
              isVoiceRecording={isVoiceRecording}
              onVoiceRecordingChange={setIsVoiceRecording}
              stopTTS={stopTTS}
              hasMessages={messages.length > 0}
              imageDataUrl={imageDataUrl}
              onImageSelect={setImageDataUrl}
              onImageClear={() => setImageDataUrl(null)}
              sendLocation={sendLocation}
              onToggleLocation={() => setSendLocation((v) => !v)}
              onPaste={handlePaste}
            />
          </div>
        </div>
      </motion.div>
    </div>
  );
}
