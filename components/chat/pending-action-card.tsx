'use client';

import { useState } from 'react';
import { Flag } from 'lucide-react';

type PendingAction = {
  type: string;
  coordinates?: { lat: number; lng: number };
  visionFindings: string[];
  suggestedActions: string[];
};

type Props = { action: PendingAction };

export function PendingActionCard({ action }: Props) {
  const [flagged, setFlagged] = useState(false);

  return (
    <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 px-4 py-3 space-y-2">
      <p className="text-xs font-medium text-amber-700">
        Visual anomaly detected from citizen photo
      </p>
      <div className="flex flex-wrap gap-2">
        {action.suggestedActions.map((label, i) => (
          <button
            key={i}
            type="button"
            disabled={flagged}
            onClick={() => setFlagged(true)}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
              flagged
                ? 'border-emerald-200 bg-emerald-50 text-emerald-600 cursor-default'
                : 'border-amber-300 bg-white text-amber-800 hover:bg-amber-100'
            }`}
          >
            <Flag className="h-3 w-3" strokeWidth={2} />
            {flagged ? 'Thank you for your help!' : label}
          </button>
        ))}
      </div>
    </div>
  );
}
