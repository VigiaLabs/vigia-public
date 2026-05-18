import type React from 'react';

export interface AIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolName?: string;
  toolCallId?: string;
}

export type AIState = AIMessage[];

export interface UIMessage {
  id: string;
  role: 'user' | 'assistant';
  display: React.ReactNode;
}

export type UIState = UIMessage[];