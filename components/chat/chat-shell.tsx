'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { getLandingGreeting, LANDING_SUGGESTIONS } from '@/lib/chat/greeting';
import type { UIMessage } from 'ai';
import {
  createThread,
  saveMessage,
  getMessagesByThread,
  updateMessageMetadata,
} from '@/lib/db';
import { ChatMessage } from '@/components/chat/chat-message';
import { PipelineTrace } from '@/components/chat/pipeline-trace';
import { SourcesPanel } from '@/components/chat/sources-panel';
import { MessageActionBar } from '@/components/chat/message-action-bar';
import { PendingActionCard } from '@/components/chat/pending-action-card';
import { LivePipeline } from '@/components/chat/live-pipeline';
import { SourcesStrip } from '@/components/chat/sources-strip';
import { useEvidence } from '@/components/chat/evidence-context';

/** Generate follow-up questions based on the assistant's response */
function getFollowUps(msg: UIMessage): string[] {
  const text = msg.parts?.filter((p): p is { type: 'text'; text: string } => p.type === 'text').map(p => p.text).join(' ') ?? '';
  const road = text.match(/\b(NH[-\s]?\d+[A-Z]?|SH[-\s]?\d+)\b/i)?.[1];
  const contractor = text.match(/([A-Z][a-zA-Z\s]+(?:Ltd|Limited|JV|LLP))/)?.[1]?.trim();

  const suggestions: string[] = [];
  if (road) {
    suggestions.push(`What is the total budget sanctioned for ${road}?`);
    suggestions.push(`How do I file a complaint about ${road}?`);
  }
  if (contractor) {
    suggestions.push(`What other projects has ${contractor} been awarded?`);
  }
  if (suggestions.length < 3) {
    suggestions.push('Who is the RTI authority for this road?');
  }
  return suggestions.slice(0, 3);
}

import { InputBar } from '@/components/chat/input-bar';
import {
  VoiceSessionBar,
  type VoiceSessionPhase,
} from '@/components/chat/voice-session-bar';
import { useVoiceChat } from '@/hooks/use-voice-chat';
import { getMessageText } from '@/lib/voice/get-message-text';
import { speakText, stopSpeaking } from '@/lib/voice/speak-text';
import { stripMarkdown } from '@/lib/voice/strip-markdown';
import { resolveVoiceLocale } from '@/lib/voice/locale';
import type { VoiceLocale } from '@/types/voice';

type Props = { threadId?: string };

