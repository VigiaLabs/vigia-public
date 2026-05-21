'use client';

import { useRef } from 'react';
import { motion } from 'framer-motion';
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

  const isBusy = isSending || isProcessingVoice || isVoiceRecordingProp;
  const inputDisabled = isVoiceRecordingProp || isProcessingVoice || isSending;

  function handleImageFile(file: File) {
    if (!file.type.startsWith('image/') || !onImageSelect) return;
    const reader = new FileReader();
    reader.onload = () => onImageSelect(reader.result as string);
    reader.readAsDataURL(file);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    if (isSpeaking) stopTTS?.();
    onChange(next);
  }

  return (
    <>
      {imageDataUrl && onImageClear && (
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
            type="button"
            onClick={onImageClear}
            className="ml-auto rounded-full p-0.5 hover:bg-[#f3ede4]"
            aria-label="Remove image"
          >
            <X className="h-3 w-3" />
          </button>
        </motion.div>
      )}
      <motion.div
        className="shell-input-shell flex items-center gap-3 md:gap-4"
        onPaste={onPaste}
        animate={{ width: '100%', maxWidth: 'none' }}
      >
        {onImageSelect && (
          <>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex h-5 w-5 flex-shrink-0 items-center justify-center text-text-muted transition-all hover:text-text-primary active:animate-button-bounce"
              aria-label="Attach image"
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
            className={`flex h-5 w-5 flex-shrink-0 items-center justify-center transition-all active:animate-button-bounce ${
              sendLocation
                ? 'rounded-full bg-[#111111] text-white'
                : 'text-text-muted hover:text-text-primary'
            }`}
            aria-label="Toggle location"
          >
            <MapPin className="h-4 w-4" />
          </button>
        )}
        <input
          value={value}
          onChange={handleInputChange}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !inputDisabled) {
              e.preventDefault();
              onSubmit();
            }
          }}
          className="min-w-0 flex-1 bg-transparent text-[15px] text-text-primary placeholder:text-text-muted disabled:opacity-50 md:text-base"
          placeholder={
            isVoiceRecordingProp
              ? 'Listening...'
              : isSpeaking
                ? 'Type to stop speaking...'
                : isProcessingVoice
                  ? 'Transcribing audio...'
                  : !hasMessages
                    ? 'Ask about roads, budgets, or infrastructure...'
                    : !isOnline
                      ? 'Offline — queries queued'
                      : 'Ask about roads, budgets, or upload an image...'
          }
          disabled={inputDisabled}
          aria-label="Ask a question"
        />
        <div className="flex flex-shrink-0 items-center gap-1.5">
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
          {!isVoiceRecordingProp && (value.trim() || isSending) && (
            <button
              type="button"
              onClick={onSubmit}
              disabled={isBusy || !value.trim()}
              className="flex h-5 w-5 flex-shrink-0 items-center justify-center text-text-secondary transition-all disabled:text-[#d6cfc4] enabled:hover:text-text-primary enabled:active:animate-button-bounce"
              aria-label="Send"
            >
              {isBusy ? (
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-[#b8b0a0] border-t-text-primary" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </button>
          )}
        </div>
      </motion.div>
    </>
  );
}
