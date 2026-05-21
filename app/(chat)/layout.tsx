'use client';

import { useParams } from 'next/navigation';
import { ChatHeader } from '@/components/chat/header';
import { ChatShell } from '@/components/chat/chat-shell';

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const threadId =
    typeof params?.threadId === 'string' ? params.threadId : undefined;

  return (
    <div className="flex min-h-screen flex-col">
      <ChatHeader />
      <ChatShell threadId={threadId} />
      {children}
    </div>
  );
}
