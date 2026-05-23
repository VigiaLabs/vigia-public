'use client';

import { motion, AnimatePresence } from 'framer-motion';

type Props = {
  steps: string[];
};

const EASE = [0.25, 0.1, 0.25, 1] as const;

export function LivePipeline({ steps }: Props) {
  const currentStep = steps.length > 0 ? steps[steps.length - 1] : 'Thinking';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35, ease: EASE }}
      className="shell-think-status"
      aria-live="polite"
      aria-busy="true"
    >
      <AnimatePresence mode="wait">
        <motion.span
          key={currentStep}
          initial={{ opacity: 0, filter: 'blur(4px)' }}
          animate={{ opacity: 1, filter: 'blur(0px)' }}
          exit={{ opacity: 0, filter: 'blur(2px)' }}
          transition={{ duration: 0.32, ease: EASE }}
          className="shell-think-status-text"
        >
          {currentStep.replace(/\.\.\.$/, '')}
        </motion.span>
      </AnimatePresence>
      <span className="shell-think-dots" aria-hidden>
        <span />
        <span />
        <span />
      </span>
    </motion.div>
  );
}
