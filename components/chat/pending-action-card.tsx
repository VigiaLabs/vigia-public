'use client';

import { ArrowUpRight } from 'lucide-react';

type PendingAction = {
  type: string;
  coordinates?: { lat: number; lng: number };
  visionFindings: string[];
  suggestedActions: string[];
};

type Props = {
  action: PendingAction;
  onSelectAction?: (action: string) => void;
};

export function PendingActionCard({ action, onSelectAction }: Props) {
  return (
    <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 px-4 py-3 space-y-2">
      <p className="text-xs font-medium text-amber-700">
        Suggested actions for this citizen photo
      </p>
      <div className="flex flex-wrap gap-2">
        {action.suggestedActions.map((label, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onSelectAction?.(label)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100"
          >
            <ArrowUpRight className="h-3 w-3" strokeWidth={2} />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
