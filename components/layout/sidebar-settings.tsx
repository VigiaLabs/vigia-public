'use client';

import {
  Bell,
  ChevronRight,
  Globe,
  HelpCircle,
  Keyboard,
  Palette,
  Shield,
  Sparkles,
  X,
} from 'lucide-react';
import { useSidebar } from '@/lib/context/sidebar-context';
import { cn } from '@/lib/utils';

export const SIDEBAR_SETTINGS_WIDTH = 280;

const settingsSections = [
  {
    title: 'Preferences',
    items: [
      { label: 'General', description: 'Language, region, defaults', icon: Globe },
      { label: 'Appearance', description: 'Theme and display', icon: Palette },
      { label: 'Notifications', description: 'Alerts and updates', icon: Bell },
      { label: 'Personalization', description: 'Response style and memory', icon: Sparkles },
    ],
  },
  {
    title: 'Account',
    items: [
      { label: 'Data & privacy', description: 'Storage and permissions', icon: Shield },
      { label: 'Keyboard shortcuts', description: 'Quick actions', icon: Keyboard },
      { label: 'Help & feedback', description: 'Support and reports', icon: HelpCircle },
    ],
  },
] as const;

export function SidebarSettingsPanel() {
  const { isSettingsOpen, closeSettings } = useSidebar();

  return (
    <>
      <div
        aria-hidden={!isSettingsOpen}
        className={cn(
          'fixed inset-0 z-[55] bg-black/10 transition-opacity duration-200',
          isSettingsOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={closeSettings}
      />

      <aside
        aria-hidden={!isSettingsOpen}
        style={{ width: SIDEBAR_SETTINGS_WIDTH }}
        className={cn(
          'fixed top-0 z-[60] flex h-screen flex-col border-border/80 bg-white shadow-[12px_0_40px_rgba(0,0,0,0.08)] transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
          'inset-x-0 w-full max-w-none border-r md:inset-x-auto md:left-[var(--sidebar-width,56px)] md:w-[280px]',
          isSettingsOpen ? 'translate-x-0 opacity-100' : 'pointer-events-none opacity-0 max-md:translate-x-full md:-translate-x-3'
        )}
      >
        <div className="flex items-center justify-between border-b border-border/70 px-4 py-4">
          <div>
            <h2 className="text-[15px] font-semibold tracking-tight text-text-primary">Settings</h2>
            <p className="text-[11px] text-text-muted">Placeholder options</p>
          </div>
          <button
            type="button"
            onClick={closeSettings}
            aria-label="Close settings"
            className="flex h-9 w-9 items-center justify-center rounded-xl text-text-muted transition-colors hover:bg-black/[0.05] hover:text-text-primary"
          >
            <X className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </button>
        </div>

        <div className="sidebar-scroll flex-1 overflow-y-auto px-3 py-3">
          {settingsSections.map((section) => (
            <section key={section.title} className="mb-4">
              <h3 className="mb-1.5 px-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-muted">
                {section.title}
              </h3>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.label}
                      type="button"
                      disabled
                      title="Coming soon"
                      className="group flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-black/[0.04] disabled:cursor-not-allowed"
                    >
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#f4f4f5] text-text-secondary ring-1 ring-border/60">
                        <Icon className="h-4 w-4" strokeWidth={1.75} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-text-primary">{item.label}</span>
                        <span className="block truncate text-[11px] text-text-muted">{item.description}</span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-text-muted/70" strokeWidth={1.75} />
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>

        <div className="border-t border-border/70 px-4 py-3">
          <p className="text-center text-[11px] text-text-muted">Vigia Search · v0.1.0</p>
        </div>
      </aside>
    </>
  );
}
