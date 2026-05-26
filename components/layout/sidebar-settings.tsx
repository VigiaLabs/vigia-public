'use client';

import { useEffect, useState } from 'react';
import {
  ArrowLeft,
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
import { useSettings } from '@/lib/context/settings-context';
import {
  clearAllChatData,
  getStorageStats,
  pruneOldThreads,
} from '@/lib/db';
import { getSupportedLanguages } from '@/lib/voice/locale';
import type {
  AppPreferences,
  ResponseStyle,
  RetentionDays,
  SettingsView,
  TextSize,
} from '@/lib/settings/types';
import { cn } from '@/lib/utils';

export const SIDEBAR_SETTINGS_WIDTH = 280;

const settingsSections = [
  {
    title: 'Preferences',
    items: [
      { id: 'general' as const, label: 'General', description: 'Language and defaults', icon: Globe },
      { id: 'appearance' as const, label: 'Appearance', description: 'Display and motion', icon: Palette },
      { id: 'notifications' as const, label: 'Notifications', description: 'Alerts and updates', icon: Bell },
      { id: 'personalization' as const, label: 'Personalization', description: 'Response style', icon: Sparkles },
    ],
  },
  {
    title: 'Account',
    items: [
      { id: 'privacy' as const, label: 'Data & privacy', description: 'Storage and permissions', icon: Shield },
      { id: 'shortcuts' as const, label: 'Keyboard shortcuts', description: 'Quick actions', icon: Keyboard },
      { id: 'help' as const, label: 'Help & feedback', description: 'Support and reports', icon: HelpCircle },
    ],
  },
] as const;

const viewTitles: Record<SettingsView, string> = {
  main: 'Settings',
  general: 'General',
  appearance: 'Appearance',
  notifications: 'Notifications',
  personalization: 'Personalization',
  privacy: 'Data & privacy',
  shortcuts: 'Keyboard shortcuts',
  help: 'Help & feedback',
};

const responseStyleOptions: Array<{ value: ResponseStyle; label: string; description: string }> = [
  { value: 'citizen-friendly', label: 'Citizen-friendly', description: 'Plain language with next steps' },
  { value: 'concise', label: 'Concise', description: 'Short, direct answers' },
  { value: 'detailed', label: 'Detailed', description: 'Thorough explanations' },
];

const retentionOptions: RetentionDays[] = [7, 30, 45, 90];

function SettingsHeader({
  title,
  subtitle,
  onBack,
  onClose,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-between border-b border-border/70 px-4 py-4">
      <div className="flex min-w-0 items-center gap-2">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Back"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-text-muted transition-colors hover:bg-black/[0.05] hover:text-text-primary"
          >
            <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </button>
        )}
        <div className="min-w-0">
          <h2 className="truncate text-[15px] font-semibold tracking-tight text-text-primary">{title}</h2>
          {subtitle && <p className="truncate text-[11px] text-text-muted">{subtitle}</p>}
        </div>
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Close settings"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-text-muted transition-colors hover:bg-black/[0.05] hover:text-text-primary"
      >
        <X className="h-[18px] w-[18px]" strokeWidth={1.75} />
      </button>
    </div>
  );
}

function SettingsRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl px-2.5 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-text-primary">{label}</div>
          {description && <div className="mt-0.5 text-[11px] leading-relaxed text-text-muted">{description}</div>}
        </div>
        <div className="shrink-0">{children}</div>
      </div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full p-0.5',
        'transition-[background-color,transform,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#111111]/15 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
        'active:scale-[0.97]',
        checked ? 'bg-[#111111] shadow-inner' : 'bg-[#e4e4e7]'
      )}
    >
      <span
        aria-hidden
        className={cn(
          'pointer-events-none block h-5 w-5 rounded-full bg-white',
          'shadow-[0_1px_2px_rgba(0,0,0,0.14),0_0_0_1px_rgba(0,0,0,0.04)]',
          'transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform',
          checked ? 'translate-x-5' : 'translate-x-0'
        )}
      />
    </button>
  );
}

