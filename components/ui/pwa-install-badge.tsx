'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

function useStandaloneDisplayMode() {
  return useSyncExternalStore(
    (onStoreChange) => {
      if (typeof window === 'undefined') return () => {};

      const mediaQuery = window.matchMedia('(display-mode: standalone)');
      mediaQuery.addEventListener('change', onStoreChange);
      return () => mediaQuery.removeEventListener('change', onStoreChange);
    },
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(display-mode: standalone)').matches,
    () => false
  );
}

export function PWAInstallBadge() {
  const isStandalone = useStandaloneDisplayMode();
  const [isInstallable, setIsInstallable] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (isStandalone) {
      return;
    }

    // Listen for beforeinstallprompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsInstallable(true);
    };

    const handleAppInstalled = () => {
      setIsInstallable(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, [isStandalone]);

  const handleInstall = async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();
    await deferredPrompt.userChoice;

    setDeferredPrompt(null);
    setIsInstallable(false);
  };

  if (!isInstallable || isDismissed || isStandalone) {
    return null;
  }

  return (
    <div className="fixed top-4 right-4 z-40 max-w-xs md:right-6 animate-in fade-in slide-in-from-top-2 duration-300">
      <div className="shell-panel overflow-hidden">
        <div className="px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3 flex-1">
              <Download className="mt-0.5 h-5 w-5 flex-shrink-0 text-text-primary" />
              <div className="flex-1">
                <p className="text-sm font-medium text-text-primary">Install VIGIA</p>
                <p className="mt-0.5 text-xs text-text-muted">Launch faster with offline support</p>
              </div>
            </div>
            <button
              onClick={() => setIsDismissed(true)}
              className="flex-shrink-0 rounded-full p-1 hover:bg-[#f3efe8] transition-colors"
              aria-label="Dismiss"
            >
              <X className="h-4 w-4 text-text-muted" />
            </button>
          </div>
        </div>

        <div className="flex gap-2 border-t border-border px-4 py-3">
          <button
            onClick={handleInstall}
            className="flex-1 rounded-full bg-[#111111] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[#1a1a1a]"
          >
            Install
          </button>
          <button
            onClick={() => setIsDismissed(true)}
            className="flex-1 rounded-full border border-border bg-white px-3 py-2 text-xs font-medium text-text-primary transition-colors hover:bg-[#f7f4ee]"
          >
            Later
          </button>
        </div>
      </div>
    </div>
  );
}
