'use client';

import { motion } from 'framer-motion';
import { VoiceVisualizer } from '@/components/chat/voice-visualizer';

export type VoiceSessionPhase =
  | 'listening'
  | 'transcribing'
  | 'thinking'
  | 'speaking';

const PHASE_LABEL: Record<VoiceSessionPhase, string> = {
  listening: 'Listening',
  transcribing: 'Transcribing',
  thinking: 'Working on your question',
  speaking: 'Speaking',
};

type Props = {
  phase: VoiceSessionPhase;
  onStopSpeaking?: () => void;
};

export function VoiceSessionBar({ phase, onStopSpeaking }: Props) {
  const isSpeaking = phase === 'speaking';

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.25, 0.1, 0.25, 1] }}
      className="mb-3 flex justify-center"
    >
      <div className="flex items-center gap-2.5 rounded-full border border-border/70 bg-white/90 px-4 py-2 shadow-[0_1px_8px_rgba(0,0,0,0.04)] backdrop-blur-sm">
        {isSpeaking ? (
          <VoiceVisualizer onClick={onStopSpeaking ?? (() => {})} />
        ) : (
          <span className="shell-speaking-indicator" aria-hidden />
        )}
        <span className="text-[12px] font-medium text-text-secondary">
          {PHASE_LABEL[phase]}
        </span>
      </div>
    </motion.div>
  );
}
