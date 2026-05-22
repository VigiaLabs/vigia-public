type MessageLike = {
  role: string;
  parts?: Array<{ type: string; text?: string }>;
  content?: unknown;
};

function textFromParts(parts: Array<{ type: string; text?: string }>): string {
  return parts
    .filter(
      (part): part is { type: 'text' | 'reasoning'; text: string } =>
        (part.type === 'text' || part.type === 'reasoning') && typeof part.text === 'string'
    )
    .map((part) => part.text)
    .join(' ')
    .trim();
}

/** Extract plain text from a chat message (UIMessage or persisted record shape). */
export function extractMessageText(message: MessageLike | undefined): string {
  if (!message) return '';

  if (Array.isArray(message.parts) && message.parts.length > 0) {
    const fromParts = textFromParts(message.parts);
    if (fromParts) return fromParts;
  }

  if (typeof message.content === 'string') {
    return message.content.trim();
  }

  return '';
}

/** Extract plain text from the last user message in a chat history. */
export function getLastUserMessageText(messages: MessageLike[]): string {
  const lastUserMsg = [...messages].reverse().find((message) => message.role === 'user');
  return extractMessageText(lastUserMsg);
}
