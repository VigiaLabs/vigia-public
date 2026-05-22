'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { PanelLeftClose, Plus, Search, Settings2, X } from 'lucide-react';
import { VigiaLogo } from '@/components/brand/vigia-logo';
import {
  SIDEBAR_EXPANDED_WIDTH,
  SIDEBAR_RAIL_WIDTH,
  useSidebar,
} from '@/lib/context/sidebar-context';
import { cn } from '@/lib/utils';
import { QueryHistory } from './query-history';
import { useNetworkStatus } from '@/lib/hooks/useNetworkStatus';

type SidebarContentProps = {
  onClose?: () => void;
  onNavigate?: () => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  isSearchOpen: boolean;
  onSearchOpenChange: (open: boolean) => void;
};

function RailButton({
  label,
  onClick,
  children,
  className,
  active,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
  className?: string;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'flex h-10 w-10 items-center justify-center rounded-xl text-text-secondary transition-all duration-150 hover:bg-black/[0.05] hover:text-text-primary active:scale-[0.96]',
        active && 'bg-black/[0.06] text-text-primary',
        className
      )}
    >
      {children}
    </button>
  );
}

function UserAvatar({ statusColor }: { statusColor: string }) {
  return (
    <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#ececee] ring-1 ring-border/60">
      <span className="text-[11px] font-semibold text-text-secondary">CU</span>
      <span
        className={cn(
          'absolute bottom-0 right-0 h-2.5 w-2.5 rounded-full ring-2 ring-sidebar-bg',
          statusColor
        )}
      />
    </div>
  );
}

function SidebarRail({
  onExpand,
  onNewThread,
  onOpenSearch,
  onOpenSettings,
  isSettingsOpen,
  isSearchOpen,
}: {
  onExpand: () => void;
  onNewThread: () => void;
  onOpenSearch: () => void;
  onOpenSettings: () => void;
  isSettingsOpen: boolean;
  isSearchOpen: boolean;
}) {
  const network = useNetworkStatus();
  const statusColor =
    network.mode === 'online'
      ? 'bg-emerald-400'
      : network.mode === 'degraded'
        ? 'bg-amber-400'
        : 'bg-red-400';

  return (
    <div className="flex h-full w-[var(--sidebar-rail-width)] flex-col items-center py-3">
      <button
        type="button"
        onClick={onExpand}
        aria-label="Open sidebar"
        title="Open sidebar"
        className="group mb-5 flex items-center justify-center rounded-xl p-0.5 transition-transform duration-200 hover:scale-[1.04] active:scale-[0.96]"
      >
        <VigiaLogo
          size="sm"
          className="transition-shadow duration-200 group-hover:shadow-[0_4px_16px_rgba(0,0,0,0.22)]"
        />
      </button>

      <div className="flex flex-col items-center gap-1">
        <RailButton
          label="New thread"
          onClick={onNewThread}
          className="bg-white shadow-[0_1px_2px_rgba(0,0,0,0.06)] ring-1 ring-border/80 hover:bg-[#fafafa]"
        >
          <Plus className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </RailButton>

        <RailButton
          label="Search chats"
          onClick={onOpenSearch}
          active={isSearchOpen}
        >
          <Search className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </RailButton>
      </div>

      <div className="mt-auto flex flex-col items-center gap-2 pb-1">
        <RailButton label="Settings" onClick={onOpenSettings} active={isSettingsOpen}>
          <Settings2 className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </RailButton>
        <UserAvatar statusColor={statusColor} />
      </div>
    </div>
  );
}

function SidebarActions({
  onNewThread,
  isSearchOpen,
  onSearchOpenChange,
  searchQuery,
  onSearchQueryChange,
}: {
  onNewThread: () => void;
  isSearchOpen: boolean;
  onSearchOpenChange: (open: boolean) => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isSearchOpen) {
      inputRef.current?.focus();
    }
  }, [isSearchOpen]);

  function closeSearch() {
    onSearchOpenChange(false);
    onSearchQueryChange('');
  }

  return (
    <div className="mb-4 overflow-hidden rounded-xl border border-border/70 bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      {isSearchOpen ? (
        <div className="flex items-center gap-2 px-3 py-2">
          <Search className="h-4 w-4 shrink-0 text-text-muted" strokeWidth={1.75} />
          <input
            ref={inputRef}
            type="search"
            value={searchQuery}
            onChange={(event) => onSearchQueryChange(event.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
            className="min-w-0 flex-1 bg-transparent text-sm text-text-primary outline-none placeholder:text-text-muted"
          />
          <button
            type="button"
            onClick={closeSearch}
            aria-label="Close search"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-black/[0.05] hover:text-text-primary"
          >
            <X className="h-3.5 w-3.5" strokeWidth={2} />
          </button>
        </div>
      ) : (
        <div className="flex items-stretch">
          <button
            type="button"
            onClick={onNewThread}
            className="flex min-w-0 flex-1 items-center gap-2 px-3.5 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-black/[0.03]"
          >
            <Plus className="h-4 w-4 shrink-0 text-text-secondary" strokeWidth={1.75} />
            New thread
          </button>
          <div className="w-px bg-border/70" />
          <button
            type="button"
            onClick={() => onSearchOpenChange(true)}
            aria-label="Search chats"
            title="Search chats"
            className="flex w-11 shrink-0 items-center justify-center text-text-secondary transition-colors hover:bg-black/[0.03] hover:text-text-primary"
          >
            <Search className="h-4 w-4" strokeWidth={1.75} />
          </button>
        </div>
      )}
    </div>
  );
}

