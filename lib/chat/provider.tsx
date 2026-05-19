'use client';

/**
 * Chat provider - stub for future AI SDK RSC integration
 *
 * TODO: When integrating Vercel AI SDK:
 * 1. Install: npm install ai @ai-sdk/openai
 * 2. Import useChat from @ai-sdk/rsc
 * 3. Implement ChatContext to manage:
 *    - messages (from AI SDK)
 *    - isLoading (from AI SDK)
 *    - syncStatus ('pending' | 'synced' | 'failed' | 'offline')
 * 4. On mount: load messages from IndexedDB via loadThread()
 * 5. On append: mark as pending, persist to IndexedDB, then call AI SDK
 * 6. On response: persist to IndexedDB, mark as synced
 *
 * See CONTRIBUTING.md section 8 for complete implementation guide.
 * Key principle: IndexedDB is source of truth; AI SDK state is transient.
 */

export function ChatProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}