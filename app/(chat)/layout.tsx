'use client';

import { useParams } from 'next/navigation';
import { ChatHeader, HeaderTabProvider } from '@/components/chat/header';
import { ChatShell } from '@/components/chat/chat-shell';
import { EvidenceProvider } from '@/components/chat/evidence-context';
import { MapProvider } from '@/lib/context/map-context';
import { OfflineRuntimeProvider } from '@/lib/edge/offline-context';
import { NetworkStatusBanner } from '@/components/offline/network-status-banner';

export default function ChatLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const threadId =
    typeof params?.threadId === 'string' ? params.threadId : undefined;

  return (
    <OfflineRuntimeProvider>
      <EvidenceProvider>
        <HeaderTabProvider>
          <MapProvider>
            <div className="flex min-h-screen flex-col">
              <ChatHeader />
              <NetworkStatusBanner />
              <ChatShell threadId={threadId} />
              {children}
            </div>
          </MapProvider>
        </HeaderTabProvider>
      </EvidenceProvider>
    </OfflineRuntimeProvider>
  );
}
