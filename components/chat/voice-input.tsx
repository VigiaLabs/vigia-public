'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { Mic, Square } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface VoiceInputProps {
  onAudioCapture: (blob: Blob) => void;
  isDisabled?: boolean;
  /** Matches compact icon buttons in chat-shell (h-5 / 16px icon). */
  size?: 'default' | 'compact';
  onRecordingChange?: (isRecording: boolean) => void;
}

function getSupportedMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

function getPermissionErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    switch (error.name) {
      case 'NotAllowedError':
        return 'Microphone access was denied. Enable it in your browser settings.';
      case 'NotFoundError':
        return 'No microphone was found on this device.';
      case 'NotReadableError':
        return 'Microphone is in use by another application.';
      case 'AbortError':
        return 'Recording was interrupted.';
      default:
        return error.message || 'Could not access the microphone.';
    }
  }
  return 'Could not access the microphone.';
}

export function VoiceInput({
  onAudioCapture,
  isDisabled = false,
  size = 'default',
  onRecordingChange,
}: VoiceInputProps) {
  const isCompact = size === 'compact';
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const mimeTypeRef = useRef<string | undefined>(undefined);
  const isRecordingRef = useRef(false);
  const isStartingRef = useRef(false);

  const [isRecording, setIsRecording] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const setRecording = useCallback(
    (recording: boolean) => {
      isRecordingRef.current = recording;
      setIsRecording(recording);
      onRecordingChange?.(recording);
    },
    [onRecordingChange]
  );

  const releaseStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
  }, []);

  useEffect(() => {
    return () => releaseStream();
  }, [releaseStream]);

  const ensureStream = useCallback(async (): Promise<MediaStream> => {
    if (streamRef.current?.active) {
      return streamRef.current;
    }

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      throw new DOMException('Media devices are not available.', 'NotSupportedError');
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    });
    streamRef.current = stream;
    return stream;
  }, []);

  const startRecording = useCallback(async () => {
    if (isDisabled || isRecordingRef.current || isStartingRef.current) return;
    if (typeof MediaRecorder === 'undefined') {
      setPermissionError('Voice recording is not supported in this browser.');
      return;
    }

    isStartingRef.current = true;
    setPermissionError(null);

    try {
      const stream = await ensureStream();
      audioChunksRef.current = [];

      const mimeType = getSupportedMimeType();
      mimeTypeRef.current = mimeType;

      const mediaRecorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blobType = mimeTypeRef.current?.split(';')[0] ?? 'audio/webm';
        const audioBlob = new Blob(audioChunksRef.current, { type: blobType });
        audioChunksRef.current = [];
        mediaRecorderRef.current = null;
        setRecording(false);

        if (audioBlob.size > 0) {
          onAudioCapture(audioBlob);
        }
      };

      mediaRecorder.onerror = () => {
        setPermissionError('Recording failed. Please try again.');
        setRecording(false);
        mediaRecorderRef.current = null;
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
      setPermissionError(getPermissionErrorMessage(error));
      releaseStream();
    } finally {
      isStartingRef.current = false;
    }
  }, [isDisabled, ensureStream, onAudioCapture, releaseStream, setRecording]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === 'inactive') {
      setRecording(false);
      return;
    }

    try {
      if (recorder.state === 'recording') {
        recorder.requestData();
      }
      recorder.stop();
    } catch (error) {
      console.error('Error stopping recording:', error);
      setRecording(false);
      mediaRecorderRef.current = null;
    }
  }, [setRecording]);

  const handleToggle = () => {
    if (isDisabled || isStartingRef.current) return;
    if (isRecordingRef.current) {
      stopRecording();
    } else {
      void startRecording();
    }
  };

  const isInteractionDisabled = isDisabled;

  return (
    <div className="relative flex flex-shrink-0 flex-col items-center">
      <button
        type="button"
        disabled={isInteractionDisabled}
        onClick={handleToggle}
        aria-label={isRecording ? 'Stop recording' : 'Use voice input'}
        aria-pressed={isRecording}
        title={permissionError ?? (isRecording ? 'Tap to stop' : 'Tap to speak')}
        className={cn(
          'relative inline-flex flex-shrink-0 items-center justify-center rounded-full text-sm font-medium transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-300 dark:focus-visible:ring-neutral-600',
          'disabled:pointer-events-none disabled:opacity-50',
          isCompact ? 'h-5 w-5' : 'h-10 w-10',
          !isInteractionDisabled &&
            (isCompact
              ? 'text-text-muted hover:text-text-primary active:animate-button-bounce'
              : 'hover:bg-gray-100 dark:hover:bg-neutral-800'),
          isRecording &&
            (isCompact
              ? 'text-red-500'
              : 'bg-red-50 text-red-500 dark:bg-red-950/30')
        )}
      >
        {isRecording && (
          <span
            className={cn(
              'absolute inset-0 rounded-full bg-red-500/15 animate-pulse',
              isCompact && 'inset-[-2px]'
            )}
            aria-hidden
          />
        )}

        {isRecording ? (
          <Square
            className={cn(
              'relative z-10 fill-current transition-colors',
              isCompact ? 'h-3 w-3' : 'h-4 w-4'
            )}
          />
        ) : (
          <Mic
            className={cn(
              'relative z-10 transition-colors',
              isCompact ? 'h-4 w-4' : 'h-5 w-5',
              isCompact ? 'text-current' : 'text-gray-500'
            )}
          />
        )}
      </button>

      {permissionError && (
        <p
          className="absolute top-full z-10 mt-1 max-w-[12rem] text-center text-[10px] leading-tight text-red-600 dark:text-red-400"
          role="alert"
        >
          {permissionError}
        </p>
      )}
    </div>
  );
}
