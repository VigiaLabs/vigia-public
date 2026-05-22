'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

export const SIDEBAR_RAIL_WIDTH = 56;
export const SIDEBAR_EXPANDED_WIDTH = 288;

type SidebarContextValue = {
  isOpen: boolean;
  isSettingsOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
  openSettings: () => void;
  closeSettings: () => void;
  toggleSettings: () => void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

function applySidebarWidth(isOpen: boolean) {
  const isDesktop = window.matchMedia('(min-width: 768px)').matches;
  const width = isDesktop
    ? isOpen
      ? `${SIDEBAR_EXPANDED_WIDTH}px`
      : `${SIDEBAR_RAIL_WIDTH}px`
    : '0px';
  document.documentElement.style.setProperty('--sidebar-width', width);
}

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => {
    setIsOpen(false);
    setIsSettingsOpen(false);
  }, []);
  const toggle = useCallback(() => setIsOpen((value) => !value), []);

  const openSettings = useCallback(() => setIsSettingsOpen(true), []);
  const closeSettings = useCallback(() => setIsSettingsOpen(false), []);
  const toggleSettings = useCallback(() => setIsSettingsOpen((value) => !value), []);

  useEffect(() => {
    applySidebarWidth(isOpen);

    const mediaQuery = window.matchMedia('(min-width: 768px)');
    const onChange = () => applySidebarWidth(isOpen);
    mediaQuery.addEventListener('change', onChange);
    return () => mediaQuery.removeEventListener('change', onChange);
  }, [isOpen]);

  return (
    <SidebarContext.Provider
      value={{
        isOpen,
        isSettingsOpen,
        open,
        close,
        toggle,
        openSettings,
        closeSettings,
        toggleSettings,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error('useSidebar must be used within SidebarProvider');
  }
  return context;
}
