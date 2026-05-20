'use client';

import { useCallback, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Clock3, Trash2 } from 'lucide-react';
import { getThreads, deleteThread, type Thread } from '@/lib/db';

type Props = {
  onSelect?: (threadId: string) => void;
};

function formatDate(ts: number) {
  const date = new Date(ts);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'Today';
  if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return date.toLocaleDateString(undefined, { month: 'short', day: '2-digit' });
}

export function QueryHistory({ onSelect }: Props) {
  const pathname = usePathname();
  const [items, setItems] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const threads = await getThreads(20);
    setItems(threads);
    setLoading(false);
  }, []);

  useEffect(() => {
    let mounted = true;
    getThreads(20).then((threads) => { if (mounted) { setItems(threads); setLoading(false); } });
    const interval = setInterval(() => {
      getThreads(20).then((threads) => { if (mounted) setItems(threads); });
    }, 3000);
    return () => { mounted = false; clearInterval(interval); };
  }, [refresh]);

  async function handleDelete(e: React.MouseEvent, threadId: string) {
    e.stopPropagation();
    await deleteThread(threadId);
    setItems((prev) => prev.filter((t) => t.id !== threadId));
    // If we're viewing the deleted thread, go home
    if (pathname === `/t/${threadId}`) {
      window.location.href = '/';
    }
  }

  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-11 rounded-2xl border border-border bg-white/70 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="py-4 text-center text-xs text-text-muted">
        No searches yet
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {items.map((item) => (
        <div
          key={item.id}
          className="group flex items-center rounded-2xl border border-transparent transition-colors hover:border-border hover:bg-white/75"
        >
          <button
            type="button"
            onClick={() => onSelect?.(item.id)}
            className="flex-1 min-w-0 px-3 py-2 text-left text-sm"
          >
            <div className="line-clamp-1 text-text-primary font-normal">{item.title}</div>
            <div className="mt-0.5 flex items-center gap-1 text-xs text-text-muted">
              <Clock3 className="h-3 w-3" />
              {formatDate(item.updatedAt)}
            </div>
          </button>
          <button
            onClick={(e) => handleDelete(e, item.id)}
            className="mr-2 hidden h-7 w-7 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-[#f4ece8] hover:text-red-500 group-hover:flex"
            aria-label="Delete thread"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      ))}
    </div>
  );
}
