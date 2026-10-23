// Mission (multi-goal request) shapes shared by the server and the client. Type-only module.
import type { Freshness, PriceFlag } from '../../data/quality';
import type { FollowupStatus } from '../state';
import type { Suggestion } from '../suggest';
import type { MallRef } from '../../search/sellers';
import type { PlanOutput } from '../types';
import type { VisitTimeOutput } from '../../search/visit-time';

export type BudgetMode = 'about' | 'max' | 'min' | 'range';
export type Intent = 'balanced' | 'cheapest' | 'nearest' | 'now';

export type Mission = {
  product: { query: string; brand?: string; category_hint?: string; product_id?: string } | null;
  budget: { min?: number; max?: number; mode: BudgetMode } | null;
  location: { text?: string; radius_m?: number } | null;
  conditions: { open_now?: boolean; installment?: boolean; torobpay?: boolean; fast_delivery?: boolean; warranty?: boolean };
  verify: { price_freshness?: boolean; contact_sellers?: boolean; availability?: boolean; hours?: boolean };
  output: { top_n?: number; want_plan?: boolean; want_compare?: boolean };
  intent: Intent;
  /** 'call' only when the user said تماس/زنگ */
  channel: 'message' | 'call';
  /** «گوشی A17، کاور A17، گلس، همه یکجا» → one line per item (F3 basket) */
  items?: string[];
};

export type MissionGoal = 'find' | 'where' | 'conditions' | 'verify' | 'plan' | 'compare';

export type MissionStepStatus = 'pending' | 'running' | 'done' | 'skipped' | 'failed';
export type MissionStep = { id: string; label: string; status: MissionStepStatus; detail?: string };
/** Streamed as a `data-mission-progress` part (same id → updated in place). */
export type MissionProgress = { steps: MissionStep[]; done: boolean };

export type Verdict = 'recommended' | 'ok' | 'avoid' | 'unknown';

export type MissionFollowup = { id: string; status: FollowupStatus; new_price: number | null; replied_at: string | null };

export type MissionRow = {
  offer_id: string;
  shop_id: string;
  product_id: string;
  shop_name: string;
  product_title: string;
  price: number | null;
  price_flag: PriceFlag;
  freshness: Freshness;
  price_age_days: number | null;
  open: { known: boolean; open: boolean | null; label: string; opensAt?: string };
  distance_m: number;
  lat: number;
  lon: number;
  mall: MallRef | null;
  followup: MissionFollowup | null;
  verdict: Verdict;
  verdict_reason: string;
};

/** One constraint as understood, shown as an editable chip («این‌طور فهمیدم»). */
export type Understood = { key: 'product' | 'budget' | 'location' | 'radius' | 'open_now' | 'installment' | 'torobpay' | 'fast_delivery' | 'warranty' | 'verify' | 'hours' | 'plan' | 'intent' | 'top_n'; label: string };

export type MissionResult = {
  ui: 'mission';
  /** the original request (re-run with overrides from the chips) */
  text: string;
  understood: Understood[];
  band: { min?: number; max?: number } | null;
  location: { label: string; lat: number; lon: number; kind: string; mall_key?: string };
  coverage: { requested_radius_m: number; used_radius_m: number; sellers_in_requested_radius: number; tried: Array<{ radius_m: number; sellers: number }>; note?: string };
  rows: MissionRow[];
  total_sellers: number;
  recommendation: { offer_id: string; reason: string } | null;
  /** why there is no recommendation («پیشنهادی ندارم چون…») */
  recommendation_note?: string;
  conditions_note?: string;
  next_actions: Suggestion[];
  suggested_actions: Suggestion[];
  steps: MissionStep[];
  /** asked instead of running when the place was not found */
  clarify?: { question: string; chips: Array<{ label: string; text: string }> };
  plan?: PlanOutput;
  /** «کی برم؟» for the reported sellers when the user asked about opening hours (F11) */
  visit_time?: VisitTimeOutput;
  disclaimer?: string;
  channel: 'message' | 'call';
  intent: Intent;
  /** chip edits already applied (kept so further edits stack) */
  overrides?: { radius_m?: number; location_text?: string; drop?: string[] };
};
