'use client';

import { VigiaLogo } from '@/components/brand/vigia-logo';
import { useSidebar } from '@/lib/context/sidebar-context';
import { cn } from '@/lib/utils';

type Props = {
  className?: string;
};

export function SidebarTrigger({ className }: Props) {
  const { isOpen, open } = useSidebar();

  if (isOpen) return null;

  return (
    <button
      type="button"
      onClick={open}
      aria-label="Open sidebar"
      className={cn(
        'group flex items-center justify-center rounded-xl p-0.5 transition-all duration-200 hover:scale-[1.03] active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-black/15',
        className
      )}
    >
      <VigiaLogo
        size="sm"
        className="transition-shadow duration-200 group-hover:shadow-[0_4px_16px_rgba(0,0,0,0.22)]"
      />
    </button>
  );
}
