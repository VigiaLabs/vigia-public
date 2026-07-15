'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { getLandingGreeting, LANDING_SUGGESTIONS } from '@/lib/chat/greeting';
import type { FileUIPart, UIMessage } from 'ai';
import {
  createThread,
  saveMessage,
  getMessagesByThread,
  updateMessageMetadata,
  queueSubmission,
  isStuckOfflineAssistantMessage,
} from '@/lib/db';
import { persistOfflineQueryTurn } from '@/lib/db/persist-offline-turn';
import { syncPendingQueries } from '@/lib/edge/pending-query-sync';
import { PendingQueryRetryCard } from '@/components/chat/pending-query-retry-card';
import { ChatMessage } from '@/components/chat/chat-message';
import { PipelineTrace } from '@/components/chat/pipeline-trace';
import { SourcesPanel } from '@/components/chat/sources-panel';
import { MessageActionBar } from '@/components/chat/message-action-bar';
import { PendingActionCard } from '@/components/chat/pending-action-card';
import { LivePipeline } from '@/components/chat/live-pipeline';
import dynamic from 'next/dynamic';
const MapDashboard = dynamic(() => import('@/components/chat/map-dashboard').then(m => ({ default: m.MapDashboard })), { ssr: false });
import { SourcesStrip } from '@/components/chat/sources-strip';
import { EvidenceStatePanel } from '@/components/chat/evidence-state-panel';
import { useEvidence } from '@/components/chat/evidence-context';
import { useHeaderTab } from '@/components/chat/header';
import { useMap } from '@/lib/context/map-context';

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
import { useVoiceChat, isNetworkError } from '@/hooks/use-voice-chat';
import { getMessageText } from '@/lib/voice/get-message-text';
import { speakText, stopSpeaking } from '@/lib/voice/speak-text';
import { stripMarkdown } from '@/lib/voice/strip-markdown';
import { resolveVoiceLocale } from '@/lib/voice/locale';
import { useSettings } from '@/lib/context/settings-context';
import type { VoiceLocale } from '@/types/voice';
import { isVigiaEvidenceMetadata } from '@/types/evidence';
import { useOfflineRuntime } from '@/lib/edge/offline-context';
import { buildOfflineAnswer } from '@/lib/edge/offline-answer';
import { prepareImageDataUrl } from '@/lib/chat/prepare-image';

type Props = { threadId?: string };

function toUIMessages(
  records: Array<{ id: string; role: string; content: string; metadata?: Record<string, unknown> }>
): UIMessage[] {
  return records.map((m) => {
    const imageUrl = m.role === 'user' && typeof m.metadata?.imageUrl === 'string'
      ? m.metadata.imageUrl
      : null;
    const imageMediaType = typeof m.metadata?.imageMediaType === 'string'
      ? m.metadata.imageMediaType
      : imageUrl?.match(/^data:([^;,]+)/)?.[1] ?? 'image/jpeg';
    const parts: UIMessage['parts'] = [
      ...(imageUrl ? [{ type: 'file' as const, mediaType: imageMediaType, url: imageUrl }] : []),
      { type: 'text' as const, text: m.content },
    ];
    return {
      id: m.id,
      role: m.role as UIMessage['role'],
      parts,
      ...(m.metadata ? { metadata: m.metadata } : {}),
    };
  });
}

function notifyThreadsUpdated() {
  window.dispatchEvent(new Event('vigia:threads-updated'));
}

const QUEUED_OFFLINE_COPY =
  "You're offline, so I couldn't run a live search. I've saved this question and will answer it automatically the moment you're back online — it won't be lost.";
const INTERRUPTED_COPY =
  "The connection dropped while I was searching. I've saved this question and will finish answering automatically as soon as you reconnect.";

/** True when the browser reports no connectivity right now. */
function browserOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/** Avoid Next.js RSC fetches when offline — they crash the page. */
function navigateToThread(threadId: string, router: ReturnType<typeof useRouter>) {
  const path = `/t/${threadId}`;
  if (browserOffline()) {
    window.history.replaceState(window.history.state, '', path);
    return;
  }
  router.replace(path, { scroll: false });
}

function getBrowserLocation(
  enabled: boolean,
  options?: { timeoutMs?: number }
): Promise<{ lat: number; lng: number } | undefined> {
  if (!enabled || !navigator.geolocation) return Promise.resolve(undefined);
  const timeoutMs = options?.timeoutMs ?? 5000;
  return new Promise((resolve) =>
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      () => resolve(undefined),
      { enableHighAccuracy: false, timeout: timeoutMs, maximumAge: 300000 }
    )
  );
}

