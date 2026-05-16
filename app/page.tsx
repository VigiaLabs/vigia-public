import { ChatHeader } from "@/components/chat/header";
import { MessageFeed } from "@/components/chat/message-feed";
import { InputBar } from "@/components/chat/input-bar";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <ChatHeader />
      <div className="flex-1 pb-24">
        <MessageFeed />
      </div>
      <InputBar />
    </div>
  );
}
