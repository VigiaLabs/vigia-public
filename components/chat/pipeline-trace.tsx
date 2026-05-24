'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, CheckCircle2, Search, Brain, Shield, Layout } from 'lucide-react';
import { cn } from '@/lib/utils';

type TraceStep = { node: string; timestamp: number; decision: string };

type Props = {
  steps: TraceStep[];
  totalLatencyMs?: number;
};

const NODE_CONFIG: Record<string, { label: string; icon: typeof Search }> = {
  router: { label: 'Intent Classification', icon: Brain },
  ingest: { label: 'Evidence Retrieval', icon: Search },
  guardrail: { label: 'Quality Assurance', icon: Shield },
  ui_hook: { label: 'Response Assembly', icon: Layout },
};

function formatDecision(node: string, decision: string): string {
  // Make decisions more human-readable
  if (node === 'router') {
    const match = decision.match(/intent="(\w+)".*agents=\[([^\]]+)\]/);
    if (match) {
      const intentLabels: Record<string, string> = {
        tender_search: 'Contract & Budget Search',
        personnel: 'Personnel Lookup',
        condition: 'Road Condition Check',
        complaint: 'Complaint Routing',
        rti: 'RTI Authority Lookup',
      };
      const agents = match[2].split(', ').map(a => a === 'admin' ? 'Database' : a === 'vision' ? 'Image Analysis' : 'Telemetry').join(' + ');
      return `${intentLabels[match[1]] ?? match[1]} → querying ${agents}`;
    }
  }
  if (node === 'ingest') {
    if (decision.includes('Retry pass')) {
      const queryMatch = decision.match(/query: "([^"]+)"/);
      return `Retry with broadened query: "${queryMatch?.[1]?.slice(0, 60) ?? '...'}"`;
    }
    const countMatch = decision.match(/(\d+) result/);
    const timeMatch = decision.match(/in (\d+)ms/);
    if (countMatch && timeMatch) {
      return `Retrieved ${countMatch[1]} evidence chunk${countMatch[1] !== '1' ? 's' : ''} (${(parseInt(timeMatch[1]) / 1000).toFixed(1)}s)`;
    }
  }
  if (node === 'guardrail') {
    if (decision.includes('Data void')) return `Low confidence detected — triggering query rewrite`;
    if (decision.includes('Contradiction detected')) return `Paper vs ground-truth mismatch — cross-referencing`;
    if (decision.includes('Authority Matrix')) return `Data not indexed — routing to official authority`;
    if (decision.includes('No contradiction')) {
      if (decision.includes('coherence warning')) return `Passed with coherence warnings`;
      return `Evidence verified — high confidence`;
    }
    if (decision.includes('Citizen claim')) return `Citizen claim flagged for official review`;
    if (decision.includes('persists')) return `Discrepancy confirmed after retry — flagged`;
  }
  if (node === 'ui_hook') {
    const match = decision.match(/(\d+) evidence/);
    return `Assembled ${match?.[1] ?? ''} evidence sources for response`;
  }
  return decision.slice(0, 80);
}

export function PipelineTrace({ steps, totalLatencyMs }: Props) {
  const [open, setOpen] = useState(false);

  if (!steps.length) return null;

  const latencyLabel = totalLatencyMs
    ? `${(totalLatencyMs / 1000).toFixed(1)}s`
    : null;

  return (
    <div className="mb-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[13px] text-text-muted transition-colors hover:bg-black/[0.04] hover:text-text-secondary"
      >
        <CheckCircle2 className="h-4 w-4 text-emerald-500" strokeWidth={2} />
        <span>
          {steps.length} reasoning step{steps.length !== 1 && 's'} completed
          {latencyLabel && <span className="ml-1 text-text-muted/70">· {latencyLabel}</span>}
        </span>
        <ChevronDown
          className={cn(
            'h-3 w-3 transition-transform duration-200',
            open && 'rotate-180'
          )}
          strokeWidth={2}
        />
      </button>

      {open && (
        <AnimatePresence initial={false}>
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="mt-1.5 ml-1 border-l border-border/60 pl-4 space-y-1.5"
          >
            {steps.map((step, i) => {
              const config = NODE_CONFIG[step.node];
              const Icon = config?.icon ?? Brain;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -4 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.16, delay: i * 0.03 }}
                  className="flex items-start gap-2 text-[13px] text-text-muted"
                >
                  <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500/70" strokeWidth={1.8} />
                  <span>
                    <span className="font-medium text-text-secondary">
                      {config?.label ?? step.node}
                    </span>
                    {' · '}
                    <span>{formatDecision(step.node, step.decision)}</span>
                  </span>
                </motion.div>
              );
            })}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
