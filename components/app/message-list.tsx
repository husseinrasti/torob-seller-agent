'use client';

import { memo } from 'react';
import type { UIMessage } from 'ai';
import { BellRing, Bot, Camera, Loader2 } from 'lucide-react';
import { photoThumb } from '@/components/app/photo';
import { Skeleton } from '@/components/ui/skeleton';
import type { ActionMetadata, ToolOutput } from '@/lib/agent/types';
import { faText } from '@/lib/fa/format';
import { ProductCards } from '@/components/cards/product-cards';
import { CompareTable } from '@/components/cards/compare-table';
import { SellerList } from '@/components/cards/seller-list';
import { ClarifyChips, ContextNote, ToolError } from '@/components/cards/small-cards';
import { ExtraToolView } from '@/components/cards/extra-tools';
import { MissionProgressCard } from '@/components/cards/mission-progress';
import type { MissionProgress } from '@/lib/agent/mission/types';

type ToolPart = {
  type: string;
  toolCallId: string;
  state: 'input-streaming' | 'input-available' | 'output-available' | 'output-error' | string;
  output?: unknown;
  errorText?: string;
};

const LOADING_LABEL: Record<string, string> = {
  search_products: 'در حال پیدا کردن گزینه‌ها…',
  compare_products: 'در حال مقایسه…',
  find_sellers: 'در حال پیدا کردن فروشنده‌های نزدیک…',
  set_context: 'در حال به‌روزرسانی تنظیمات…',
  shop_details: 'در حال دریافت جزئیات فروشگاه…',
  contact_seller: 'در حال تماس با فروشنده‌ها…',
  find_alternatives: 'در حال یافتن جایگزین…',
  plan_trip: 'در حال ساختن برنامه مراجعه…',
  purchase_checklist: 'در حال آماده کردن چک‌لیست…',
  run_mission: 'در حال انجام مأموریت…',
};

function ToolSkeleton({ name }: { name: string }) {
  return (
    <div className="space-y-2" aria-live="polite">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" />
        {LOADING_LABEL[name] ?? 'در حال انجام…'}
      </p>
      {name === 'search_products' ? (
        <div className="flex gap-3 overflow-hidden">
          <Skeleton className="h-64 w-[17rem] shrink-0 rounded-2xl" />
          <Skeleton className="h-64 w-[17rem] shrink-0 rounded-2xl" />
        </div>
      ) : name === 'find_sellers' ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full rounded-2xl" />
          <Skeleton className="h-52 w-full rounded-2xl" />
        </div>
      ) : (
        <Skeleton className="h-20 w-full rounded-2xl" />
      )}
    </div>
  );
}

/** Minimal formatting for assistant text: paragraphs and **bold**. */
function AssistantText({ text }: { text: string }) {
  if (!text.trim()) return null;
  return (
    <div className="flex items-start gap-2" data-agent-text>
      <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Bot className="size-4" />
      </span>
      <div className="space-y-1.5 pt-0.5 text-sm leading-7">
        {text
          .split(/\n{2,}|\n(?=[-•])/)
          .filter(Boolean)
          .map((para) => faText(para))
          .map((para, i) => (
            <p key={i}>
              {para.split(/(\*\*[^*]+\*\*)/g).map((seg, j) =>
                seg.startsWith('**') && seg.endsWith('**') ? <strong key={j}>{seg.slice(2, -2)}</strong> : <span key={j}>{seg}</span>,
              )}
            </p>
          ))}
      </div>
    </div>
  );
}

function OutputView({ output, toolCallId, isLatestSellers, isLastMessage }: { output: ToolOutput; toolCallId: string; isLatestSellers: boolean; isLastMessage: boolean }) {
  switch (output.ui) {
    case 'products':
      return <ProductCards output={output} />;
    case 'compare':
      return <CompareTable output={output} />;
    case 'sellers':
      return <SellerList output={output} isLatest={isLatestSellers} toolCallId={toolCallId} />;
    case 'context':
      return <ContextNote output={output} />;
    case 'clarify':
      return <ClarifyChips output={output} isLast={isLastMessage} />;
    default:
      return <ExtraToolView output={output} toolCallId={toolCallId} isLastMessage={isLastMessage} />;
  }
}

