import type { UIMessage } from 'ai';
import { extractMessageText } from '@/lib/voice/extract-message-text';

/** Collect plain text from a UIMessage's text parts. */
export function getMessageText(message: UIMessage): string {
  return extractMessageText(message);
}
