import { ChatHeader } from '@/components/chat/header';
import { ChatShell } from '@/components/chat/chat-shell';

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;

  return (
    <div className="flex min-h-screen flex-col">
      <ChatHeader />
      <ChatShell threadId={threadId} />
    </div>
  );
}