const AssistantMessage = memo(function AssistantMessage({
  message,
  latestSellersId,
  isLastMessage,
}: {
  message: UIMessage;
  latestSellersId: string | null;
  isLastMessage: boolean;
}) {
  // mission progress is streamed as its own data part; show it right above its report (or instead of the skeleton)
  const progress = message.parts.filter((p) => p.type === 'data-mission-progress').map((p) => (p as { data: MissionProgress }).data);
  let missionIdx = 0;
  return (
    <div className="space-y-3" data-role="assistant">
      {message.parts.map((part, i) => {
        if (part.type === 'text') return <AssistantText key={i} text={part.text} />;
        if (part.type === 'data-mission-progress') return null;
        if (part.type === 'tool-run_mission') {
          const p = part as unknown as ToolPart;
          const prog = progress[missionIdx++];
          return (
            <div key={p.toolCallId} className="space-y-3">
              {prog && <MissionProgressCard progress={prog} />}
              {p.state === 'output-available' ? (
                <OutputView toolCallId={p.toolCallId} output={p.output as ToolOutput} isLatestSellers={false} isLastMessage={isLastMessage} />
              ) : p.state === 'output-error' ? (
                <ToolError text={p.errorText} />
              ) : (
                !prog && <ToolSkeleton name="run_mission" />
              )}
            </div>
          );
        }
        if (part.type === 'data-notice') {
          return (
            <p key={i} className="text-[11px] text-muted-foreground">
              {(part as { data?: { text?: string } }).data?.text}
            </p>
          );
        }
        if (!part.type.startsWith('tool-')) return null;
        const p = part as unknown as ToolPart;
        const name = p.type.slice(5);
        if (p.state === 'output-available') {
          return (
            <OutputView key={p.toolCallId} toolCallId={p.toolCallId} output={p.output as ToolOutput} isLatestSellers={p.toolCallId === latestSellersId} isLastMessage={isLastMessage} />
          );
        }
        if (p.state === 'output-error') return <ToolError key={p.toolCallId} text={p.errorText} />;
        return <ToolSkeleton key={p.toolCallId} name={name} />;
      })}
    </div>
  );
});

/** The photo of a photo search: in this page's memory only; after a reload a placeholder (it is not stored). */
function PhotoThumb({ id }: { id: string }) {
  const src = photoThumb(id);
  return src ? (
    <img data-photo-thumb src={src} alt="عکس ارسال‌شده" className="max-h-32 rounded-2xl border object-cover" />
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-[11px] text-muted-foreground">
      <Camera className="size-3.5" />
      عکس (ذخیره نشده)
    </span>
  );
}

function UserMessage({ message }: { message: UIMessage }) {
  const text = message.parts.map((p) => (p.type === 'text' ? p.text : '')).join(' ');
  const meta = message.metadata as ActionMetadata | undefined;
  const isAction = Boolean(meta?.action);
  if (meta?.auto) {
    return (
      <div className="flex justify-center" data-role="event">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-info-bg px-3 py-1.5 text-xs text-info">
          <BellRing className="size-3.5" />
          خودکار: {text}
        </p>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-end gap-1" data-role="user">
      {meta?.photo && <PhotoThumb id={meta.photo} />}
      <p className={`max-w-[85%] rounded-2xl rounded-ee-md px-3.5 py-2 text-sm leading-6 ${isAction ? 'bg-secondary text-secondary-foreground' : 'bg-primary text-primary-foreground'}`}>{text}</p>
    </div>
  );
}

export function MessageList({ messages }: { messages: UIMessage[] }) {
  let latestSellersId: string | null = null;
  outer: for (let i = messages.length - 1; i >= 0; i--) {
    const parts = messages[i].parts;
    for (let j = parts.length - 1; j >= 0; j--) {
      const p = parts[j] as unknown as ToolPart;
      if (p.type === 'tool-find_sellers' && p.state === 'output-available') {
        latestSellersId = p.toolCallId;
        break outer;
      }
    }
  }
  return (
    <div className="space-y-5">
      {messages.map((m, idx) =>
        m.role === 'user' ? (
          <UserMessage key={m.id} message={m} />
        ) : (
          <div key={m.id} id={`msg-${m.id}`} className="scroll-mt-4">
            <AssistantMessage message={m} latestSellersId={latestSellersId} isLastMessage={idx === messages.length - 1} />
          </div>
        ),
      )}
    </div>
  );
}
