'use client';

import { useRef, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowUp, ImageIcon, MapPin, X } from 'lucide-react';
import { useOnlineStatus } from '@/lib/db/use-online-status';
import { VoiceInput } from './voice-input';

export interface InputBarProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isSending: boolean;
  onVoiceCapture: (blob: Blob) => void | Promise<void>;
  isProcessingVoice?: boolean;
  isSpeaking?: boolean;
  isVoiceRecording?: boolean;
  onVoiceRecordingChange?: (recording: boolean) => void;
  stopTTS?: () => void;
  hasMessages?: boolean;
  imageDataUrl?: string | null;
  onImageSelect?: (dataUrl: string) => void;
  onImageClear?: () => void;
  sendLocation?: boolean;
  onToggleLocation?: () => void;
  onPaste?: (e: React.ClipboardEvent) => void;
}

export function InputBar({
  value,
  onChange,
  onSubmit,
  isSending,
  onVoiceCapture,
  isProcessingVoice = false,
  isSpeaking = false,
  isVoiceRecording: isVoiceRecordingProp,
  onVoiceRecordingChange,
  stopTTS,
  hasMessages = false,
  imageDataUrl,
  onImageSelect,
  onImageClear,
  sendLocation = false,
  onToggleLocation,
  onPaste,
}: InputBarProps) {
  const isOnline = useOnlineStatus();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const isBusy = isSending || isProcessingVoice || isVoiceRecordingProp;
  const inputDisabled = isVoiceRecordingProp || isProcessingVoice;
  const hasText = value.trim().length > 0;
  const canSend = hasText && !isBusy;

  // Auto-resize textarea up to ~6 lines
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = `${Math.min(ta.scrollHeight, 192)}px`;
  }, [value]);

  function handleImageFile(file: File) {
    if (!file.type.startsWith('image/') || !onImageSelect) return;
    const reader = new FileReader();
    reader.onload = () => onImageSelect(reader.result as string);
    reader.readAsDataURL(file);
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    if (isSpeaking) stopTTS?.();
    onChange(e.target.value);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !inputDisabled && !isSending) {
      e.preventDefault();
      onSubmit();
    }
  }

  const placeholder = isVoiceRecordingProp
    ? 'Listening...'
    : isProcessingVoice
      ? 'Transcribing audio...'
      : isSpeaking
        ? 'Type to interrupt...'
        : !hasMessages
          ? 'Describe your query…'
          : !isOnline
            ? 'Offline — queries queued'
            : 'Ask a follow-up...';

  return (
    <div className="relative w-full">
      {/* Image attachment preview */}
      <AnimatePresence>
        {imageDataUrl && onImageClear && (
          <motion.div
            className="mb-2 flex items-center gap-2 rounded-xl border border-border bg-white px-3 py-2 text-xs text-text-secondary shadow-sm"
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.97 }}
            transition={{ duration: 0.18 }}
          >
            <ImageIcon className="h-3.5 w-3.5 shrink-0 text-text-muted" />
            <span className="truncate font-medium">Image attached</span>
            <button
              type="button"
              onClick={onImageClear}
              className="ml-auto shrink-0 rounded-full p-0.5 text-text-muted transition-colors hover:bg-[#f4f4f5] hover:text-text-primary"
              aria-label="Remove image"
            >
              <X className="h-3 w-3" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main container */}
      <div
        className="overflow-hidden rounded-[18px] border border-border bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04),0_4px_18px_rgba(0,0,0,0.05)] transition-all duration-200 focus-within:border-[#b8b8bc] focus-within:shadow-[0_2px_6px_rgba(0,0,0,0.07),0_8px_28px_rgba(0,0,0,0.07)]"
        onPaste={onPaste}
      >
        {/* Textarea — no bottom padding; toolbar supplies the breathing room below */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          rows={1}
          className="w-full resize-none bg-transparent px-4 pb-0 pt-[14px] text-[15px] leading-relaxed text-text-primary placeholder:text-[#a1a1aa] focus:outline-none disabled:opacity-40"
          placeholder={placeholder}
          disabled={inputDisabled}
          aria-label="Ask a question"
          style={{ maxHeight: '192px', overflowY: 'auto' }}
        />

        {/* Toolbar — top padding acts as the only spacer between text and tools */}
        <div className="flex items-center gap-1.5 px-2.5 pb-2.5 pt-2">
          {/* Left: attachment tools */}
          <div className="flex items-center gap-0.5">
            {onImageSelect && (
              <>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-[#a1a1aa] transition-colors hover:bg-[#f4f4f5] hover:text-text-secondary"
                  aria-label="Attach image"
                  title="Attach image"
                >
                  <ImageIcon className="h-4 w-4" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleImageFile(f);
                    e.target.value = '';
                  }}
                />
              </>
            )}

            {onToggleLocation && (
              <button
                type="button"
                onClick={onToggleLocation}
                aria-label="Toggle location"
                title={sendLocation ? 'Disable location' : 'Attach location'}
                className={`flex h-8 items-center gap-1 rounded-lg px-2 text-xs font-medium transition-all ${
                  sendLocation
                    ? 'bg-[#09090b] text-white'
                    : 'text-[#a1a1aa] hover:bg-[#f4f4f5] hover:text-text-secondary'
                }`}
              >
                <MapPin className="h-4 w-4" />
                {sendLocation && <span className="pr-0.5 text-[11px] tracking-wide">On</span>}
              </button>
            )}
          </div>

          {/* Shift+Enter hint — fades in once user starts typing */}
          {hasText && !isVoiceRecordingProp && (
            <span className="hidden select-none text-[11px] text-[#c4c4c8] sm:block">
              Shift+↵ new line
            </span>
          )}

          {/* Right: voice + send */}
          <div className="ml-auto flex items-center gap-1.5">
            <VoiceInput
              size="compact"
              onAudioCapture={onVoiceCapture}
              onRecordingChange={(recording) => {
                if (recording) stopTTS?.();
                onVoiceRecordingChange?.(recording);
              }}
              isDisabled={
                ((isSending || isProcessingVoice) && !isVoiceRecordingProp) ||
                !isOnline
              }
            />

            {!isVoiceRecordingProp && (
              <button
                type="button"
                onClick={onSubmit}
                disabled={!canSend && !isSending}
                aria-label={isSending ? 'Sending…' : 'Send'}
                className={`flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full transition-all duration-150 ${
                  isSending
                    ? 'cursor-default bg-[#09090b] text-white'
                    : canSend
                      ? 'bg-[#09090b] text-white hover:opacity-85 active:scale-95'
                      : 'cursor-not-allowed bg-[#ebebec] text-[#b4b4b8]'
                }`}
              >
                {isSending ? (
                  <span className="h-2.5 w-2.5 rounded-[2px] bg-white/90" aria-hidden />
                ) : (
                  <ArrowUp className="h-3.5 w-3.5" strokeWidth={2.5} />
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
