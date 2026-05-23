'use client';

import { useState } from 'react';
import { Share2, Copy, RefreshCw, ThumbsUp, ThumbsDown } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  text: string;
  onRegenerate?: () => void;
};

function ActionButton({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-lg text-[#a1a1aa] transition-colors hover:bg-black/[0.04] hover:text-text-primary',
        active && 'text-text-primary'
      )}
    >
      {children}
    </button>
  );
}

export function MessageActionBar({ text, onRegenerate }: Props) {
  const [copied, setCopied] = useState(false);
  const [vote, setVote] = useState<'up' | 'down' | null>(null);

  async function handleCopy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleShare() {
    if (navigator.share) {
      navigator.share({ text }).catch(() => {});
    } else {
      void handleCopy();
    }
  }

  return (
    <div className="flex items-center gap-0.5">
      <ActionButton label="Share" onClick={handleShare}>
        <Share2 className="h-3.5 w-3.5" strokeWidth={1.75} />
      </ActionButton>
      <ActionButton label={copied ? 'Copied!' : 'Copy'} onClick={handleCopy} active={copied}>
        <Copy className="h-3.5 w-3.5" strokeWidth={1.75} />
      </ActionButton>
      {onRegenerate && (
        <ActionButton label="Regenerate" onClick={onRegenerate}>
          <RefreshCw className="h-3.5 w-3.5" strokeWidth={1.75} />
        </ActionButton>
      )}
      <div className="mx-1 h-4 w-px bg-border/60" />
      <ActionButton
        label="Helpful"
        onClick={() => setVote(vote === 'up' ? null : 'up')}
        active={vote === 'up'}
      >
        <ThumbsUp className="h-3.5 w-3.5" strokeWidth={1.75} />
      </ActionButton>
      <ActionButton
        label="Not helpful"
        onClick={() => setVote(vote === 'down' ? null : 'down')}
        active={vote === 'down'}
      >
        <ThumbsDown className="h-3.5 w-3.5" strokeWidth={1.75} />
      </ActionButton>
    </div>
  );
}
