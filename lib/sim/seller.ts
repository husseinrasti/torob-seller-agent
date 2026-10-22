import { createHash } from 'node:crypto';
import type { Freshness } from '../data/quality';

export type SimOutcome = 'confirmed' | 'out_of_stock' | 'price_changed' | 'price_quoted';
export type SimStatus = 'confirmed' | 'out_of_stock' | 'price_changed' | 'no_answer';

export const DEFAULT_SIM_SALT = 'hamrah-40';

/** Three independent uniforms in [0,1) from sha256(SIM_SALT + offer_id). */
export function simRandoms(offerId: string, salt = process.env.SIM_SALT || DEFAULT_SIM_SALT): [number, number, number] {
  const h = createHash('sha256').update(salt + offerId).digest();
  const u = (i: number) => h.readUInt32BE(i) / 2 ** 32;
  return [u(0), u(4), u(8)];
}

// spec §7: base probabilities by price freshness
const PROBS: Record<Freshness, { oos: number; changed: number }> = {
  fresh: { oos: 0.1, changed: 0.08 },
  recent: { oos: 0.18, changed: 0.15 },
  stale: { oos: 0.35, changed: 0.25 },
  unknown: { oos: 0.35, changed: 0.25 },
};

export type GroundTruth = { outcome: SimOutcome; newPrice: number | null; latencyMs: number };

/** Deterministic hidden truth for one offer (what the seller would say today). Pure. */
export function groundTruth(
  offer: { offer_id: string; price: number | null; freshness: Freshness; reference_price?: number | null },
  salt?: string,
): GroundTruth {
  const [r, r2, r3] = simRandoms(offer.offer_id, salt);
  const p = PROBS[offer.freshness] ?? PROBS.unknown;
  const latencyMs = Math.round(1500 + 2500 * r3);
  const delta = -0.05 + 0.2 * r2; // δ ∈ [−5%, +15%]
  const round = (x: number) => Math.round(x / 10_000) * 10_000;
  if (r < p.oos) return { outcome: 'out_of_stock', newPrice: null, latencyMs };
  if (offer.price === null) {
    // no listed price: the seller quotes one (spec: price_changed becomes price_quoted)
    const base = offer.reference_price ?? null;
    return { outcome: 'price_quoted', newPrice: base ? round(base * (1 + delta)) : null, latencyMs };
  }
  if (r < p.oos + p.changed) {
    // keep δ in [−5%, +15%] but never a no-op change (|δ| ≥ 2%)
    const d = Math.abs(delta) < 0.02 ? Math.sign(delta || 1) * 0.02 : delta;
    return { outcome: 'price_changed', newPrice: round(offer.price * (1 + d)), latencyMs };
  }
  return { outcome: 'confirmed', newPrice: null, latencyMs };
}

/**
 * Follow-up result given the channel and whether the shop is closed now:
 * a call to a closed shop is not answered; a message still gets the true answer («الان بسته‌ایم…»).
 */
export function followupResult(truth: GroundTruth, channel: 'message' | 'call', closedNow: boolean): { status: SimStatus; newPrice: number | null } {
  if (closedNow && channel === 'call') return { status: 'no_answer', newPrice: null };
  if (truth.outcome === 'out_of_stock') return { status: 'out_of_stock', newPrice: null };
  if (truth.outcome === 'price_changed' || truth.outcome === 'price_quoted') {
    return truth.newPrice ? { status: 'price_changed', newPrice: truth.newPrice } : { status: 'confirmed', newPrice: null };
  }
  return { status: 'confirmed', newPrice: null };
}
