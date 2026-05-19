'use client';

import { useEffect, useState } from 'react';
import { getThreads, getThreadMessages } from '@/lib/db/offline-store';

type ThreadRow = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
};

type Props = {
  onSelect?: (threadId: string) => void;
};

function formatDate(ts: number) {
  try {
    const date = new Date(ts);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    }
    if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    }

    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: '2-digit',
      year: date.getFullYear() !== today.getFullYear() ? '2-digit' : undefined,
    });
  } catch {
    return '';
  }
}

export function QueryHistory({ onSelect }: Props) {
  const [items, setItems] = useState<ThreadRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const threads = await getThreads(20);
        if (!mounted) return;

        // Fetch message counts for each thread
        const itemsWithCounts = await Promise.all(
          threads.map(async (t) => {
            const messages = await getThreadMessages(t.id);
            return {
              id: t.id,
              title: t.title,
              createdAt: t.createdAt,
              updatedAt: t.updatedAt,
              messageCount: messages.length,
            };
          })
        );

        if (!mounted) return;
        setItems(itemsWithCounts);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    void load();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="h-10 rounded-md bg-gradient-to-r from-gray-200 to-gray-100 animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="py-4 text-center">
        <div className="text-xs text-text-muted">No searches</div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect?.(item.id)}
          className="group w-full px-2.5 py-1.5 text-left transition-colors hover:bg-gray-900/5 rounded-sm text-sm"
        >
          <div className="line-clamp-1 text-text-primary font-normal">
            {item.title}
          </div>
          {item.messageCount > 0 && (
            <div className="text-xs text-text-muted mt-0.5 line-clamp-1">
              {formatDate(item.createdAt)}
            </div>
          )}
        </button>
      ))}
    </div>
  );
}