'use client';

import { motion } from 'framer-motion';

type Props = {
  label?: string;
};

/** Minimal inline status — kept for optional use outside the answer body. */
export function StreamingBadge({ label = 'Drafting' }: Props) {
  return (
    <motion.span
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
      className="shell-streaming-badge"
    >
      {label}
    </motion.span>
  );
}
