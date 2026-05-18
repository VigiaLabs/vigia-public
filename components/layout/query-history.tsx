'use client';

import { useEffect, useState } from 'react';
import { getThreads } from '@/lib/db/offline-store';

type ThreadRow = {
  id: string;
  title: string;
  updatedAt: number;
};

type Props = {
  onSelect?: (threadId: string) => void;
};

function formatTime(ts: number) {
  try {
    return new Date(ts).toLocaleDateString(undefined, {
      month: 'short',
      day: '2-digit',
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

        setItems(
          threads.map((t) => ({
            id: t.id,
            title: t.title,
            updatedAt: t.updatedAt,
          }))
        );
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
    return <p className="text-sm text-text-muted">Loading history...</p>;
  }

  if (!items.length) {
    return <p className="text-sm text-text-muted">No saved history yet.</p>;
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onSelect?.(item.id)}
          className="flex w-full items-start justify-between rounded-xl px-3 py-2 text-left transition-colors hover:bg-black/5"
        >
          <span className="mr-3 line-clamp-2 text-sm text-text-primary">
            {item.title}
          </span>
          <span className="shrink-0 text-[11px] text-text-muted">
            {formatTime(item.updatedAt)}
          </span>
        </button>
      ))}
    </div>
  );
}