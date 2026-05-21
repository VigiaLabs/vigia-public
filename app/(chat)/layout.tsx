'use client';

import { useParams } from 'next/navigation';
import { ChatHeader } from '@/components/chat/header';
import { ChatShell } from '@/components/chat/chat-shell';
import { EvidenceProvider } from '@/components/chat/evidence-context';

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const threadId =
    typeof params?.threadId === 'string' ? params.threadId : undefined;

  return (
    <EvidenceProvider>
      <div className="flex min-h-screen flex-col">
        <ChatHeader />
        <ChatShell key={threadId ?? 'new'} threadId={threadId} />
        {children}
      </div>
    </EvidenceProvider>
  );
}
