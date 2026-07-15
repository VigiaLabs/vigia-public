'use client';

import { ArrowUpRight, Mail, Phone, Send } from 'lucide-react';

type PendingAction = {
  type: string;
  coordinates?: { lat: number; lng: number };
  visionFindings: string[];
  suggestedActions: string[];
  authority?: {
    name: string;
    designation: string;
    officerName?: string;
    phone?: string;
    email?: string;
    portal?: string;
    sourceUrl: string;
    jurisdictionNote: string;
  };
  complaintDraft?: { subject: string; body: string };
};

type Props = {
  action: PendingAction;
  onSelectAction?: (action: string) => void;
};

export function PendingActionCard({ action, onSelectAction }: Props) {
  const mailto = action.authority?.email && action.complaintDraft
    ? `mailto:${action.authority.email}?subject=${encodeURIComponent(action.complaintDraft.subject)}&body=${encodeURIComponent(action.complaintDraft.body)}`
    : null;

  return (
    <div className="rounded-xl border border-amber-200/80 bg-amber-50/50 px-4 py-3 space-y-2">
      <p className="text-xs font-medium text-amber-700">
        {action.authority ? 'Contact the verified authority' : 'Suggested actions for this citizen report'}
      </p>
      <div className="flex flex-wrap gap-2">
        {mailto && (
          <a
            href={mailto}
            className="inline-flex items-center gap-1.5 rounded-lg bg-amber-700 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-amber-800"
          >
            <Send className="h-3 w-3" strokeWidth={2} />
            Send alert to authority
          </a>
        )}
        {action.authority?.phone && (
          <a
            href={`tel:${action.authority.phone.replace(/[^+\d]/g, '')}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100"
          >
            <Phone className="h-3 w-3" strokeWidth={2} />
            Contact authority
          </a>
        )}
        {action.authority?.portal && (
          <a
            href={action.authority.portal}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100"
          >
            <Mail className="h-3 w-3" strokeWidth={2} />
            Open official complaint portal
          </a>
        )}
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
