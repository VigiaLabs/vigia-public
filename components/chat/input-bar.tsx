'use client';

import { ArrowUp } from 'lucide-react';
import { useOnlineStatus } from '@/lib/db/use-online-status';

type InputBarProps = {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  isSending: boolean;
};

export function InputBar({
  value,
  onChange,
  onSubmit,
  isSending,
}: InputBarProps) {
  const isOnline = useOnlineStatus();

  return (
    <div className="fixed bottom-0 left-0 right-0 z-20 md:left-[260px]">
      <div className="pointer-events-none absolute inset-0 top-0 h-24 bg-gradient-to-b from-transparent via-cream/70 to-cream" />

      <div className="relative w-full px-4 py-4 md:px-8 md:py-6">
        <div className="w-full md:mx-auto md:max-w-3xl">
          {!isOnline && (
            <div className="mb-2 flex items-center gap-2 text-xs text-amber-700">
              <div className="h-1.5 w-1.5 rounded-full bg-amber-600" />
              <span className="font-normal">Offline — will sync when connected</span>
            </div>
          )}

          <div className="shell-input-shell flex items-end gap-2">
            <input
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !isSending) {
                  e.preventDefault();
                  onSubmit();
                }
              }}
              className="flex-1 bg-transparent text-sm font-normal text-text-primary outline-none placeholder:font-normal placeholder:text-text-muted disabled:opacity-50"
              placeholder="What would you like to know?"
              disabled={isSending}
              aria-label="Ask a question"
            />

            <button
              onClick={onSubmit}
              disabled={isSending || !value.trim()}
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-text-secondary transition-colors duration-200 disabled:text-[#d6cfc4] enabled:hover:bg-[#f4efe6] enabled:text-text-primary"
              aria-label="Send message"
            >
              {isSending ? (
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-[#b8b0a0] border-t-text-primary" />
              ) : (
                <ArrowUp className="h-4 w-4" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}