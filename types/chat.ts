export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  syncStatus?: 'pending' | 'synced' | 'failed';
}
