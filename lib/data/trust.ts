import type { Freshness } from './quality';

/**
 * «کامل بودن اطلاعات» — how much the dataset tells about a shop, 0–3 (never a quality rating):
 * +1 opening hours known, +1 website or Instagram, +1 this offer's price changed within 30 days.
 */
export type TrustInput = { hours_known: boolean; website_url?: string | null; instagram_url?: string | null; freshness: Freshness };
export type TrustReason = { key: 'hours' | 'web' | 'price'; ok: boolean; label: string };
export type Trust = { score: 0 | 1 | 2 | 3; reasons: TrustReason[]; website_url: string | null; instagram_url: string | null };

export function trustScore(t: TrustInput): Trust {
  const web = Boolean(t.website_url || t.instagram_url);
  const fresh = t.freshness === 'fresh' || t.freshness === 'recent';
  const reasons: TrustReason[] = [
    { key: 'hours', ok: t.hours_known, label: t.hours_known ? 'ساعت کاری ثبت‌شده' : 'ساعت کاری ثبت نشده' },
    { key: 'web', ok: web, label: web ? 'وب‌سایت یا اینستاگرام دارد' : 'وب‌سایت و اینستاگرام ثبت نشده' },
    { key: 'price', ok: fresh, label: fresh ? 'قیمت این کالا در ۳۰ روز اخیر به‌روز شده' : 'قیمت این کالا قدیمی یا بی‌تاریخ است' },
  ];
  return { score: reasons.filter((r) => r.ok).length as Trust['score'], reasons, website_url: t.website_url ?? null, instagram_url: t.instagram_url ?? null };
}

/** The dataset stores Instagram as JSON ({handle, profile_url}), a URL or a bare handle. */
export function instagramUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (s.startsWith('{')) {
    try {
      const j = JSON.parse(s) as { profile_url?: string; handle?: string };
      if (j.profile_url) return j.profile_url;
      if (j.handle) return `https://www.instagram.com/${j.handle.replace(/^@/, '')}/`;
    } catch {
      return null;
    }
    return null;
  }
  if (/^https?:\/\//.test(s)) return s;
  return /^@?[\w.]+$/.test(s) ? `https://www.instagram.com/${s.replace(/^@/, '')}/` : null;
}

export type PaymentOption = { provider: string; in_person: boolean };

/** `payment_options` jsonb → providers with their channel («دیجی پی» → «دیجی‌پی»). */
export function paymentOptions(raw: Array<{ provider_name?: string; channel?: string }> | null | undefined): PaymentOption[] {
  return (raw ?? [])
    .filter((p) => p.provider_name)
    .map((p) => ({ provider: p.provider_name!.replace('دیجی پی', 'دیجی‌پی'), in_person: p.channel === 'in_person' }));
}

/**
 * Credit-payment wording: confirmed in-person channels name their providers; declared ones say the
 * channel is unknown. Empty when the shop declared none.
 */
export function paymentWording(options: PaymentOption[]): string[] {
  const inPerson = options.filter((o) => o.in_person).map((o) => o.provider);
  const declared = options.filter((o) => !o.in_person).map((o) => o.provider);
  const lines: string[] = [];
  if (inPerson.length) lines.push(`پرداخت اعتباری حضوری تأییدشده (${inPerson.join('/')})`);
  if (declared.length) lines.push(`پرداخت اعتباری اعلام‌شده (کانال نامشخص): ${declared.join('، ')}`);
  return lines;
}
