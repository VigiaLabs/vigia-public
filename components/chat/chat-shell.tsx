'use client';

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useActions, useUIState, readStreamableValue } from '@ai-sdk/rsc';
import type { AI } from '@/app/ai/provider';
import type { StreamableValue } from '@ai-sdk/rsc';
import { useOnlineStatus } from '@/lib/db/use-online-status';
import {
  createThread,
  saveMessage,
  getMessagesByThread,
} from '@/lib/db';
import { ArrowUp, ImageIcon, MapPin, X } from 'lucide-react';

type Props = { threadId?: string };

export function ChatShell({ threadId: initialThreadId }: Props) {
  const isOnline = useOnlineStatus();
  const { submitAuditRequest } = useActions() as {
    submitAuditRequest: (payload: unknown) => Promise<{
      ui: React.ReactNode;
      text: StreamableValue<string>;
    }>;
  };
  const [messages, setMessages] = useUIState<typeof AI>();

  const [value, setValue] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentThreadId, setCurrentThreadId] = useState<string | null>(initialThreadId ?? null);

  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [sendLocation, setSendLocation] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  useEffect(() => {
    if (!initialThreadId) {
      setCurrentThreadId(null);
      setMessages([]);
    }
  }, [initialThreadId, setMessages]);

  // Load saved thread messages on mount
  useEffect(() => {
    if (!initialThreadId) return;

    async function load() {
      const msgs = await getMessagesByThread(initialThreadId!);
      if (!msgs.length) return;

      setMessages(
        msgs.map((m) => ({
          id: m.id,
          role: m.role,
          display: (
            <div className={m.role === 'user' ? 'flex justify-end' : ''}>
              <div
                className={
                  m.role === 'user'
                    ? 'shell-bubble-user max-w-[70%] break-words'
                    : 'shell-bubble-assistant whitespace-pre-wrap'
                }
              >
                {m.content}
              </div>
            </div>
          ),
        }))
      );
    }
    void load();
  }, [initialThreadId, setMessages]);

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

  async function handleSubmit() {
    const text = value.trim();
    if (!text || isSending) return;

    setValue('');
    setError(null);
    setIsSending(true);

    // Create or reuse thread
    let threadId = currentThreadId;
    if (!threadId) {
      threadId = crypto.randomUUID();
      const title = text.length > 40 ? `${text.slice(0, 40)}…` : text;
      await createThread(threadId, title);
      setCurrentThreadId(threadId);
      window.history.replaceState(null, '', `/t/${threadId}`);
    }

    // Save user message
    await saveMessage(threadId, 'user', text);

    // Show user message in UI
    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: 'user',
        display: (
          <div className="flex justify-end">
            <div className="shell-bubble-user max-w-[70%] break-words">
              {text}
              {imageDataUrl && (
                <div className="mt-2 flex items-center gap-1.5 text-xs text-text-muted">
                  <ImageIcon className="h-3.5 w-3.5" />
                  Image attached
                </div>
              )}
              {sendLocation && (
                <div className="mt-1 flex items-center gap-1.5 text-xs text-text-muted">
                  <MapPin className="h-3.5 w-3.5" />
                  Location included
                </div>
              )}
            </div>
          </div>
        ),
      },
    ]);

    try {
      // Build history for multi-turn context
      const allMsgs = await getMessagesByThread(threadId);
      const history = allMsgs.slice(-10).map((m) => ({ role: m.role, content: m.content }));

      const payload: Record<string, unknown> = {
        text,
        threadId,
        messageId: crypto.randomUUID(),
        history,
      };
      if (imageDataUrl) payload.imageUrl = imageDataUrl;
      if (sendLocation) payload.gps = { lat: 19.076, lng: 72.877 };

      const { ui, text: textStream } = await submitAuditRequest(payload);

      // Append streamed UI
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: 'assistant', display: ui },
      ]);

      // Read the text value and persist to Dexie
      let assistantText = '';
      for await (const chunk of readStreamableValue(textStream)) {
        if (chunk) assistantText = chunk;
      }
      if (assistantText) {
        await saveMessage(threadId, 'assistant', assistantText);
      }

      setImageDataUrl(null);
      setSendLocation(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Something went wrong.';
      setError(msg);
      setMessages((prev) => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
            display: <div className="shell-card px-4 py-3 text-sm text-red-700">{msg}</div>,
        },
      ]);
    } finally {
      setIsSending(false);
    }
  }

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
                <h1 className="text-6xl font-light tracking-tight text-text-primary mb-2">VIGIA</h1>
                <p className="text-sm text-text-muted">Infrastructure intelligence</p>
              </motion.div>

              {/* Action buttons */}
              <motion.div
                className="flex flex-wrap justify-center gap-3"
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: 0.5 }}
              >
                {['Build infrastructure plan', 'Analyze budget', 'Track spatial data'].map((action, i) => (
                  <motion.button
                    key={action}
                    className="inline-flex items-center rounded-full border border-border bg-white px-4 py-2 text-xs font-medium text-text-secondary transition-all hover:border-text-primary hover:text-text-primary hover:scale-105 active:animate-button-bounce"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.58 + i * 0.08 }}
                    onClick={() => setValue(action)}
                  >
                    {action}
                  </motion.button>
                ))}
              </motion.div>
            </div>
          </div>
        ) : (
          <div className="mx-auto w-full min-w-0 max-w-3xl px-4 md:px-6">
            <div className="space-y-6">
              {messages.map((msg) => (
                <div key={msg.id}>{msg.display}</div>
              ))}
            </div>
          </div>
        )}
        <div ref={bottomRef} className="h-2" />
      </div>

      {error && (
        <div className="fixed bottom-36 left-0 right-0 z-20 md:left-[260px]">
          <div className="mx-auto w-full max-w-3xl px-4 md:px-6">
            <div className="shell-card px-4 py-2.5 text-sm text-red-700">{error}</div>
          </div>
        </div>
      )}

      {/* Animated Search Bar - Single Instance */}
      <motion.div
        className="fixed bottom-0 left-0 right-0 z-20 md:left-[260px]"
        initial={false}
        animate={{
          y: messages.length === 0 ? '-32vh' : 0,
        }}
        transition={{
          duration: 0.55,
          ease: [0.22, 1, 0.36, 1],
        }}
      >
        <motion.div
          className="pointer-events-none absolute inset-0"
          animate={
            messages.length === 0
              ? { height: 0 }
              : { height: 112 }
          }
          transition={{ duration: 0.5 }}
          style={{
            background: messages.length === 0 ? 'transparent' : 'linear-gradient(to bottom, transparent, rgb(250, 248, 243))',
          }}
        />
        <div className="relative w-full px-4 py-4 md:px-6">
          <div className="mx-auto w-full max-w-3xl">
            {imageDataUrl && (
              <motion.div
                className="shell-card mb-2 flex items-center gap-2 px-3 py-2 text-xs text-text-secondary"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
              >
                <span className="flex items-center gap-1.5">
                  <ImageIcon className="h-3.5 w-3.5" />
                  Image attached
                </span>
                <button
                  onClick={() => setImageDataUrl(null)}
                  className="ml-auto rounded-full p-0.5 hover:bg-[#f3ede4]"
                  aria-label="Remove image"
                >
                  <X className="h-3 w-3" />
                </button>
              </motion.div>
            )}
            <motion.div
              className="shell-input-shell flex items-center gap-3"
              onPaste={handlePaste}
              animate={
                messages.length === 0
                  ? {
                      width: '100%',
                      maxWidth: 'none',
                    }
                  : {
                      width: '100%',
                      maxWidth: 'none',
                    }
              }
            >
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="flex h-5 w-5 flex-shrink-0 items-center justify-center text-text-muted transition-all hover:text-text-primary active:animate-button-bounce"
                aria-label="Attach image"
              >
                <ImageIcon className="h-4 w-4" />
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageFile(f); e.target.value = ''; }} />
              <button
                type="button"
                onClick={() => setSendLocation((v) => !v)}
                className={`flex h-5 w-5 flex-shrink-0 items-center justify-center transition-all active:animate-button-bounce ${sendLocation ? 'bg-[#111111] text-white rounded-full' : 'text-text-muted hover:text-text-primary'}`}
                aria-label="Toggle location"
              >
                <MapPin className="h-4 w-4" />
              </button>
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey && !isSending) { e.preventDefault(); handleSubmit(); } }}
                className="flex-1 min-w-0 bg-transparent text-base text-text-primary placeholder:text-text-muted disabled:opacity-50"
                placeholder={
                  messages.length === 0
                    ? 'Ask about roads, budgets, or infrastructure...'
                    : !isOnline
                      ? 'Offline — queries queued'
                      : 'Ask about roads, budgets, or upload an image...'
                }
                disabled={isSending}
                aria-label="Ask a question"
              />
              <button
                onClick={handleSubmit}
                disabled={isSending || !value.trim()}
                className="flex h-5 w-5 flex-shrink-0 items-center justify-center text-text-secondary transition-all disabled:text-[#d6cfc4] enabled:hover:text-text-primary enabled:active:animate-button-bounce"
                aria-label="Send"
              >
                {isSending ? <div className="h-3 w-3 animate-spin rounded-full border-2 border-[#b8b0a0] border-t-text-primary" /> : <ArrowUp className="h-4 w-4" />}
              </button>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
