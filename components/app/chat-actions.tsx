'use client';

import { createContext, useContext } from 'react';
import type { Suggestion } from '@/lib/agent/suggest';

export type ChatActions = {
  /** free text → the agent decides */
  sendText: (text: string) => void;
  /** run a tool now (UI action), shown as the user's words, then the agent comments */
  sendAction: (text: string, tool: string, input: Record<string, unknown>, opts?: { auto?: boolean }) => void;
  applySuggestion: (s: Suggestion) => void;
  /** replace a tool part's output in the chat history (e.g. a seller list re-filtered by the ContextBar) */
  updateToolOutput: (toolCallId: string, output: unknown) => void;
  busy: boolean;
};

export const ChatActionsContext = createContext<ChatActions | null>(null);

export function useChatActions(): ChatActions {
  const v = useContext(ChatActionsContext);
  if (!v) throw new Error('useChatActions outside provider');
  return v;
}
