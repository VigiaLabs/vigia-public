'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { FileText, MapPin, ShieldCheck, Sparkles } from 'lucide-react';
import type { UIMessage } from 'ai';
import {
  createThread,
  saveMessage,
  getMessagesByThread,
} from '@/lib/db';
import { ChatMessage } from '@/components/chat/chat-message';

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

  // Stable ID for useChat — changes only on explicit new thread
  const [chatId, setChatId] = useState(() => initialThreadId ?? crypto.randomUUID());

  // Pre-load messages for existing threads
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [messagesLoaded, setMessagesLoaded] = useState(!initialThreadId);

  useEffect(() => {
    if (!initialThreadId) { setMessagesLoaded(true); return; }
    getMessagesByThread(initialThreadId).then((msgs) => {
      if (msgs.length) setInitialMessages(toUIMessages(msgs));
      setMessagesLoaded(true);
    });
  }, [initialThreadId]);

  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isLoadingSpeech, setIsLoadingSpeech] = useState(false);
  const [isVoiceTurn, setIsVoiceTurn] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const [isVoiceRecording, setIsVoiceRecording] = useState(false);
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [sendLocation, setSendLocation] = useState(true);
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
      // Update URL without triggering Next.js navigation/remount
      window.history.replaceState(window.history.state, '', `/t/${threadId}`);
      return threadId;
    },
    [currentThreadId]
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
    id: chatId,
    initialMessages,
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
    if (!initialThreadId) {
      setChatId(crypto.randomUUID());
    } else {
      setChatId(initialThreadId);
    }
  }, [initialThreadId]);

  useEffect(() => {
    if (!initialThreadId && !currentThreadId) {
      setMessages([]);
      return;
    }
  }, [initialThreadId, currentThreadId, setMessages]);

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
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setError(msg);
    }
  }

  const displayError = error ?? voiceError;
  const onboardingCards = [
    {
      title: 'Verified sources',
      description: 'Trace every claim back to official evidence and RTI records.',
      icon: ShieldCheck,
    },
    {
      title: 'Spatial signal',
      description: 'Layer corridor plans, map context, and on-ground alerts.',
      icon: MapPin,
    },
    {
      title: 'Actionable briefs',
      description: 'Turn audits into escalation-ready summaries and actions.',
      icon: FileText,
    },
    {
      title: 'Faster insights',
      description: 'Ask once, get a structured answer with clear next steps.',
      icon: Sparkles,
    },
  ];

  if (!messagesLoaded) {
    return <div className="flex h-screen items-center justify-center text-text-muted text-sm">Loading...</div>;
  }

  return (
    <div className="relative flex h-screen flex-col bg-transparent overflow-hidden">
      <div className="flex-1 overflow-y-auto pb-56 pt-6 md:pb-44 md:pt-8">
        {messages.length === 0 ? (
          <div className="flex min-h-[60vh] flex-col items-center justify-center px-4">
            <div className="w-full max-w-2xl space-y-9 text-center">
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4 }}
              >
                <h1 className="mb-3 text-5xl font-semibold tracking-tight text-text-primary md:text-6xl">
                  VIGIA
                </h1>
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
                      className="inline-flex items-center rounded-full border border-border bg-white/90 px-4 py-2 text-xs font-medium text-text-secondary shadow-[0_6px_14px_rgba(18,14,10,0.08)] transition-all hover:scale-105 hover:border-text-primary hover:text-text-primary active:animate-button-bounce"
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
          <div className="mx-auto w-full min-w-0 max-w-[900px] px-4 md:px-6">
            <div className="space-y-8">
                {messages.map((msg) => {
                  const isAssistant = msg.role === 'assistant';
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
                    <div key={msg.id}>
                      <ChatMessage
                        message={msg}
                        isActive={isActive}
                        isSpeaking={isSpeakingThis}
                        messageRef={isActive ? activeMessageRef : undefined}
                      />
                      {isAssistant && evidence?.sources?.length > 0 && (
                        <div className="mt-4 space-y-4 ml-0 md:ml-10">
                          {/* Sources */}
                          <div className="flex flex-wrap gap-2">
                            {evidence.sources.slice(0, 5).map((src: any, i: number) => (
                              <a
                                key={src.id || i}
                                href={src.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-white/80 px-3 py-1 text-xs text-text-secondary hover:border-text-primary hover:text-text-primary transition-colors"
                              >
                                <span className={`h-1.5 w-1.5 rounded-full ${
                                  src.trustLevel === 'legally-binding' ? 'bg-emerald-500' :
                                  src.trustLevel === 'official-portal' ? 'bg-blue-500' : 'bg-amber-500'
                                }`} />
                                {src.label}
                              </a>
                            ))}
                          </div>
                          {/* Follow-up suggestions */}
                          <div className="border-t border-border/40 pt-3">
                            <p className="text-xs font-semibold text-text-muted mb-2">Follow-ups</p>
                            <div className="space-y-1.5">
                              {getFollowUps(msg).map((q, i) => (
                                <button
                                  key={i}
                                  type="button"
                                  onClick={() => setValue(q)}
                                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-text-secondary hover:bg-white/80 hover:text-text-primary transition-colors"
                                >
                                  <span className="text-text-muted">↳</span>
                                  {q}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
                {isSending && messages.length > 0 && !messages[messages.length - 1]?.parts?.some((p: any) => p.type === 'text' && p.text) && (
                  <div className="flex items-center gap-2 text-sm text-text-muted animate-pulse ml-0 md:ml-10">
                    <span className="inline-block h-2 w-2 rounded-full bg-amber-400 animate-bounce" />
                    Searching infrastructure records...
                  </div>
                )}
                <div ref={bottomRef} className="h-2" />
            </div>
          </div>
        )}
      </div>

      {displayError && (
        <div className="fixed bottom-36 left-0 right-0 z-20 md:left-[260px]">
          <div className="mx-auto w-full max-w-3xl px-4 md:px-6">
            <div className="shell-card px-4 py-2.5 text-sm text-red-700">{displayError}</div>
          </div>
        </div>
      )}

      <motion.div
        className="fixed bottom-16 left-0 right-0 z-20 md:bottom-0 md:left-[260px]"
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
                : 'linear-gradient(to bottom, transparent, rgb(251, 247, 240))',
          }}
        />
        <div className="relative w-full px-4 pb-5 pt-3 md:px-6 md:pb-6">
          <div className="mx-auto w-full max-w-[900px]">
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
