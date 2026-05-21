'use client';

import { motion } from 'framer-motion';

type Props = {
  onClick: () => void;
};

const BARS = [
  { color: 'bg-[#4285F4]', delay: 0 },
  { color: 'bg-[#EA4335]', delay: 0.12 },
  { color: 'bg-[#FBBC04]', delay: 0.24 },
  { color: 'bg-[#34A853]', delay: 0.36 },
] as const;

export function VoiceVisualizer({ onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group relative flex h-9 w-[4.5rem] items-center justify-center rounded-full bg-[#f7f3ea] transition-colors hover:bg-[#f0ebe0]"
      title="Stop speaking"
      aria-label="Stop speaking"
    >
      <div className="flex items-end gap-[3px]">
        {BARS.map((bar, i) => (
          <motion.span
            key={i}
            className={`w-[3px] rounded-full ${bar.color}`}
            animate={{ height: ['6px', '18px', '8px', '22px', '6px'] }}
            transition={{
              repeat: Infinity,
              duration: 1.1,
              ease: 'easeInOut',
              delay: bar.delay,
            }}
          />
        ))}
      </div>
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-[#111111]/0 opacity-0 transition-opacity group-hover:bg-[#111111]/5 group-hover:opacity-100">
        <span className="h-2.5 w-2.5 rounded-sm bg-[#111111]/70" aria-hidden />
      </span>
    </button>
  );
}
