'use client';

import type { ToolOutput } from '@/lib/agent/types';
import { MallChip, OpenDot } from './badges';

/** Tool outputs other than the core four (shop details now; follow-ups, alternatives, plan, checklist later). */
export function ExtraToolView({ output }: { output: ToolOutput; isLastMessage: boolean }) {
  switch (output.ui) {
    case 'shop':
      return (
        <div className="space-y-1.5 rounded-2xl border bg-card p-3 text-sm">
          <p className="font-semibold">{output.shop_name}</p>
          <MallChip mall={output.mall} />
          <OpenDot open={output.open} />
          <p className="text-xs text-muted-foreground">{output.today_hours}</p>
        </div>
      );
    case 'error':
      return <p className="text-sm text-destructive">{output.message}</p>;
    default:
      return null;
  }
}
