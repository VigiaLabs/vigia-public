import { ChatHeader } from '@/components/chat/header';
import { ChatShell } from '@/components/chat/chat-shell';

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col">
      <ChatHeader />
      <ChatShell />
    </div>
  );
}
