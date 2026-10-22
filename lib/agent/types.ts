// Tool output shapes shared by the server (tools) and the client (generative UI). Type-only module.
import type { CompareTable, ProductHit } from '../search/products';
import type { SellersResult, ShopDetails } from '../search/sellers';
import type { Budget } from '../search/query';
import type { Suggestion } from './suggest';
import type { FollowupItem } from '../sim/followups';
import type { AlternativesResult } from '../search/alternatives';

export type ClarifyOutput = { ui: 'clarify'; question: string; chips: string[] };

export type ProductsOutput = {
  ui: 'products';
  query: string;
  keywords: string;
  categories: string[];
  budget?: Budget;
  budget_relaxed: boolean;
  products: ProductHit[];
  suggested_actions: Suggestion[];
};

export type CompareOutput = { ui: 'compare' } & CompareTable;

export type ContextOutput = {
  ui: 'context';
  changes: string[];
  unresolved_location?: string;
  location: { lat: number; lon: number; label: string; source: string };
  radius_m: number;
  intent: string;
  filters: Record<string, unknown>;
};

export type SellersOutput = { ui: 'sellers'; suggested_actions: Suggestion[] } & SellersResult;

export type ShopOutput = { ui: 'shop' } & ShopDetails;

export type FollowupsOutput = { ui: 'followups'; channel: 'message' | 'call'; items: FollowupItem[]; disclaimer: string; suggested_actions: Suggestion[] };

export type AlternativesOutput = { ui: 'alternatives'; suggested_actions: Suggestion[] } & AlternativesResult;

export type ChecklistOutput = { ui: 'checklist'; product_title: string; category: string | null; items: string[]; source: 'llm' | 'template' };

export type ErrorOutput = { ui: 'error'; message: string };

export type ToolOutput =
  | ClarifyOutput
  | ProductsOutput
  | CompareOutput
  | ContextOutput
  | SellersOutput
  | ShopOutput
  | FollowupsOutput
  | AlternativesOutput
  | ChecklistOutput
  | ErrorOutput;

/** Message metadata used by UI actions: run `tool` with `input` right away, then let the agent comment. */
export type ActionMetadata = { action?: { tool: string; input: Record<string, unknown> }; auto?: boolean };
