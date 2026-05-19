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
      {/* Header Section */}
      <div className="mb-8">
        <div className="text-base font-semibold text-text-primary">VIGIA</div>
        <div className="text-xs text-text-muted mt-1">Infrastructure</div>
      </div>

      {/* New Thread Button */}
      <button
        type="button"
        onClick={() => router.push('/')}
        className="w-full mb-6 flex items-center justify-center gap-2 rounded-md bg-gray-900 px-3 py-2 text-sm text-white transition-colors hover:bg-gray-800 active:bg-gray-700"
      >
        <Plus className="h-4 w-4" />
        New
      </button>

      {/* History Section */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="mb-3 text-xs text-text-muted font-normal">
          Recent searches
        </div>
        <div className="flex-1 overflow-y-auto pr-2">
          <QueryHistory
            onSelect={(threadId) => {
              router.push(`/t/${threadId}`);
            }}
          />
        </div>
      </div>

      {/* Footer Section - Account Info */}
      <div className="mt-auto pt-6 space-y-2 text-sm">
        <div className="text-text-primary">Citizen User</div>
        <div className="text-xs text-text-muted">Government Access</div>
      </div>
    </>
  );
}

export function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 hidden h-screen w-[260px] bg-sidebar-bg px-4 py-6 md:flex md:flex-col">
      <SidebarContent />
    </aside>
  );
}