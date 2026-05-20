import { createAI } from '@ai-sdk/rsc';
import { submitAuditRequest } from '@/app/actions';

export type AIState = Array<{
  id: string;
  role: 'user' | 'assistant';
  content: string;
}>;

export type UIState = Array<{
  id: string;
  role: 'user' | 'assistant';
  display: React.ReactNode;
}>;

export const AI = createAI<AIState, UIState>({
  actions: { submitAuditRequest },
  initialAIState: [],
  initialUIState: [],
});
