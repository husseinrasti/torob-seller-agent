import { generateText, Output } from 'ai';
import { z } from 'zod';
import { llmConfigured, model } from '../llm';
import { formatToman } from '../fa/format';
import type { SimStatus } from './seller';

export type TranscriptLine = { from: 'agent' | 'seller' | 'system'; text: string };

export type PersonaInput = {
  shopName: string;
  productTitle: string;
  channel: 'message' | 'call';
  status: SimStatus;
  oldPrice: number | null;
  newPrice: number | null;
  closedNow: boolean;
  reopenLabel?: string | null;
  question?: string | null;
};

const short = (t: string) => t.split('|')[0].trim();

/** Deterministic Persian transcript that states exactly the simulated truth. */
export function templateTranscript(i: PersonaInput): TranscriptLine[] {
  const product = short(i.productTitle);
  const ask =
    i.channel === 'call'
      ? `الو سلام، از «همراه خرید» تماس می‌گیرم. «${product}» موجود دارید؟${i.oldPrice ? ` قیمت امروزش همون ${formatToman(i.oldPrice)} است؟` : ' قیمتش امروز چنده؟'}`
      : `سلام وقت بخیر. «${product}» موجود دارید؟${i.oldPrice ? ` قیمت ${formatToman(i.oldPrice)} هنوز معتبره؟` : ' قیمت امروزش چنده؟'}${i.question ? ` ${i.question}` : ''}`;
  const lines: TranscriptLine[] = [{ from: 'agent', text: ask }];
  const closedPrefix = i.closedNow ? `الان بسته‌ایم${i.reopenLabel ? `، ${i.reopenLabel}` : ''}. ` : '';
  switch (i.status) {
    case 'no_answer':
      lines.push({ from: 'system', text: '(بوق آزاد… پاسخی دریافت نشد)' });
      lines.push({ from: 'agent', text: i.reopenLabel ? `فروشگاه الان بسته است؛ ${i.reopenLabel.replace('باز می‌شود', '')}دوباره تماس می‌گیرم.` : 'کمی بعد دوباره تماس می‌گیرم.' });
      break;
    case 'out_of_stock':
      lines.push({ from: 'seller', text: `${closedPrefix}سلام. نه متأسفانه، این مدل الان تموم شده. شاید هفته بعد برسه.` });
      break;
    case 'price_changed':
      lines.push({
        from: 'seller',
        text: `${closedPrefix}سلام. موجوده${i.newPrice ? `، ولی قیمت امروزش ${formatToman(i.newPrice)} شده` : ''}.`,
      });
      lines.push({ from: 'agent', text: 'ممنون، به مشتری اطلاع می‌دم.' });
      break;
    default:
      lines.push({
        from: 'seller',
        text: `${closedPrefix}سلام، بله موجوده${i.oldPrice ? `، همون ${formatToman(i.oldPrice)}` : ''}. تشریف بیارید.`,
      });
  }
  return lines;
}

const Schema = z.object({
  lines: z.array(z.object({ from: z.enum(['agent', 'seller']), text: z.string().max(160) })).min(2).max(4),
});

/**
 * 2–4 line seller conversation from the fast model in a terse bazaar tone, constrained to the truth;
 * falls back to the template on error, missing key or > 3 s. Prices in the text are checked.
 */
export async function sellerTranscript(i: PersonaInput): Promise<{ lines: TranscriptLine[]; source: 'llm' | 'template' }> {
  const template = templateTranscript(i);
  if (!llmConfigured() || i.status === 'no_answer') return { lines: template, source: 'template' };
  const truth =
    i.status === 'confirmed'
      ? `موجود است${i.oldPrice ? ` و قیمت ${formatToman(i.oldPrice)} تأیید می‌شود` : ''}`
      : i.status === 'out_of_stock'
        ? 'موجود نیست (تمام شده)'
        : `موجود است اما قیمت جدید ${i.newPrice ? formatToman(i.newPrice) : 'نامشخص'} است`;
  try {
    const { output } = await generateText({
      model: model('fast'),
      output: Output.object({ schema: Schema }),
      timeout: 3000,
      maxRetries: 0,
      prompt: [
        `یک گفت‌وگوی ${i.channel === 'call' ? 'تلفنی' : 'پیامی'} کوتاه (۲ تا ۴ خط) بنویس بین «دستیار همراه خرید» (agent) و فروشنده مغازه «${i.shopName}» (seller) در بازار تهران، لحن خودمانی و کوتاه بازاری.`,
        `کالا: «${short(i.productTitle)}». حقیقت که باید دقیقاً همین گفته شود: ${truth}.${i.closedNow ? ' مغازه الان بسته است و فروشنده این را می‌گوید.' : ''}`,
        'هیچ عدد یا قیمت دیگری نگو؛ وعده تخفیف یا رزرو نده. فقط فارسی.',
      ].join('\n'),
    });
    // guard: every price in the text must be the truth's price
    const allowed = [i.oldPrice, i.newPrice].filter(Boolean).map((n) => formatToman(n!).replace(' تومان', ''));
    const text = output.lines.map((l) => l.text).join(' ');
    const prices = text.match(/[۰-۹][۰-۹٬]{5,}/g) ?? [];
    if (prices.some((p) => !allowed.includes(p))) return { lines: template, source: 'template' };
    return { lines: output.lines, source: 'llm' };
  } catch {
    return { lines: template, source: 'template' };
  }
}
