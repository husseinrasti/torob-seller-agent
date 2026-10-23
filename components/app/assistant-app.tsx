'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, type UIMessage } from 'ai';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { useIsDesktop, uuid } from '@/lib/client';
import type { Suggestion } from '@/lib/agent/suggest';
import type { ChatSummary } from '@/lib/agent/state';
import type { UserMemory } from '@/lib/agent/memory';
import { ChatActionsContext, type ChatActions } from './chat-actions';
import { SessionProvider, useSession } from './session-context';
import { FollowupsProvider } from './followups-store';
import { Header } from './header';
import { ContextBar } from './context-bar';
import { Hero } from './hero';
import { MessageList } from './message-list';
import { Composer } from './composer';
import { BasketBar } from './basket-bar';
import { SuggestedActions } from './suggested-actions';
import { MapColumn, MapPanel } from './map-panel';
import { LoginScreen } from './login-screen';
import { HistoryPanel } from './history-panel';

type Me = { user: { id: string; name: string }; memory: UserMemory };

/**
 * Suggestions of the most recent tool output that has any. Text-only replies and informational cards
 * without a `suggested_actions` field (spec answers, «کی برم؟», rank explanations, bargaining) keep the
 * previous chips; the look-back counts only replies whose tools state their suggestions.
 */
function lastToolSuggestions(messages: UIMessage[]): Suggestion[] | null {
  for (let m = messages.length - 1, seen = 0; m >= 0 && seen < 4; m--) {
    const msg = messages[m];
    if (msg.role !== 'assistant') continue;
    if (msg.parts.some((p) => p.type.startsWith('tool-') && (p as { output?: object }).output && 'suggested_actions' in ((p as { output?: object }).output ?? {}))) seen++;
    for (let i = msg.parts.length - 1; i >= 0; i--) {
      const p = msg.parts[i] as { type: string; state?: string; output?: { suggested_actions?: Suggestion[] } };
      if (!p.type.startsWith('tool-') || p.state !== 'output-available') continue;
      if (p.output?.suggested_actions?.length) return p.output.suggested_actions;
      if (p.output?.suggested_actions) return null; // latest tool explicitly has none → session suggestions
    }
  }
  return null;
}

type WorkspaceProps = {
  chatId: string;
  initialMessages: UIMessage[];
  me: Me;
  chats: ChatSummary[];
  onNewChat: () => void;
  onOpenChat: (id: string) => void;
  onDeleteChat: (id: string) => void;
  onClearMemory: () => void;
  onLogout: () => void;
  /** the chat got its first message (URL + history list) or finished a reply */
  onChatSaved: (firstMessage: boolean) => void;
  /** ?demo_time= — sent with every chat request so a brand-new chat never runs on the real clock */
  demoTime: string | null;
};

