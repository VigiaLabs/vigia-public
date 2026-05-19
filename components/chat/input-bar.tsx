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
      {/* Gradient fade for visual integration */}
      <div className="absolute inset-0 top-0 h-24 bg-gradient-to-b from-transparent via-white/50 to-white pointer-events-none" />
      
      <div className="relative w-full px-4 py-4 md:px-8 md:py-6">
        <div className="w-full md:mx-auto md:max-w-3xl">
          {/* Offline indicator - minimal */}
          {!isOnline && (
            <div className="mb-2 flex items-center gap-2 text-xs text-amber-700">
              <div className="h-1.5 w-1.5 rounded-full bg-amber-600" />
              <span className="font-normal">Offline — will sync when connected</span>
            </div>
          )}

          {/* Input container - premium & integrated */}
          <div className="flex items-end gap-2 rounded-lg bg-white border border-gray-200 px-4 py-2.5 transition-all duration-200 hover:border-gray-300 focus-within:border-gray-400 focus-within:ring-1 focus-within:ring-gray-200">
            {/* Text input */}
            <input
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey && !isSending) {
                  e.preventDefault();
                  onSubmit();
                }
              }}
              className="flex-1 bg-transparent text-sm font-normal text-gray-900 outline-none placeholder:text-gray-400 placeholder:font-normal disabled:opacity-50"
              placeholder="What would you like to know?"
              disabled={isSending}
              aria-label="Ask a question"
            />

            {/* Send button - elegant and minimal */}
            <button
              onClick={onSubmit}
              disabled={isSending || !value.trim()}
              className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded transition-colors duration-200 disabled:text-gray-300 enabled:hover:bg-gray-100 enabled:text-gray-700"
              aria-label="Send message"
            >
              {isSending ? (
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-gray-400 border-t-gray-700" />
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