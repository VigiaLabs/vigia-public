'use client';

import { ArrowUp, ChevronDown, Crosshair } from 'lucide-react';
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
    <div className="fixed bottom-4 left-0 right-0 z-20 md:bottom-6 md:left-[260px]">
      <div className="w-full px-4 md:mx-auto md:max-w-3xl md:px-6">
        {!isOnline ? (
          <div className="mb-3 rounded-xl border border-border bg-surface px-4 py-2 text-xs text-text-secondary shadow-sm">
            You&apos;re offline. Queries will sync when connected.
          </div>
        ) : null}

        <div className="flex items-center gap-3 rounded-full border border-border bg-surface px-4 py-3 shadow-sm transition-all duration-200 focus-within:border-gray-300 focus-within:ring-1 focus-within:ring-gray-200 focus-within:shadow-md">
          <button className="flex items-center gap-1 text-sm text-text-secondary transition-colors hover:text-text-primary">
            <Crosshair className="h-4 w-4" />
            <span className="hidden sm:inline">Focus</span>
            <ChevronDown className="h-3 w-3" />
          </button>

          <div className="h-5 w-px bg-border" />

          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                onSubmit();
              }
            }}
            className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-muted outline-none"
            placeholder="Ask about roads, tenders, budgets, or infrastructure..."
            disabled={isSending}
            aria-label="Ask a question"
          />

          <button
            onClick={onSubmit}
            disabled={isSending}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-900 text-white transition-colors hover:bg-gray-700 disabled:opacity-50 md:h-8 md:w-8"
            aria-label="Send message"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}