/** Read thread id from URL when Next.js params lag behind history.replaceState. */
function threadIdFromPathname(): string | undefined {
  if (typeof window === 'undefined') return undefined;
  return window.location.pathname.match(/^\/t\/([^/]+)/)?.[1];
}

export function ChatShell({ threadId: initialThreadId }: Props) {
  const router = useRouter();
  const { preferences } = useSettings();
  const offlineRuntime = useOfflineRuntime();
  const defaultLocale =
    preferences.defaultLanguage === 'auto' ? null : preferences.defaultLanguage;
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
  // Details of the in-progress voice turn, so a mid-flight disconnect can be
  // queued for replay (the transcribed text is only known inside the hook).
  const lastVoiceTurnRef = useRef<{
    threadId: string;
    text: string;
    userMessageId: string;
  } | null>(null);

  const isTTSActive = isSpeaking || isLoadingSpeech;

  const activeThreadId = currentThreadId ?? initialThreadId ?? threadIdFromPathname() ?? null;

  const ensureThread = useCallback(
    async (title: string) => {
      let threadId = currentThreadId;
      if (threadId) return threadId;

      threadId = crypto.randomUUID();
      const trimmedTitle = title.length > 40 ? `${title.slice(0, 40)}…` : title;
      await createThread(threadId, trimmedTitle);
      setCurrentThreadId(threadId);
      setChatId(threadId);
      selfCreatedThreadRef.current = threadId;
      notifyThreadsUpdated();
      navigateToThread(threadId, router);
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
    speakResponses: preferences.speakResponses,
    defaultLocale,
    autoDetectLanguage: preferences.autoDetectLanguage,
    responseStyle: preferences.responseStyle,
    onVoiceError: (err) => setError(err.message),
    onBeforeSend: async ({ text, locale }) => {
      pendingVoiceTtsLocaleRef.current = locale;
      const threadId = await ensureThread(text);
      const userMessageId = await saveMessage(threadId, 'user', text);
      lastVoiceTurnRef.current = { threadId, text, userMessageId };
    },
    onFinish: async (message, { isError, isAbort }) => {
      // A dropped/aborted stream may contain partial assistant text. Do not
      // persist it; the caller will queue one placeholder for a clean replay.
      if (isError || isAbort) return;

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

  /**
   * Persist a placeholder answer and queue the query for cloud replay when we
   * either can't reach the network now (offline) or a live search was cut off
   * mid-flight. The placeholder bubble is rewritten with the real answer once
   * connectivity returns.
   */
  const queueTurnForReplay = useCallback(
    async (opts: {
      threadId: string;
      userMessageId: string;
      text: string;
      gps?: { lat: number; lng: number };
      imageUrl?: string;
      interrupted: boolean;
    }) => {
      const placeholderText = opts.interrupted ? INTERRUPTED_COPY : QUEUED_OFFLINE_COPY;
      const placeholderMeta: Record<string, unknown> = {
        type: 'vigia-pending-retry',
        originalQuery: opts.text,
        offline: {
          mode: 'offline',
          lastSyncAt: offlineRuntime.lastSyncAt || undefined,
          packVersion: offlineRuntime.packVersion ?? undefined,
          stale: offlineRuntime.stale,
        },
      };

      const { messages } = await persistOfflineQueryTurn({
        threadId: opts.threadId,
        userMessageId: opts.userMessageId,
        text: opts.text,
        placeholderText,
        placeholderMeta,
        gps: opts.gps,
        imageUrl: opts.imageUrl,
      });

      setMessages(toUIMessages(messages));
      await offlineRuntime.refreshPendingCount();
      window.dispatchEvent(new Event('vigia:pending-count-changed'));
      notifyThreadsUpdated();

      if (!browserOffline()) {
        void syncPendingQueries(opts.threadId);
      }
    },
    [offlineRuntime, setMessages]
  );

  const reloadThreadMessages = useCallback(async (threadId: string) => {
    const records = await getMessagesByThread(threadId);
    setMessages(toUIMessages(records));
  }, [setMessages]);

  const triggerReplayForOpenThread = useCallback(async () => {
    const tid = activeThreadId;
    if (!tid || browserOffline()) return;
    const result = await syncPendingQueries(tid);
    if (result.synced > 0) {
      await reloadThreadMessages(tid);
    }
  }, [activeThreadId, reloadThreadMessages]);

  // Reload the open thread from IndexedDB whenever a queued query has been
  // replayed and answered, so the placeholder bubble shows the real answer.
  useEffect(() => {
    const onSynced = (event: Event) => {
      const detail = (event as CustomEvent).detail as { threadIds?: string[] } | undefined;
      const tid = activeThreadId;
      if (!tid) return;
      if (detail?.threadIds && !detail.threadIds.includes(tid)) return;
      void reloadThreadMessages(tid);
    };
    const onThreadsUpdated = () => {
      if (activeThreadId) void reloadThreadMessages(activeThreadId);
    };
    window.addEventListener('vigia:pending-queries-synced', onSynced);
    window.addEventListener('vigia:threads-updated', onThreadsUpdated);
    return () => {
      window.removeEventListener('vigia:pending-queries-synced', onSynced);
      window.removeEventListener('vigia:threads-updated', onThreadsUpdated);
    };
  }, [activeThreadId, reloadThreadMessages]);

  // Replay when the open thread has queued work and connectivity returns.
  useEffect(() => {
    if (!activeThreadId || !messagesLoaded || browserOffline()) return;
    void triggerReplayForOpenThread();
  }, [activeThreadId, messagesLoaded, offlineRuntime.mode, offlineRuntime.pendingQueryCount, triggerReplayForOpenThread]);

  useEffect(() => {
    const onOnline = () => { void triggerReplayForOpenThread(); };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [triggerReplayForOpenThread]);

  const isSending = status === 'streaming' || status === 'submitted';
  const isBusy = isSending || isProcessingVoice || isVoiceRecording;

  const currentAssistantHasText = useMemo(() => {
    const latest = messages.at(-1);
    if (latest?.role !== 'assistant') return false;
    return latest.parts?.some(
      (part): part is { type: 'text'; text: string } => part.type === 'text' && !!part.text
    ) ?? false;
  }, [messages]);

  const showGeneratingCard = isSending && messages.length > 0 && !currentAssistantHasText;

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
      setCurrentThreadId(initialThreadId);
      setChatId(initialThreadId);
      setMessagesLoaded(true);
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

  async function handleImageFile(file: File) {
    if (!file.type.startsWith('image/')) return;
    setImageDataUrl(await prepareImageDataUrl(file));
  }

  function handlePaste(e: React.ClipboardEvent) {
    for (const item of e.clipboardData.items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile();
        if (file) void handleImageFile(file);
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
      lastVoiceTurnRef.current = null;
    } catch (err) {
      cancelPendingVoiceReply();
      // A dropped connection after transcription: queue the turn for replay
      // instead of surfacing "Failed to fetch".
      const turn = lastVoiceTurnRef.current;
      if (isNetworkError(err) && turn) {
        lastVoiceTurnRef.current = null;
        await queueTurnForReplay({
          threadId: turn.threadId,
          userMessageId: turn.userMessageId,
          text: turn.text,
          interrupted: !browserOffline() && offlineRuntime.mode !== 'offline',
        });
      }
    }
  };

  async function handleSubmit() {
    const submittedImage = imageDataUrl;
    const text = value.trim() || (submittedImage
      ? 'Please analyze this road photo and recommend the appropriate next steps.'
      : '');
    if (!text || isBusy) return;

    if (isTTSActive || isVoiceTurn) interruptSpeaking();
    clearVoiceLocale();
    setValue('');
    setImageDataUrl(null);
    setError(null);
    clearVoiceError();

    const treatAsOffline = browserOffline() || offlineRuntime.mode === 'offline';

    try {
      const threadId = await ensureThread(text);
      const imageMediaType = submittedImage?.match(/^data:([^;,]+)/)?.[1] ?? 'image/jpeg';
      const userMetadata = submittedImage
        ? { imageUrl: submittedImage, imageMediaType }
        : undefined;
      const userMessageId = await saveMessage(threadId, 'user', text, userMetadata);

      // Show the user message immediately from IndexedDB — before GPS or network.
      const afterUserSave = await getMessagesByThread(threadId);
      setMessages(toUIMessages(afterUserSave));
      notifyThreadsUpdated();

      const imageUrl = submittedImage ?? undefined;
      const isCitizenReport =
        imageUrl != null ||
        /\b(report|pothole|damage|broken|hazard|complaint)\b/i.test(text);

      // Don't block offline persistence on GPS (can hang several seconds offline).
      const gps = treatAsOffline
        ? undefined
        : await getBrowserLocation(sendLocation, { timeoutMs: 3000 });

      if (treatAsOffline) {
        const cached = await buildOfflineAnswer(text, gps);

        if (cached) {
          await saveMessage(threadId, 'assistant', cached.text, cached.metadata);
          const records = await getMessagesByThread(threadId);
          setMessages(toUIMessages(records));
          notifyThreadsUpdated();
          return;
        }

        if (isCitizenReport) {
          await queueSubmission({ threadId, text, imageUrl, gps });
          await offlineRuntime.refreshPendingCount();
          const assistantText = 'Saved locally and queued for VIGIA analysis after reconnection. This does **not** mean a complaint has been filed with a government authority.';
          const metadata: Record<string, unknown> = {
            type: 'vigia-evidence',
            sources: [],
            claims: [{
              category: 'report-status', status: 'unavailable', subject: 'citizen report',
              predicate: 'authority-filing-status', value: 'not filed', sourceId: 'local-outbox',
              sourceQuote: 'Stored only in this browser until reconnection', retrievedAt: new Date().toISOString(),
            }],
            offline: { mode: 'offline', lastSyncAt: offlineRuntime.lastSyncAt || undefined, packVersion: offlineRuntime.packVersion ?? undefined, stale: offlineRuntime.stale },
          };
          await saveMessage(threadId, 'assistant', assistantText, metadata);
          const records = await getMessagesByThread(threadId);
          setMessages(toUIMessages(records));
          notifyThreadsUpdated();
          return;
        }

        await queueTurnForReplay({
          threadId,
          userMessageId,
          text,
          imageUrl,
          interrupted: false,
        });
        return;
      }

      try {
        const files: FileUIPart[] | undefined = submittedImage
          ? [{ type: 'file', mediaType: imageMediaType, url: submittedImage }]
          : undefined;
        await sendMessage({ text, files }, { requestBody: { gps } });
      } catch (err) {
        if (isNetworkError(err)) {
          await queueTurnForReplay({
            threadId,
            userMessageId,
            text,
            gps,
            imageUrl,
            interrupted: true,
          });
        } else {
          if (submittedImage) setImageDataUrl(submittedImage);
          throw err;
        }
      }
    } catch (err) {
      if (submittedImage) setImageDataUrl(submittedImage);
      const msg = err instanceof Error ? err.message : 'Could not save your message locally.';
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

  const { active: activeHeaderTab } = useHeaderTab();
  const { addMarkers, clearMarkers } = useMap();

  // Clear map markers when thread changes
  useEffect(() => {
    clearMarkers();
    processedMsgIds.current.clear();
  }, [initialThreadId, clearMarkers]);
  const isMapTab = activeHeaderTab === 'map';

  // Extract all links from messages for the Links tab
  const allLinks = useMemo(() => {
    const links: Array<{ url: string; label: string; messageId: string }> = [];
    for (const msg of messages) {
      if (msg.role !== 'assistant') continue;
      const meta = (msg as any).metadata;
      if (meta?.sources) {
        for (const src of meta.sources) {
          if (src.url) links.push({ url: src.url, label: src.label, messageId: msg.id });
        }
      }
      const text = msg.parts?.filter((p): p is { type: 'text'; text: string } => p.type === 'text').map(p => p.text).join(' ') ?? '';
      const urlMatches = text.match(/https?:\/\/[^\s)]+/g);
      if (urlMatches) {
        for (const url of urlMatches) {
          if (!links.some(l => l.url === url)) {
            links.push({ url, label: url.replace(/https?:\/\/(www\.)?/, '').split('/')[0], messageId: msg.id });
          }
        }
      }
    }
    return links;
  }, [messages]);

  // Push spatial markers from evidence to map context (only new messages)
  const processedMsgIds = useRef(new Set<string>());
  useEffect(() => {
    for (const msg of messages) {
      if (processedMsgIds.current.has(msg.id)) continue;
      const meta = (msg as any).metadata;
      if (meta?.type === 'vigia-evidence' && meta.spatialMarkers?.length) {
        addMarkers(meta.spatialMarkers);
        processedMsgIds.current.add(msg.id);
      }
    }
  }, [messages, addMarkers]);

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
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden bg-transparent">
      <div className={isMapTab ? 'relative flex-1 min-h-0 overflow-hidden z-0' : 'flex-1 overflow-y-auto pb-[calc(env(safe-area-inset-bottom,0px)+11.5rem)] pt-3 md:pb-48 md:pt-8'}>

        {/* Map Tab */}
        {isMapTab && (
          <div className="absolute inset-0 z-0">
            <MapDashboard />
          </div>
        )}

        {/* Links Tab */}
        {activeHeaderTab === 'links' && (
          <motion.div
            className="mx-auto w-full max-w-[900px] px-4 md:px-6"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <motion.h2
              className="mb-4 text-lg font-semibold text-text-primary"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, delay: 0.04 }}
            >
              Links
            </motion.h2>
            {allLinks.length === 0 ? (
              <motion.p
                className="text-sm text-text-muted"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2, delay: 0.08 }}
              >
                No links in this conversation yet.
              </motion.p>
            ) : (
              <div className="space-y-2">
                {allLinks.map((link, i) => (
                  <motion.a
                    key={i}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-3 rounded-lg border border-border/60 bg-white px-4 py-3 transition-colors hover:bg-[#fafafa]"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22, delay: 0.05 + i * 0.035 }}
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-text-primary">{link.label}</div>
                      <div className="truncate text-xs text-text-muted">{link.url}</div>
                    </div>
                  </motion.a>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* Answer Tab (default chat) */}
        {activeHeaderTab === 'answer' && messages.length > 0 && (
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
                  const rawMetadata = (msg as { metadata?: unknown }).metadata;
                  const msgText = getMessageText(msg);
                  const isStuckPlaceholder =
                    isAssistant &&
                    isStuckOfflineAssistantMessage({
                      role: 'assistant',
                      content: msgText,
                      metadata: rawMetadata as Record<string, unknown> | undefined,
                    });
                  const evidence = isAssistant && !isStuckPlaceholder && isVigiaEvidenceMetadata(rawMetadata)
                    ? rawMetadata
                    : null;

                  return (
                    <motion.div
                      key={msg.id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
                      className={isAssistant ? 'ml-0 md:ml-10' : undefined}
                    >
                      {isAssistant && evidence && Array.isArray(evidence.debugTrace) && evidence.debugTrace.length > 0 && (
                        <div className="mb-1">
                          <PipelineTrace
                            steps={evidence.debugTrace as React.ComponentProps<typeof PipelineTrace>['steps']}
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
                      {isStuckPlaceholder && (
                        <PendingQueryRetryCard
                          isRetrying={offlineRuntime.querySync.running}
                          lastError={offlineRuntime.querySync.lastError}
                          onRetry={() => {
                            if (activeThreadId) {
                              void offlineRuntime.retryQueuedQueries(activeThreadId);
                              void triggerReplayForOpenThread();
                            }
                          }}
                        />
                      )}
                      {isAssistant && evidence && (
                        <div className="shell-answer-footer mt-5 space-y-4">
                          <EvidenceStatePanel claims={evidence.claims} offline={evidence.offline} />
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
                          {!!evidence.pendingAction && (
                            <PendingActionCard
                              action={evidence.pendingAction as React.ComponentProps<typeof PendingActionCard>['action']}
                              onSelectAction={(action) => setValue(action)}
                            />
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
        className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+4.25rem)] left-0 right-0 z-50 transition-[left] duration-300 md:bottom-0 md:left-[var(--sidebar-width,0px)]"
        initial={false}
        animate={{ y: messages.length === 0 ? '-28vh' : 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      >
        <motion.div
          className="pointer-events-none absolute inset-0"
          animate={isMapTab || messages.length === 0 ? { height: 0 } : { height: 140 }}
          transition={{ duration: 0.5 }}
          style={{
            background:
              isMapTab || messages.length === 0
                ? 'transparent'
                : 'linear-gradient(to bottom, transparent, rgb(255, 255, 255) 70%)',
          }}
        />
        <div className="relative w-full px-4 pb-6 pt-3 md:px-6 md:pb-8">
          <div className="mx-auto w-full max-w-[900px]">
            {activeHeaderTab === 'answer' && messages.length === 0 && (
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

            {activeHeaderTab === 'answer' && (
              <>
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
              </>
            )}

            {activeHeaderTab === 'answer' && messages.length === 0 && (
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