export function SidebarContent({
  onClose,
  onNavigate,
  searchQuery,
  onSearchQueryChange,
  isSearchOpen,
  onSearchOpenChange,
}: SidebarContentProps) {
  const router = useRouter();
  const network = useNetworkStatus();
  const { isSettingsOpen, toggleSettings } = useSidebar();

  const statusColor =
    network.mode === 'online'
      ? 'bg-emerald-400'
      : network.mode === 'degraded'
        ? 'bg-amber-400'
        : 'bg-red-400';
  const statusLabel =
    network.mode === 'online'
      ? 'Online'
      : network.mode === 'degraded'
        ? 'Slow connection'
        : 'Offline';

  function navigate(path: string) {
    router.push(path);
    onNavigate?.();
  }

  return (
    <div className="flex h-full min-w-0 flex-col px-4 py-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <VigiaLogo size="sm" />
          <div className="min-w-0">
            <div className="text-[15px] font-semibold tracking-tight text-text-primary">Vigia</div>
            <div className="text-[11px] font-medium text-text-muted">Infrastructure search</div>
          </div>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sidebar"
            title="Close sidebar"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-text-muted transition-colors hover:bg-black/[0.05] hover:text-text-primary"
          >
            <PanelLeftClose className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </button>
        )}
      </div>

      <SidebarActions
        onNewThread={() => navigate('/')}
        isSearchOpen={isSearchOpen}
        onSearchOpenChange={onSearchOpenChange}
        searchQuery={searchQuery}
        onSearchQueryChange={onSearchQueryChange}
      />

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="mb-2 px-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
            {isSearchOpen && searchQuery.trim() ? 'Results' : 'Recent'}
          </span>
        </div>
        <div className="sidebar-scroll flex-1 overflow-y-auto pr-1">
          <QueryHistory
            query={searchQuery}
            onSelect={(threadId) => {
              navigate(`/t/${threadId}`);
            }}
          />
        </div>
      </div>

      <div className="mt-auto border-t border-border/70 pt-4">
        <div className="flex items-center gap-2.5 rounded-xl bg-white/70 px-3 py-2.5 ring-1 ring-border/50">
          <UserAvatar statusColor={statusColor} />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-text-primary">Citizen User</div>
            <div className="truncate text-[11px] text-text-muted">{statusLabel} · Government access</div>
          </div>
          <button
            type="button"
            onClick={toggleSettings}
            aria-label="Settings"
            title="Settings"
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-text-muted transition-colors hover:bg-black/[0.05] hover:text-text-primary',
              isSettingsOpen && 'bg-black/[0.06] text-text-primary'
            )}
          >
            <Settings2 className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function Sidebar() {
  const router = useRouter();
  const { isOpen, isSettingsOpen, open, close, closeSettings, toggleSettings } = useSidebar();
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  function handleClose() {
    setIsSearchOpen(false);
    setSearchQuery('');
    close();
  }

  function handleOpenSearch() {
    open();
    setIsSearchOpen(true);
  }

  useEffect(() => {
    if (!isOpen && !isSettingsOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return;
      if (isSettingsOpen) {
        closeSettings();
        return;
      }
      if (isSearchOpen) {
        setIsSearchOpen(false);
        setSearchQuery('');
        return;
      }
      if (isOpen) {
        setIsSearchOpen(false);
        setSearchQuery('');
        close();
      }
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, isSettingsOpen, isSearchOpen, close, closeSettings]);

  return (
    <aside
      style={
        {
          '--sidebar-rail-width': `${SIDEBAR_RAIL_WIDTH}px`,
          width: isOpen ? SIDEBAR_EXPANDED_WIDTH : SIDEBAR_RAIL_WIDTH,
        } as React.CSSProperties
      }
      className={cn(
        'fixed left-0 top-0 z-50 hidden h-screen flex-col overflow-hidden border-r border-border/80 bg-sidebar-bg transition-[width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] md:flex'
      )}
    >
      <div
        className={cn(
          'h-full transition-opacity duration-200',
          isOpen ? 'opacity-100' : 'pointer-events-none absolute opacity-0'
        )}
        style={{ width: SIDEBAR_EXPANDED_WIDTH }}
      >
        <SidebarContent
          onClose={handleClose}
          onNavigate={handleClose}
          searchQuery={searchQuery}
          onSearchQueryChange={setSearchQuery}
          isSearchOpen={isSearchOpen}
          onSearchOpenChange={setIsSearchOpen}
        />
      </div>

      <div
        className={cn(
          'absolute inset-y-0 left-0 transition-opacity duration-200',
          isOpen ? 'pointer-events-none opacity-0' : 'opacity-100'
        )}
        style={{ width: SIDEBAR_RAIL_WIDTH }}
      >
        <SidebarRail
          onExpand={open}
          onNewThread={() => {
            handleClose();
            router.push('/');
          }}
          onOpenSearch={handleOpenSearch}
          onOpenSettings={toggleSettings}
          isSettingsOpen={isSettingsOpen}
          isSearchOpen={isSearchOpen}
        />
      </div>
    </aside>
  );
}
