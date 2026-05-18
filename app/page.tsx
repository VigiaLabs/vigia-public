import { ChatHeader } from '@/components/chat/header';
import { ChatShell } from '@/components/chat/chat-shell';
import { MapView } from '@/components/ui/map-view';

export default function Home() {
  return (
    <div className="flex min-h-screen">
      <div className="flex flex-1 flex-col lg:w-[60%]">
        <ChatHeader />
        <ChatShell />
      </div>

      <MapView />
    </div>
  );
}