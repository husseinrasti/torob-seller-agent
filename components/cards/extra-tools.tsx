'use client';

import type { ToolOutput } from '@/lib/agent/types';
import { MallChip, OpenDot } from './badges';
import { FollowupBoard } from './followup-board';
import { AlternativesPanel } from './alternatives-panel';
import { Checklist } from './checklist';
import { TripPlan } from './trip-plan';
import { MissionResultCard } from './mission-result';
import { VisitTimeCard } from './visit-time';
import { SpecAnswerCard } from './spec-answer';
import { RankExplainCard } from './rank-explain';
import { SellerMessageCard } from './seller-message';
import { BargainCard } from './bargain';
import { MallViewCard } from './mall-view';

/** Tool outputs other than the core four: shop details, follow-ups, alternatives, checklist, plan. */
export function ExtraToolView({ output, toolCallId, isLastMessage }: { output: ToolOutput; toolCallId: string; isLastMessage: boolean }) {
  switch (output.ui) {
    case 'followups':
      return <FollowupBoard output={output} toolCallId={toolCallId} isLastMessage={isLastMessage} />;
    case 'alternatives':
      return <AlternativesPanel output={output} />;
    case 'checklist':
      return <Checklist output={output} />;
    case 'plan':
      return <TripPlan plan={output} planId={output.plan_id} sharePath={output.share_path} />;
    case 'mission':
      return <MissionResultCard output={output} toolCallId={toolCallId} />;
    case 'visit_time':
      return <VisitTimeCard output={output} />;
    case 'spec_answer':
      return <SpecAnswerCard output={output} />;
    case 'rank_explain':
      return <RankExplainCard output={output} />;
    case 'seller_message':
      return <SellerMessageCard output={output} />;
    case 'bargain':
      return <BargainCard output={output} />;
    case 'mall_view':
      return <MallViewCard output={output} />;
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
