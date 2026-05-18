'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { QueryHistory } from './query-history';
import { getQueueStats } from '@/lib/db/offline-store';
import { useOnlineStatus } from '@/lib/db/use-online-status';

type QueueStats = {
  pending: number;
  synced: number;
  failed: number;
};

const EMPTY_STATS: QueueStats = { pending: 0, synced: 0, failed: 0 };

export function SidebarContent() {
  const router = useRouter();
  const isOnline = useOnlineStatus();

  const [stats, setStats] = useState<QueueStats>(EMPTY_STATS);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const statusLabel = useMemo(() => {
    if (!isOnline) return 'Offline';
    if (isRefreshing) return 'Syncing';
    return 'Online';
  }, [isOnline, isRefreshing]);

  const statusHint = useMemo(() => {
    if (!isOnline) return 'Saved locally';
    if (isRefreshing) return 'Sync in progress';
    return 'Up to date';
  }, [isOnline, isRefreshing]);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        setIsRefreshing(true);
        const next = await getQueueStats();
        if (cancelled) return;
        setStats(next);
      } finally {
        if (!cancelled) setIsRefreshing(false);
      }
    }

    void refresh();

    function handleVisibility() {
      if (document.visibilityState === 'visible') void refresh();
    }

    window.addEventListener('online', refresh);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      cancelled = true;
      window.removeEventListener('online', refresh);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, []);

  return (
    <>
      <div className="mb-6">
        <div className="text-2xl font-semibold tracking-tight text-text-primary">
          VIGIA <span className="text-text-secondary">Search</span>
        </div>

        <div className="mt-3 flex items-center justify-between rounded-xl border border-border bg-surface/40 px-3 py-2">
          <div className="flex flex-col">
            <div className="text-xs font-medium uppercase tracking-[0.16em] text-text-muted">
              {statusLabel}
            </div>
            <div className="text-[11px] text-text-secondary">{statusHint}</div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-text-secondary">
            <span className="rounded-full bg-black/5 px-2 py-0.5">
              Pending {stats.pending}
            </span>
            <span className="rounded-full bg-black/5 px-2 py-0.5">
              Failed {stats.failed}
            </span>
            <span className="rounded-full bg-black/5 px-2 py-0.5">
              Synced {stats.synced}
            </span>
          </div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => router.push('/')}
        className="mb-8 flex items-center gap-2 rounded-xl px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-black/5 hover:text-text-primary"
      >
        <Plus className="h-4 w-4" />
        New Thread
      </button>

      <div className="mb-3 text-xs font-medium uppercase tracking-[0.18em] text-text-muted">
        History
      </div>

      <div className="flex-1 overflow-y-auto pr-1">
        <QueryHistory
          onSelect={(threadId) => {
            router.push(`/t/${threadId}`);
          }}
        />
      </div>

      <div className="mt-auto pt-6 text-sm text-text-secondary">
        Citizen User
      </div>
    </>
  );
}

export function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 hidden h-screen w-[260px] border-r border-border bg-sidebar-bg px-5 py-6 md:flex md:flex-col">
      <SidebarContent />
    </aside>
  );
}