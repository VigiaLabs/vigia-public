'use client';

import { useRouter } from 'next/navigation';
import { Plus, Search } from 'lucide-react';
import { QueryHistory } from './query-history';

export function SidebarContent() {
  const router = useRouter();

  return (
    <>
      <div className="mb-8">
        <div className="flex items-center gap-2 text-text-primary">
          <div className="text-sm font-bold">VIGIA</div>
          <div className="text-sm font-normal text-text-muted">SEARCH</div>
        </div>
      </div>

      <button
        type="button"
        onClick={() => {
          router.push('/');
        }}
        className="mb-6 flex w-full items-center justify-center gap-2 rounded-full bg-[#111111] px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-[#1b1b1b] active:bg-[#222222] active:animate-button-bounce"
      >
        <Plus className="h-4 w-4" />
        New thread
      </button>

      <div className="flex-1 flex flex-col min-h-0">
        <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
          <Search className="h-3.5 w-3.5" />
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

      <div className="mt-auto pt-6 space-y-2 text-sm">
        <div className="text-text-primary">Citizen User</div>
        <div className="text-xs text-text-muted">Government access</div>
      </div>
    </>
  );
}

export function Sidebar() {
  return (
    <aside className="fixed left-0 top-0 hidden h-screen w-[260px] border-r border-border bg-sidebar-bg px-4 py-6 md:flex md:flex-col">
      <SidebarContent />
    </aside>
  );
}