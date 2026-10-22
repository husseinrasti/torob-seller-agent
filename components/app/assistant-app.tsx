'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Suggestion } from '@/lib/agent/suggest';
import { ChatActionsContext, type ChatActions } from './chat-actions';
import { SessionProvider, useSession } from './session-context';
import { FollowupsProvider } from './followups-store';
import { Header } from './header';
import { ContextBar } from './context-bar';
import { Hero } from './hero';
import { MessageList } from './message-list';
import { Composer } from './composer';
import { SuggestedActions } from './suggested-actions';
import { MapPanel } from './map-panel';

/** Suggestions of the most recent tool output that has any (text-only replies keep the previous chips). */
function lastToolSuggestions(messages: UIMessage[]): Suggestion[] | null {
  for (let m = messages.length - 1, seen = 0; m >= 0 && seen < 4; m--) {
    const msg = messages[m];
    if (msg.role !== 'assistant') continue;
    seen++;
    for (let i = msg.parts.length - 1; i >= 0; i--) {
      const p = msg.parts[i] as { type: string; state?: string; output?: { suggested_actions?: Suggestion[] } };
      if (!p.type.startsWith('tool-') || p.state !== 'output-available') continue;
      if (p.output?.suggested_actions?.length) return p.output.suggested_actions;
      if (p.output?.suggested_actions) return null; // latest tool explicitly has none → session suggestions
    }
  }
  return null;
}

function Shell() {
  const session = useSession();
  const [mapOpen, setMapOpen] = useState(false);
  const transport = useMemo(() => new DefaultChatTransport({ api: '/api/chat' }), []);
  const { messages, sendMessage, status, error, stop, setMessages, clearError } = useChat({
    transport,
    onFinish: () => {
      session.refresh();
    },
  });
  const busy = status === 'submitted' || status === 'streaming';
  const lastCount = useRef(0);

  // bring each new message into view (start of the assistant reply, not the bottom of long lists)
  useEffect(() => {
    if (messages.length === lastCount.current) return;
    lastCount.current = messages.length;
    const last = messages[messages.length - 1];
    if (!last) return;
    requestAnimationFrame(() => {
      if (last.role === 'user') window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
      else document.getElementById(`msg-${last.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [messages]);

  const actions = useMemo<ChatActions>(() => {
    const sendText = (text: string) => {
      if (!text.trim() || busy) return;
      clearError();
      sendMessage({ text });
    };
    const sendAction = (text: string, tool: string, input: Record<string, unknown>, opts?: { auto?: boolean }) => {
      if (busy) return;
      clearError();
      sendMessage({ text, metadata: { action: { tool, input }, auto: opts?.auto ?? false } });
    };
    return {
      sendText,
      sendAction,
      busy,
      updateToolOutput: (toolCallId: string, output: unknown) =>
        setMessages((msgs) =>
          msgs.map((m) =>
            m.parts.some((p) => 'toolCallId' in p && p.toolCallId === toolCallId)
              ? { ...m, parts: m.parts.map((p) => ('toolCallId' in p && p.toolCallId === toolCallId ? ({ ...p, output } as typeof p) : p)) }
              : m,
          ),
        ),
      applySuggestion: (s: Suggestion) => {
        if (s.kind === 'message') sendText(s.text);
        else if (s.kind === 'action') sendAction(s.text, s.tool, s.input);
        else session.patch(s.patch);
      },
    };
  }, [busy, sendMessage, clearError, session, setMessages]);

  const newChat = useCallback(() => {
    stop();
    setMessages([]);
    clearError();
    session.setLatestSellers(null);
    window.scrollTo({ top: 0 });
  }, [stop, setMessages, clearError, session]);

  const suggestions = messages.length ? (lastToolSuggestions(messages) ?? session.suggestions.filter((s) => s.kind !== 'message' || s.text.startsWith('چرا'))) : [];

  return (
    <ChatActionsContext.Provider value={actions}>
      <div className="mx-auto flex min-h-dvh max-w-[520px] flex-col bg-background shadow-sm">
        <div className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <Header mapOpen={mapOpen} onToggleMap={() => setMapOpen((v) => !v)} onNewChat={newChat} hasMessages={messages.length > 0} />
          <ContextBar />
          {mapOpen && <MapPanel />}
        </div>
        <main className="flex-1 space-y-5 px-4 pb-44 pt-4">
          {messages.length === 0 ? <Hero /> : <MessageList messages={messages} />}
          {status === 'submitted' && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              همراه خرید در حال فکر کردن است…
            </p>
          )}
          {error && (
            <div className="flex items-start gap-2 rounded-2xl border border-recent/40 bg-recent-bg p-3 text-sm text-recent" role="alert">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <div className="space-y-2">
                <p>{error.message && /[؀-ۿ]/.test(error.message) ? error.message : 'دستیار هوشمند الان در دسترس نیست. کنترل‌های بالای صفحه و فهرست فروشنده‌ها همچنان کار می‌کنند.'}</p>
                <Button size="sm" variant="outline" className="h-9 bg-background" onClick={() => clearError()}>
                  باشه
                </Button>
              </div>
            </div>
          )}
        </main>
        <div className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[520px] border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-background/85">
          <SuggestedActions items={suggestions} />
          <Composer onStop={stop} />
        </div>
      </div>
    </ChatActionsContext.Provider>
  );
}

export function AssistantApp({ demoTime }: { demoTime: string | null }) {
  return (
    <SessionProvider demoTime={demoTime}>
      <FollowupsProvider>
        <Shell />
      </FollowupsProvider>
    </SessionProvider>
  );
}
