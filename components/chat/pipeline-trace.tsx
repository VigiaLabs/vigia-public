'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

type TraceStep = { node: string; timestamp: number; decision: string };

type Props = {
  steps: TraceStep[];
  totalLatencyMs?: number;
};

const NODE_LABELS: Record<string, string> = {
  router: 'Routed intent',
  ingest: 'Queried knowledge base',
  guardrail: 'Evaluated confidence',
  synthesizer: 'Synthesized response',
  ui_hook: 'Prepared UI payload',
};

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
          Completed {steps.length} step{steps.length !== 1 && 's'}
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
            {steps.map((step, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.16, delay: i * 0.02 }}
                className="flex items-start gap-2 text-[13px] text-text-muted"
              >
                <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                <span>
                  {NODE_LABELS[step.node] ?? step.node}:{' '}
                  <span className="text-text-secondary">{step.decision}</span>
                </span>
              </motion.div>
            ))}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
