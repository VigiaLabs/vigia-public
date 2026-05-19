import { ChatHeader } from '@/components/chat/header';
import { ChatShell } from '@/components/chat/chat-shell';
import { MapView } from '@/components/ui/map-view';

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;

  return (
    <div className="flex min-h-screen">
      <div className="flex flex-1 flex-col lg:w-[60%]">
        <ChatHeader />
        <ChatShell selectedThreadId={threadId} />
      </div>

      <MapView />
    </div>
  );
}