function Workspace({ chatId, initialMessages, me, chats, onNewChat, onOpenChat, onDeleteChat, onClearMemory, onLogout, onChatSaved, demoTime }: WorkspaceProps) {
  const session = useSession();
  const desktop = useIsDesktop();
  const [mapOpen, setMapOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const scroller = useRef<HTMLElement>(null);
  // mode 'auto': the server runs compound requests as one mission (see /api/chat)
  const transport = useMemo(() => new DefaultChatTransport({ api: '/api/chat', body: { mode: 'auto', demo_time: demoTime } }), [demoTime]);
  const { messages, sendMessage, status, error, stop, setMessages, clearError } = useChat({
    id: chatId,
    messages: initialMessages,
    transport,
    onFinish: () => {
      session.refresh();
      onChatSaved(false);
    },
  });
  const busy = status === 'submitted' || status === 'streaming';
  const lastCount = useRef(messages.length);
  const dirty = useRef(false);

  // a new chat becomes a saved, resumable chat with its first message
  const announced = useRef(initialMessages.length > 0);
  useEffect(() => {
    if (!announced.current && messages.length > 0) {
      announced.current = true;
      onChatSaved(true);
    }
  }, [messages.length, onChatSaved]);

  // bring each new message into view (start of the assistant reply, not the bottom of long lists)
  useEffect(() => {
    if (messages.length === lastCount.current) return;
    lastCount.current = messages.length;
    const last = messages[messages.length - 1];
    if (!last) return;
    requestAnimationFrame(() => {
      if (last.role === 'user') scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: 'smooth' });
      else document.getElementById(`msg-${last.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [messages]);

  // cards updated after a reply (re-filtered lists, follow-up results) are saved so a resumed chat shows them
  useEffect(() => {
    if (!dirty.current || status !== 'ready') return;
    const t = setTimeout(() => {
      dirty.current = false;
      fetch(`/api/chats/${chatId}/messages`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages }) }).catch(() => {});
    }, 1500);
    return () => clearTimeout(t);
  }, [messages, status, chatId]);

  const actions = useMemo<ChatActions>(() => {
    const sendText = (text: string) => {
      if (!text.trim() || busy) return;
      clearError();
      sendMessage({ text });
    };
    const sendAction = (text: string, tool: string, input: Record<string, unknown>, opts?: { auto?: boolean; photo?: string }) => {
      if (busy) return;
      clearError();
      sendMessage({ text, metadata: { action: { tool, input }, auto: opts?.auto ?? false, ...(opts?.photo ? { photo: opts.photo } : {}) } });
    };
    return {
      sendText,
      sendAction,
      busy,
      updateToolOutput: (toolCallId: string, output: unknown) => {
        dirty.current = true;
        setMessages((msgs) =>
          msgs.map((m) =>
            m.parts.some((p) => 'toolCallId' in p && p.toolCallId === toolCallId)
              ? { ...m, parts: m.parts.map((p) => ('toolCallId' in p && p.toolCallId === toolCallId ? ({ ...p, output } as typeof p) : p)) }
              : m,
          ),
        );
      },
      applySuggestion: (s: Suggestion) => {
        if (s.kind === 'message') sendText(s.text);
        else if (s.kind === 'action') sendAction(s.text, s.tool, s.input);
        else session.patch(s.patch);
      },
    };
  }, [busy, sendMessage, clearError, session, setMessages]);

  const suggestions = useMemo(() => {
    if (!messages.length) return [];
    const fromTool = lastToolSuggestions(messages) ?? [];
    const seen = new Set(fromTool.map((s) => s.label));
    const fromState = session.suggestions.filter((s) => s.kind !== 'message' && !seen.has(s.label));
    return [...fromTool, ...fromState].slice(0, 6);
  }, [messages, session.suggestions]);

  const history = (
    <HistoryPanel
      user={me.user}
      chats={chats}
      currentChatId={chatId}
      memory={me.memory}
      onNewChat={() => {
        setHistoryOpen(false);
        onNewChat();
      }}
      onOpenChat={(id) => {
        setHistoryOpen(false);
        onOpenChat(id);
      }}
      onDeleteChat={onDeleteChat}
      onClearMemory={onClearMemory}
      onLogout={onLogout}
      onSearch={(text) => {
        setHistoryOpen(false);
        actions.sendText(text);
      }}
    />
  );

  return (
    <ChatActionsContext.Provider value={actions}>
      <div className="flex h-dvh overflow-hidden bg-background lg:grid lg:grid-cols-[17rem_minmax(0,1fr)_minmax(22rem,38%)]">
        <aside className="hidden min-h-0 border-e bg-muted/30 lg:flex lg:flex-col" aria-label="گفتگوها و حافظه">
          {history}
        </aside>

        <section className="flex h-dvh min-w-0 flex-1 flex-col">
          <div className="z-30 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <Header
              mapOpen={mapOpen}
              onToggleMap={() => setMapOpen((v) => !v)}
              onNewChat={onNewChat}
              onOpenHistory={() => setHistoryOpen(true)}
              hasMessages={messages.length > 0}
            />
            <div className="mx-auto w-full max-w-3xl">
              <ContextBar />
            </div>
            {mapOpen && !desktop && <MapPanel />}
          </div>
          <main ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-scroller>
            <div className="@container mx-auto w-full max-w-3xl space-y-5 px-4 pb-6 pt-4">
              {messages.length === 0 ? (
                <Hero name={me.user.name} memory={me.memory} recentChats={chats.filter((c) => c.id !== chatId).slice(0, 3)} onOpenChat={onOpenChat} />
              ) : (
                <MessageList messages={messages} />
              )}
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
            </div>
          </main>
          <div className="border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-[backdrop-filter]:bg-background/85">
            <div className="mx-auto w-full max-w-3xl">
              <BasketBar />
              <SuggestedActions items={suggestions} />
              <Composer onStop={stop} />
            </div>
          </div>
        </section>

        {desktop && (
          <aside className="min-h-0 border-s" aria-label="نقشه">
            <MapColumn />
          </aside>
        )}
      </div>

      {!desktop && (
        <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
          <SheetContent side="right" className="w-[85vw] max-w-sm p-0">
            <SheetHeader className="border-b">
              <SheetTitle>گفتگوهای {me.user.name}</SheetTitle>
              <SheetDescription>گفتگوهای قبلی را ادامه دهید</SheetDescription>
            </SheetHeader>
            <div className="min-h-0 flex-1">{history}</div>
          </SheetContent>
        </Sheet>
      )}
    </ChatActionsContext.Provider>
  );
}

function urlFor(chatId: string | null): string {
  const sp = new URLSearchParams(window.location.search);
  if (chatId) sp.set('c', chatId);
  else sp.delete('c');
  const q = sp.toString();
  return q ? `/?${q}` : '/';
}

function Splash() {
  return (
    <div className="mx-auto flex h-dvh max-w-3xl flex-col gap-4 p-4">
      <Skeleton className="h-12 w-full rounded-xl" />
      <Skeleton className="h-10 w-2/3 rounded-xl" />
      <Skeleton className="h-40 w-full rounded-2xl" />
    </div>
  );
}

/** Sign-in gate + chat switching (`/?c=<chat id>` resumes a saved chat). */
export function AssistantApp({ initialChatId, demoTime }: { initialChatId: string | null; demoTime: string | null }) {
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [chatId, setChatId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<UIMessage[] | null>(null);
  const [chats, setChats] = useState<ChatSummary[]>([]);

  const loadChats = useCallback(async () => {
    const r = await fetch('/api/chats', { cache: 'no-store' });
    if (r.ok) setChats((await r.json()).chats);
  }, []);

  const loadMe = useCallback(async () => {
    const r = await fetch('/api/me', { cache: 'no-store' });
    const d = r.ok ? await r.json() : null;
    if (!d?.user) {
      setMe(null);
      return null;
    }
    const next = { user: d.user, memory: d.memory ?? {} } as Me;
    setMe(next);
    return next;
  }, []);

  const startNew = useCallback((push = true) => {
    setChatId(uuid());
    setInitialMessages([]);
    if (push) window.history.pushState(null, '', urlFor(null));
  }, []);

  const open = useCallback(
    async (id: string, push = true) => {
      setInitialMessages(null);
      const r = await fetch(`/api/chats/${id}`, { cache: 'no-store' });
      if (!r.ok) {
        toast.error('این گفتگو پیدا نشد؛ یک گفتگوی تازه شروع شد.');
        startNew(true);
        return;
      }
      const d = await r.json();
      setChatId(id);
      setInitialMessages(d.messages ?? []);
      if (push) window.history.pushState(null, '', urlFor(id));
    },
    [startNew],
  );

  // first load: who is signed in, then the chat from the URL (or a new one)
  useEffect(() => {
    (async () => {
      const user = await loadMe();
      if (!user) return;
      loadChats();
      if (initialChatId) await open(initialChatId, false);
      else startNew(false);
    })();
  }, [initialChatId, loadMe, loadChats, open, startNew]);

  // browser back/forward between chats
  useEffect(() => {
    const onPop = () => {
      const c = new URLSearchParams(window.location.search).get('c');
      if (c) open(c, false);
      else startNew(false);
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [open, startNew]);

  const onChatSaved = useCallback(
    (first: boolean) => {
      if (first && chatId) window.history.replaceState(null, '', urlFor(chatId));
      loadChats();
      loadMe();
    },
    [chatId, loadChats, loadMe],
  );

  if (me === undefined) return <Splash />;
  if (me === null)
    return (
      <LoginScreen
        onLogin={async () => {
          const user = await loadMe();
          if (!user) return;
          loadChats();
          startNew(false);
        }}
      />
    );
  if (!chatId || initialMessages === null) return <Splash />;

  return (
    <SessionProvider key={chatId} chatId={chatId} demoTime={demoTime}>
      <FollowupsProvider>
        <Workspace
          chatId={chatId}
          demoTime={demoTime}
          initialMessages={initialMessages}
          me={me}
          chats={chats}
          onNewChat={() => startNew(true)}
          onOpenChat={(id) => id !== chatId && open(id)}
          onDeleteChat={async (id) => {
            await fetch(`/api/chats/${id}`, { method: 'DELETE' });
            await loadChats();
            if (id === chatId) startNew(true);
          }}
          onClearMemory={async () => {
            await fetch('/api/me/memory', { method: 'DELETE' });
            await loadMe();
            toast.success('حافظه پاک شد');
          }}
          onLogout={async () => {
            await fetch('/api/auth/logout', { method: 'POST' });
            setChats([]);
            setChatId(null);
            setMe(null);
            window.history.pushState(null, '', urlFor(null));
          }}
          onChatSaved={onChatSaved}
        />
      </FollowupsProvider>
    </SessionProvider>
  );
}
