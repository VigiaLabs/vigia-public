'use client';

import { Sparkles, Globe, Image } from 'lucide-react';
import { useState } from 'react';

const tabs = [
  { label: 'Answer', icon: Sparkles },
  { label: 'Links', icon: Globe },
  { label: 'Images', icon: Image },
] as const;

export function ChatHeader() {
  const [active, setActive] = useState(0);

  return (
    <header className="sticky top-0 z-20 border-b border-border/70 bg-cream/85 backdrop-blur-xl">
      <div className="mx-auto max-w-[900px] px-4 py-2.5 md:px-6">
        <div className="flex items-center justify-between">
          <nav className="flex items-center gap-1">
            {tabs.map((tab, i) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.label}
                  onClick={() => setActive(i)}
                  className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                    active === i
                      ? 'text-text-primary'
                      : 'text-text-muted hover:text-text-secondary'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
          <button className="rounded-full bg-text-primary px-4 py-1.5 text-xs font-semibold text-white">
            Share
          </button>
        </div>
      </div>
    </header>
  );
}
