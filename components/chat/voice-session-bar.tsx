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
  thinking: 'Generating response',
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
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      className="mb-3 flex justify-center"
    >
        <div className="shell-card flex items-center gap-3 rounded-full border border-[#ebe4d8] bg-white/95 px-4 py-2 shadow-[0_4px_24px_rgba(17,17,17,0.06)] backdrop-blur-sm">
          {isSpeaking ? (
            <VoiceVisualizer onClick={onStopSpeaking ?? (() => {})} />
          ) : (
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#111111]/20" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#111111]" />
            </span>
          )}
          <span className="text-xs font-medium tracking-wide text-text-secondary">
            {PHASE_LABEL[phase]}
          </span>
        </div>
    </motion.div>
  );
}
