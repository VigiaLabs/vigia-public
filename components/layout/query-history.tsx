'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePathname } from 'next/navigation';
import { MessageSquareText, Trash2 } from 'lucide-react';
import { getThreads, deleteThread, type Thread } from '@/lib/db';
import { cn } from '@/lib/utils';

type Props = {
  onSelect?: (threadId: string) => void;
  query?: string;
};

type ThreadGroup = {
  label: string;
  items: Thread[];
};

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function groupThreads(threads: Thread[]): ThreadGroup[] {
  const today = startOfDay(new Date());
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);

  const groups: Record<string, Thread[]> = {
    Today: [],
    Yesterday: [],
    'Previous 7 days': [],
    Older: [],
  };

  for (const thread of threads) {
    const date = startOfDay(new Date(thread.updatedAt));
    if (date.getTime() === today.getTime()) {
      groups.Today.push(thread);
    } else if (date.getTime() === yesterday.getTime()) {
      groups.Yesterday.push(thread);
    } else if (date >= weekAgo) {
      groups['Previous 7 days'].push(thread);
    } else {
      groups.Older.push(thread);
    }
  }

  return Object.entries(groups)
    .filter(([, items]) => items.length > 0)
    .map(([label, items]) => ({ label, items }));
}

export function QueryHistory({ onSelect, query = '' }: Props) {
  const pathname = usePathname();
  const [items, setItems] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);

  const activeThreadId = pathname.startsWith('/t/') ? pathname.split('/t/')[1] : null;

  const refresh = useCallback(async () => {
    const threads = await getThreads(30);
    setItems(threads);
    setLoading(false);
  }, []);

  useEffect(() => {
    let mounted = true;
    getThreads(30).then((threads) => {
      if (mounted) {
        setItems(threads);
        setLoading(false);
      }
    });

    const onThreadsUpdated = () => {
      void getThreads(30).then((threads) => {
        if (mounted) setItems(threads);
      });
    };
    window.addEventListener('vigia:threads-updated', onThreadsUpdated);

    const interval = setInterval(() => {
      getThreads(30).then((threads) => {
        if (mounted) setItems(threads);
      });
    }, 3000);

    return () => {
      mounted = false;
      clearInterval(interval);
      window.removeEventListener('vigia:threads-updated', onThreadsUpdated);
    };
  }, [refresh]);

  const groups = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = normalizedQuery
      ? items.filter((thread) => thread.title.toLowerCase().includes(normalizedQuery))
      : items;
    return groupThreads(filtered);
  }, [items, query]);

  async function handleDelete(e: React.MouseEvent, threadId: string) {
    e.stopPropagation();
    await deleteThread(threadId);
    setItems((prev) => prev.filter((thread) => thread.id !== threadId));
    if (pathname === `/t/${threadId}`) {
      window.location.href = '/';
    }
  }

  if (loading) {
    return (
      <div className="space-y-3 px-1">
        {[1, 2, 3, 4].map((index) => (
          <div key={index} className="space-y-2">
            <div className="h-2.5 w-16 rounded-full bg-black/[0.06] animate-pulse" />
            <div className="h-10 rounded-xl bg-black/[0.04] animate-pulse" />
            <div className="h-10 rounded-xl bg-black/[0.04] animate-pulse" />
          </div>
        ))}
      </div>
    );
  }

  if (!items.length) {
    return (
      <div className="mx-1 rounded-2xl border border-dashed border-border/80 bg-white/50 px-4 py-8 text-center">
        <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-[#f4f4f5]">
          <MessageSquareText className="h-4 w-4 text-text-muted" strokeWidth={1.75} />
        </div>
        <p className="text-sm font-medium text-text-primary">No conversations yet</p>
        <p className="mt-1 text-xs leading-relaxed text-text-muted">
          Start a new thread to explore infrastructure records.
        </p>
      </div>
    );
  }

  if (!groups.length) {
    return (
      <div className="mx-1 rounded-2xl border border-dashed border-border/80 bg-white/50 px-4 py-6 text-center">
        <p className="text-sm font-medium text-text-primary">No chats found</p>
        <p className="mt-1 text-xs text-text-muted">Try a different search term.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-2">
      {groups.map((group) => (
        <section key={group.label}>
          <h3 className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
            {group.label}
          </h3>
          <div className="space-y-0.5">
            {group.items.map((item) => {
              const isActive = activeThreadId === item.id;

              return (
                <div
                  key={item.id}
                  className={cn(
                    'group relative flex items-center rounded-xl transition-colors duration-150',
                    isActive ? 'bg-black/[0.06]' : 'hover:bg-black/[0.04]'
                  )}
                >
                  <button
                    type="button"
                    onClick={() => onSelect?.(item.id)}
                    className="flex min-w-0 flex-1 px-2.5 py-2.5 text-left"
                  >
                    <span
                      className={cn(
                        'line-clamp-2 text-[13px] leading-snug',
                        isActive ? 'font-medium text-text-primary' : 'font-normal text-text-secondary'
                      )}
                    >
                      {item.title}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={(event) => handleDelete(event, item.id)}
                    aria-label="Delete thread"
                    className={cn(
                      'mr-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-text-muted opacity-0 transition-all duration-150 hover:bg-red-50 hover:text-red-500',
                      'group-hover:opacity-100 focus-visible:opacity-100',
                      isActive && 'opacity-100 md:opacity-0 md:group-hover:opacity-100'
                    )}
                  >
                    <Trash2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