function SelectField<T extends string | number>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string }>;
  label: string;
}) {
  return (
    <select
      aria-label={label}
      value={String(value)}
      onChange={(event) => onChange(event.target.value as T)}
      className="max-w-[132px] rounded-lg border border-border/80 bg-white px-2.5 py-1.5 text-xs font-medium text-text-primary outline-none focus:border-[#a1a1aa]"
    >
      {options.map((option) => (
        <option key={String(option.value)} value={String(option.value)}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function OptionList<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (value: T) => void;
  options: Array<{ value: T; label: string; description: string }>;
}) {
  return (
    <div className="space-y-1">
      {options.map((option) => {
        const selected = value === option.value;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              'flex w-full items-start gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors',
              selected ? 'bg-black/[0.05] ring-1 ring-border/70' : 'hover:bg-black/[0.03]'
            )}
          >
            <span
              className={cn(
                'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                selected ? 'border-[#111111] bg-[#111111]' : 'border-border bg-white'
              )}
            >
              {selected && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-medium text-text-primary">{option.label}</span>
              <span className="block text-[11px] text-text-muted">{option.description}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function GeneralSettings({
  preferences,
  updatePreferences,
}: {
  preferences: AppPreferences;
  updatePreferences: (patch: Partial<AppPreferences>) => void;
}) {
  const languages = getSupportedLanguages();

  return (
    <div className="space-y-1">
      <SettingsRow
        label="Auto-detect language"
        description="Match replies to the language in your message"
      >
        <Toggle
          checked={preferences.autoDetectLanguage}
          onChange={(checked) => updatePreferences({ autoDetectLanguage: checked })}
          label="Auto-detect language"
        />
      </SettingsRow>

      <SettingsRow
        label="Default language"
        description={
          preferences.autoDetectLanguage
            ? 'Used when detection is inconclusive'
            : 'Used for all typed and voice queries'
        }
      >
        <SelectField
          label="Default language"
          value={preferences.defaultLanguage}
          onChange={(value) =>
            updatePreferences({
              defaultLanguage: value === 'auto' ? 'auto' : value,
            })
          }
          options={[
            { value: 'auto', label: 'Auto' },
            ...languages.map((language) => ({
              value: language.code,
              label: language.nativeName,
            })),
          ]}
        />
      </SettingsRow>

      <SettingsRow
        label="Speak responses"
        description="Read assistant replies aloud after voice queries"
      >
        <Toggle
          checked={preferences.speakResponses}
          onChange={(checked) => updatePreferences({ speakResponses: checked })}
          label="Speak responses"
        />
      </SettingsRow>
    </div>
  );
}

function AppearanceSettings({
  preferences,
  updatePreferences,
}: {
  preferences: AppPreferences;
  updatePreferences: (patch: Partial<AppPreferences>) => void;
}) {
  return (
    <div className="space-y-1">
      <SettingsRow label="Text size" description="Adjust chat message readability">
        <SelectField
          label="Text size"
          value={preferences.textSize}
          onChange={(value) => updatePreferences({ textSize: value })}
          options={[
            { value: 'comfortable' as TextSize, label: 'Comfortable' },
            { value: 'compact' as TextSize, label: 'Compact' },
          ]}
        />
      </SettingsRow>

      <SettingsRow
        label="Reduce motion"
        description="Minimize animations across the interface"
      >
        <Toggle
          checked={preferences.reduceMotion}
          onChange={(checked) => updatePreferences({ reduceMotion: checked })}
          label="Reduce motion"
        />
      </SettingsRow>
    </div>
  );
}

function NotificationSettings({
  preferences,
  updatePreferences,
}: {
  preferences: AppPreferences;
  updatePreferences: (patch: Partial<AppPreferences>) => void;
}) {
  return (
    <div className="space-y-1">
      <SettingsRow
        label="Offline sync alerts"
        description="Show status when queries are queued or synced"
      >
        <Toggle
          checked={preferences.offlineAlerts}
          onChange={(checked) => updatePreferences({ offlineAlerts: checked })}
          label="Offline sync alerts"
        />
      </SettingsRow>
      <p className="px-2.5 pt-1 text-[11px] leading-relaxed text-text-muted">
        Shows an offline banner above the chat input when you lose connectivity.
      </p>
    </div>
  );
}

function PersonalizationSettings({
  preferences,
  updatePreferences,
}: {
  preferences: AppPreferences;
  updatePreferences: (patch: Partial<AppPreferences>) => void;
}) {
  return (
    <OptionList
      value={preferences.responseStyle}
      onChange={(value) => updatePreferences({ responseStyle: value })}
      options={responseStyleOptions}
    />
  );
}

function PrivacySettings({
  preferences,
  updatePreferences,
}: {
  preferences: AppPreferences;
  updatePreferences: (patch: Partial<AppPreferences>) => void;
}) {
  const [stats, setStats] = useState({ threadCount: 0, messageCount: 0 });
  const [busy, setBusy] = useState<'prune' | 'clear' | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getStorageStats().then((next) => {
      if (!cancelled) setStats(next);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  async function refreshStats() {
    setStats(await getStorageStats());
  }

  async function handlePrune() {
    setBusy('prune');
    setStatus(null);
    try {
      const deleted = await pruneOldThreads(preferences.retentionDays);
      await refreshStats();
      window.dispatchEvent(new Event('vigia:threads-updated'));
      setStatus(deleted ? `Removed ${deleted} old thread${deleted === 1 ? '' : 's'}.` : 'No old threads to remove.');
    } finally {
      setBusy(null);
    }
  }

  async function handleClearAll() {
    if (!window.confirm('Delete all chat history on this device? This cannot be undone.')) return;

    setBusy('clear');
    setStatus(null);
    try {
      await clearAllChatData();
      await refreshStats();
      window.dispatchEvent(new Event('vigia:threads-updated'));
      setStatus('All local chat history was cleared.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-[#f4f4f5] px-3 py-3 ring-1 ring-border/60">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">
          Local storage
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <div>
            <div className="text-lg font-semibold text-text-primary">{stats.threadCount}</div>
            <div className="text-[11px] text-text-muted">Threads</div>
          </div>
          <div>
            <div className="text-lg font-semibold text-text-primary">{stats.messageCount}</div>
            <div className="text-[11px] text-text-muted">Messages</div>
          </div>
        </div>
      </div>

      <SettingsRow
        label="Retention period"
        description="Threads older than this are eligible for cleanup"
      >
        <SelectField
          label="Retention period"
          value={preferences.retentionDays}
          onChange={(value) => updatePreferences({ retentionDays: value })}
          options={retentionOptions.map((days) => ({
            value: days,
            label: `${days} days`,
          }))}
        />
      </SettingsRow>

      <div className="space-y-2 px-1">
        <button
          type="button"
          onClick={() => void handlePrune()}
          disabled={busy !== null}
          className="w-full rounded-xl border border-border/80 bg-white px-3 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-black/[0.03] disabled:opacity-60"
        >
          {busy === 'prune' ? 'Cleaning up…' : 'Remove old threads'}
        </button>
        <button
          type="button"
          onClick={() => void handleClearAll()}
          disabled={busy !== null}
          className="w-full rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-100 disabled:opacity-60"
        >
          {busy === 'clear' ? 'Clearing…' : 'Clear all chat history'}
        </button>
      </div>

      {status && <p className="px-2.5 text-[11px] leading-relaxed text-text-muted">{status}</p>}

      <p className="px-2.5 text-[11px] leading-relaxed text-text-muted">
        Chat history is stored locally in your browser. Queries may still be processed on the server
        when online.
      </p>
    </div>
  );
}

function ShortcutRow({ keys, description }: { keys: string[]; description: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl px-2.5 py-2.5">
      <span className="text-sm text-text-primary">{description}</span>
      <div className="flex shrink-0 items-center gap-1">
        {keys.map((key) => (
          <kbd
            key={key}
            className="rounded-md border border-border/80 bg-white px-2 py-1 text-[10px] font-medium text-text-secondary shadow-sm"
          >
            {key}
          </kbd>
        ))}
      </div>
    </div>
  );
}

function ShortcutsSettings() {
  return (
    <div className="space-y-0.5">
      <ShortcutRow keys={['Enter']} description="Send message" />
      <ShortcutRow keys={['Shift', 'Enter']} description="New line in input" />
      <ShortcutRow keys={['Esc']} description="Close settings, search, or sidebar" />
    </div>
  );
}

function HelpSettings() {
  return (
    <div className="space-y-4 px-1">
      <div className="rounded-xl bg-[#f4f4f5] px-3 py-3 ring-1 ring-border/60">
        <div className="text-sm font-medium text-text-primary">VIGIA Search</div>
        <p className="mt-1 text-[11px] leading-relaxed text-text-muted">
          Infrastructure search for citizens — verify road projects, budgets, contractors, and
          escalation paths using government data sources.
        </p>
      </div>

      <div className="rounded-xl border border-border/80 bg-white px-3 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-text-muted">
          Try asking
        </div>
        <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-text-secondary">
          <li>What is the status of NH-44 near Chennai?</li>
          <li>Who is the contractor for this road project?</li>
          <li>How do I file an RTI for road maintenance?</li>
        </ul>
      </div>

      <a
        href="mailto:feedback@vigia.example?subject=VIGIA%20feedback"
        className="block rounded-xl border border-border/80 bg-white px-3 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-black/[0.03]"
      >
        Send feedback
      </a>
    </div>
  );
}

export function SidebarSettingsPanel() {
  const { isSettingsOpen, closeSettings } = useSidebar();
  const { preferences, updatePreferences } = useSettings();
  const [view, setView] = useState<SettingsView>('main');

  function handleClose() {
    setView('main');
    closeSettings();
  }

  function renderView() {
    switch (view) {
      case 'general':
        return <GeneralSettings preferences={preferences} updatePreferences={updatePreferences} />;
      case 'appearance':
        return <AppearanceSettings preferences={preferences} updatePreferences={updatePreferences} />;
      case 'notifications':
        return (
          <NotificationSettings preferences={preferences} updatePreferences={updatePreferences} />
        );
      case 'personalization':
        return (
          <PersonalizationSettings preferences={preferences} updatePreferences={updatePreferences} />
        );
      case 'privacy':
        return <PrivacySettings preferences={preferences} updatePreferences={updatePreferences} />;
      case 'shortcuts':
        return <ShortcutsSettings />;
      case 'help':
        return <HelpSettings />;
      default:
        return (
          <>
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
                        key={item.id}
                        type="button"
                        onClick={() => setView(item.id)}
                        className="group flex w-full items-center gap-3 rounded-xl px-2.5 py-2.5 text-left transition-colors hover:bg-black/[0.04]"
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
          </>
        );
    }
  }

  return (
    <>
      <div
        aria-hidden={!isSettingsOpen}
        className={cn(
          'fixed inset-0 z-[55] bg-black/10 transition-opacity duration-200',
          isSettingsOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
        )}
        onClick={handleClose}
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
        <SettingsHeader
          title={viewTitles[view]}
          subtitle={view === 'main' ? 'Preferences and account' : undefined}
          onBack={view !== 'main' ? () => setView('main') : undefined}
          onClose={handleClose}
        />

        <div className="sidebar-scroll flex-1 overflow-y-auto px-3 py-3">{renderView()}</div>

        <div className="border-t border-border/70 px-4 py-3">
          <p className="text-center text-[11px] text-text-muted">Vigia Search · v0.1.0</p>
        </div>
      </aside>
    </>
  );
}
