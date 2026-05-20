'use server';

import { createStreamableUI, createStreamableValue } from '@ai-sdk/rsc';
import { PayloadSchema } from '@/lib/agents/state';
import { runPipeline } from '@/lib/agents/graph';
import { extractUIPayload } from '@/lib/agents/ui-hook';
import { RetryAlert } from '@/components/vigia-widgets';
import { TabbedResults } from '@/components/chat/tabbed-results';

export async function submitAuditRequest(rawPayload: unknown) {
  const parsed = PayloadSchema.safeParse(rawPayload);

  if (!parsed.success) {
    throw new Error(
      `Invalid payload: ${parsed.error.issues.map((i) => i.message).join(', ')}`
    );
  }

  const stream = createStreamableUI(
    <div className="flex items-center gap-2 text-sm text-text-muted animate-pulse">
      <div className="h-2 w-2 rounded-full bg-text-muted animate-ping" />
      Analyzing...
    </div>
  );

  // Streamable value to pass the audit finding text back to the client for persistence
  const textStream = createStreamableValue<string>('');

  (async () => {
    try {
      const finalState = await runPipeline(parsed.data);

      // Conversational bypass
      if (finalState.pipelineStatus === 'complete' && finalState.activeAgents.length === 0) {
        const reply = finalState.auditFinding ?? '';
        textStream.done(reply);
        stream.done(<div className="shell-bubble-assistant whitespace-pre-wrap">{reply}</div>);
        return;
      }

      const uiPayload = extractUIPayload(finalState);
      textStream.done(uiPayload.auditFinding);

      if (finalState.retryCount > 0) {
        stream.update(<RetryAlert />);
        await new Promise((r) => setTimeout(r, 1500));
      }

      stream.done(
        <TabbedResults
          auditFinding={uiPayload.auditFinding}
          contradictionVerified={uiPayload.contradictionVerified}
          evidenceImages={uiPayload.evidenceImages}
          budgetData={uiPayload.budgetData}
          spatialMarkers={uiPayload.spatialMarkers}
          totalLatencyMs={uiPayload.totalLatencyMs}
          nodeCount={uiPayload.debugTrace.length}
        />
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Pipeline execution failed';
      textStream.done(`Error: ${message}`);
      stream.error(new Error(message));
    }
  })();

  return { ui: stream.value, text: textStream.value };
}
