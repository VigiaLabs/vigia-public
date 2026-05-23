'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Loader2 } from 'lucide-react';

type Props = { steps: string[] };

export function LivePipeline({ steps }: Props) {
  if (!steps.length) return null;

  const lastIdx = steps.length - 1;

  return (
    <div className="mb-3 flex items-center gap-2 text-xs text-text-muted">
      <AnimatePresence mode="wait">
        {steps.map((step, i) => (
          <motion.span
            key={step}
            className="inline-flex items-center gap-1"
            initial={{ opacity: 0, x: -4 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            {i < lastIdx ? (
              <CheckCircle2 className="h-3 w-3 text-emerald-500" strokeWidth={2.5} />
            ) : (
              <Loader2 className="h-3 w-3 animate-spin text-text-muted" strokeWidth={2.5} />
            )}
            <span className={i < lastIdx ? 'text-text-muted/60' : 'text-text-secondary'}>
              {step}
            </span>
            {i < lastIdx && <span className="mx-1 text-border">→</span>}
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );
}