function toUIMessages(
  records: Array<{ id: string; role: string; content: string; metadata?: Record<string, unknown> }>
): UIMessage[] {
  return records.map((m) => ({
    id: m.id,
    role: m.role as UIMessage['role'],
    parts: [{ type: 'text', text: m.content }],
    ...(m.metadata ? { metadata: m.metadata } : {}),
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

  // Stable ID for useChat — changes only on explicit new thread
  const [chatId, setChatId] = useState(() => initialThreadId ?? crypto.randomUUID());

  // Pre-load messages for existing threads
  const [messagesLoaded, setMessagesLoaded] = useState(!initialThreadId);

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoadingSpeech, setIsLoadingSpeech] = useState(false);
  const [isVoiceTurn, setIsVoiceTurn] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [sendLocation, setSendLocation] = useState(true);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const activeMessageRef = useRef<HTMLDivElement | null>(null);
  const voiceTurnRef = useRef(false);
  const pendingVoiceTtsLocaleRef = useRef<VoiceLocale | null>(null);
  const loadedThreadRef = useRef<string | null>(null);
  const selfCreatedThreadRef = useRef<string | null>(null);

  const isTTSActive = isSpeaking || isLoadingSpeech;

  const ensureThread = useCallback(
    async (title: string) => {
      let threadId = currentThreadId;
      if (threadId) return threadId;

      threadId = crypto.randomUUID();
      const trimmedTitle = title.length > 40 ? `${title.slice(0, 40)}…` : title;
      await createThread(threadId, trimmedTitle);
      setCurrentThreadId(threadId);
      selfCreatedThreadRef.current = threadId;
      notifyThreadsUpdated();
      // Use router.replace so Next.js tracks the URL for future navigations
      router.replace(`/t/${threadId}`, { scroll: false });
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

  const cancelPendingVoiceReply = useCallback(() => {
    voiceTurnRef.current = false;
    pendingVoiceTtsLocaleRef.current = null;
    setIsVoiceTurn(false);
  }, []);

  const interruptSpeaking = useCallback(() => {
    stopTTS();
    cancelPendingVoiceReply();
  }, [stopTTS, cancelPendingVoiceReply]);

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
    turnLocaleRef,
    clearVoiceError,
    clearVoiceLocale,
    status,
    setMessages,
    pipelineSteps,
  } = useVoiceChat({
    id: chatId,
    speakResponses: false,
    onVoiceError: (err) => setError(err.message),
    onBeforeSend: async ({ text, locale }) => {
      pendingVoiceTtsLocaleRef.current = locale;
      const threadId = await ensureThread(text);
      await saveMessage(threadId, 'user', text);
    },
    onFinish: async (message) => {
      const shouldSpeak = voiceTurnRef.current;
      const preferredLocale =
        pendingVoiceTtsLocaleRef.current ??
        turnLocaleRef.current ??
        voiceLocale ??
        undefined;

      const threadId = currentThreadId;
      if (threadId && message.role === 'assistant') {
        const text = getMessageText(message);
        const metadata = (message as any).metadata as Record<string, unknown> | undefined;
        if (text) await saveMessage(threadId, 'assistant', text, metadata);
        notifyThreadsUpdated();
      }

      if (!shouldSpeak || message.role !== 'assistant') {
        pendingVoiceTtsLocaleRef.current = null;
        return;
      }

      voiceTurnRef.current = false;
      pendingVoiceTtsLocaleRef.current = null;

      let cleanText = stripMarkdown(getMessageText(message));
      if (!cleanText) {
        for (let i = messages.length - 1; i >= 0; i -= 1) {
          if (messages[i].role !== 'assistant') continue;
          cleanText = stripMarkdown(getMessageText(messages[i]));
          if (cleanText) break;
        }
      }

      if (!cleanText) {
        setIsVoiceTurn(false);
        return;
      }

      const ttsLocale = resolveVoiceLocale({
        text: cleanText,
        preferredLocale,
      });

      try {
        await playTTS(cleanText, message.id, ttsLocale);
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        const msg = err instanceof Error ? err.message : 'Speech playback failed';
        setError(msg);
      } finally {
        setIsVoiceTurn(false);
      }
    },
  });

  // Message loading is handled in the initialThreadId effect above

  const isSending = status === 'streaming' || status === 'submitted';
  const isBusy = isSending || isProcessingVoice || isVoiceRecording;

  const lastAssistantHasText = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role !== 'assistant') continue;
      return messages[i].parts?.some(
        (p): p is { type: 'text'; text: string } => p.type === 'text' && !!p.text
      ) ?? false;
    }
    return false;
  }, [messages]);

  const showGeneratingCard = isSending && messages.length > 0 && !lastAssistantHasText;

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
    // Skip if this is a self-initiated router.replace after creating a thread
    if (initialThreadId && initialThreadId === selfCreatedThreadRef.current) {
      selfCreatedThreadRef.current = null;
      return;
    }
    selfCreatedThreadRef.current = null;

    setCurrentThreadId(initialThreadId ?? null);
    if (!initialThreadId) {
      setChatId(crypto.randomUUID());
      setMessages([]);
      setMessagesLoaded(true);
    } else {
      setChatId(initialThreadId);
      // Load messages for the thread
      setMessagesLoaded(false);
      getMessagesByThread(initialThreadId).then((msgs) => {
        if (msgs.length) setMessages(toUIMessages(msgs));
        else setMessages([]);
        setMessagesLoaded(true);
      });
    }
  }, [initialThreadId, setMessages]);

  useEffect(() => {
    if (!messages.length) return;
    if (!isVoiceTurn && !isTTSActive && !isSending) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      return;
    }
    scrollToActiveMessage();
  }, [messages, isSending, isTTSActive, isVoiceTurn, isProcessingVoice, scrollToActiveMessage]);

  function handleInputChange(next: string) {
    // Only cancel a pending spoken reply once audio is already playing.
    // Typing during "Generating response" must not clear voiceTurnRef — that
    // was preventing TTS after longer Malayalam turns.
    if (isTTSActive) interruptSpeaking();
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
    pendingVoiceTtsLocaleRef.current = null;
    setIsVoiceTurn(true);
    try {
      await handleVoiceCapture(blob);
    } catch {
      cancelPendingVoiceReply();
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setError(msg);
    }
  }

  const displayError = error ?? voiceError;
  const landingGreeting = useMemo(() => getLandingGreeting(), []);

  const evidenceCtx = useEvidence();

  const handleOpenSources = useCallback((evidenceData: any, highlightSourceId?: string) => {
    if ('setPayload' in evidenceCtx) {
      evidenceCtx.setPayload(evidenceData);
      evidenceCtx.setStatus('ready');
      evidenceCtx.setHighlightedSourceId(highlightSourceId ?? null);
    }
    setSourcesOpen(true);
  }, [evidenceCtx]);

  if (!messagesLoaded) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-transparent">
        <div className="shell-think-dots" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <p className="text-[13px] text-text-muted">Loading conversation</p>
      </div>
    );
  }

  return (
    <div className="relative flex h-screen flex-col bg-transparent overflow-hidden">
      <div className="flex-1 overflow-y-auto pb-[calc(env(safe-area-inset-bottom,0px)+11.5rem)] pt-3 md:pb-48 md:pt-8">
        {messages.length > 0 && (
          <div className="mx-auto w-full min-w-0 max-w-[900px] px-4 md:px-6">
            <div className="space-y-8">
                {messages.map((msg) => {
                  const isAssistant = msg.role === 'assistant';
                  const isLastAssistant = isAssistant && msg.id === lastAssistantId;
                  const isStreamingThis = isLastAssistant && status === 'streaming';
                  const isActive =
                    isAssistant &&
                    msg.id === (speakingMessageId ?? lastAssistantId) &&
                    (isTTSActive || isSending || isVoiceTurn);
                  const isSpeakingThis =
                    isTTSActive && msg.id === (speakingMessageId ?? lastAssistantId);

                  // Extract vigia-evidence from message metadata
                  const evidence = isAssistant && (msg as any).metadata?.type === 'vigia-evidence'
                    ? (msg as any).metadata
                    : null;

                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
                      className={isAssistant ? 'ml-0 md:ml-10' : undefined}
                    >
                      {isAssistant && evidence?.debugTrace?.length > 0 && (
                        <div className="mb-1">
                          <PipelineTrace
                            steps={evidence.debugTrace}
                            totalLatencyMs={evidence.totalLatencyMs}
                          />
                        </div>
                      )}
                      <ChatMessage
                        message={msg}
                        isStreaming={isStreamingThis}
                        isSpeaking={isSpeakingThis}
                        messageRef={isActive ? activeMessageRef : undefined}
                        sources={evidence?.sources}
                        onOpenSource={
                          evidence
                            ? (sourceId) => handleOpenSources(evidence, sourceId)
                            : undefined
                        }
                      />
                      {isAssistant && evidence && (
                        <div className="shell-answer-footer mt-5 space-y-4">
                          {evidence.sources?.length > 0 && (
                            <SourcesStrip
                              sources={evidence.sources}
                              onOpenAll={() => handleOpenSources(evidence)}
                              onOpenSource={(sourceId) => handleOpenSources(evidence, sourceId)}
                            />
                          )}
                          <MessageActionBar
                            text={getMessageText(msg)}
                            onRegenerate={undefined}
                          />
                          {evidence.pendingAction && (
                            <PendingActionCard action={evidence.pendingAction} />
                          )}
                          {getFollowUps(msg).length > 0 && (
                            <div className="border-t border-border/40 pt-4">
                              <p className="mb-2.5 text-[13px] font-medium text-text-secondary">
                                Related
                              </p>
                              <div className="flex flex-wrap gap-2">
                                {getFollowUps(msg).map((q, i) => (
                                  <motion.button
                                    key={i}
                                    type="button"
                                    onClick={() => setValue(q)}
                                    initial={{ opacity: 0, y: 4 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.3, delay: 0.08 + i * 0.04, ease: [0.25, 0.1, 0.25, 1] }}
                                    className="rounded-full border border-border/80 bg-white px-3.5 py-1.5 text-left text-[13px] text-text-secondary transition-colors hover:border-border hover:bg-[#fafafa] hover:text-text-primary"
                                  >
                                    {q}
                                  </motion.button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </motion.div>
                  );
                })}
                <AnimatePresence>
                  {showGeneratingCard && (
                    <motion.div
                      key="generating"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
                      className="ml-0 md:ml-10"
                    >
                      <LivePipeline steps={pipelineSteps} />
                    </motion.div>
                  )}
                </AnimatePresence>
                <div ref={bottomRef} className="h-2" />
            </div>
          </div>
        )}
      </div>

      <SourcesPanel open={sourcesOpen} onClose={() => setSourcesOpen(false)} />

      {displayError && (
        <div className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+10.5rem)] left-0 right-0 z-20 md:bottom-36 md:left-[var(--sidebar-width,0px)] md:transition-[left] md:duration-300">
          <div className="mx-auto w-full max-w-3xl px-4 md:px-6">
            <div className="shell-card px-4 py-2.5 text-sm text-red-700">{displayError}</div>
          </div>
        </div>
      )}

      <motion.div
        className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+4.25rem)] left-0 right-0 z-20 transition-[left] duration-300 md:bottom-0 md:left-[var(--sidebar-width,0px)]"
        initial={false}
        animate={{ y: messages.length === 0 ? '-28vh' : 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        <motion.div
          className="pointer-events-none absolute inset-0"
          animate={messages.length === 0 ? { height: 0 } : { height: 140 }}
          transition={{ duration: 0.5 }}
          style={{
            background:
              messages.length === 0
                ? 'transparent'
                : 'linear-gradient(to bottom, transparent, rgb(255, 255, 255) 70%)',
          }}
        />
        <div className="relative w-full px-4 pb-6 pt-3 md:px-6 md:pb-8">
          <div className="mx-auto w-full max-w-[900px]">
            {messages.length === 0 && (
              <motion.div
                className="mb-8 text-center"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
              >
                <h1 className="text-[22px] font-medium tracking-[-0.02em] text-text-primary md:text-[26px]">
                  {landingGreeting.headline}
                </h1>
                <p className="mt-2 text-sm text-text-muted md:text-[15px]">
                  {landingGreeting.subline}
                </p>
              </motion.div>
            )}

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

            {messages.length === 0 && (
              <motion.div
                className="mt-5 flex flex-wrap justify-center gap-2"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.12 }}
              >
                {LANDING_SUGGESTIONS.map((action, i) => (
                  <motion.button
                    key={action}
                    type="button"
                    className="inline-flex items-center rounded-full border border-border bg-white px-4 py-2 text-[13px] font-medium text-text-secondary shadow-[0_1px_2px_rgba(0,0,0,0.04)] transition-all hover:border-[#c4c4c8] hover:bg-[#fafafa] hover:text-text-primary"
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.28, delay: 0.2 + i * 0.06 }}
                    onClick={() => {
                      if (isTTSActive || isVoiceTurn) interruptSpeaking();
                      setValue(action);
                    }}
                  >
                    {action}
                  </motion.button>
                ))}
              </motion.div>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
