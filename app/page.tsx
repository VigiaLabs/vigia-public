import { ChatHeader } from "@/components/chat/header";
import { MessageFeed } from "@/components/chat/message-feed";
import { InputBar } from "@/components/chat/input-bar";
import { MapPanel } from "@/components/ui/map-view";

export default function Home() {
  return (
    <div className="flex min-h-screen">
      {/* Chat content area — shrinks on desktop when map is active */}
      <div className="flex-1 flex flex-col lg:w-[60%]">
        <ChatHeader />
        <div className="flex-1 pb-24">
          <MessageFeed />
        </div>
        <InputBar />
      </div>
      {/* Desktop map panel */}
      <MapPanel />
    </div>
  );
}
