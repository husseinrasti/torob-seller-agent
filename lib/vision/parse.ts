import { z } from 'zod';
import { toEnDigits } from '../fa/digits';
import { faText } from '../fa/format';
import { normalizeForSearch } from '../fa/normalize';

/**
 * Photo search (F1), pure part: the vision model's strict JSON, the shelf price read from the photo, the
 * search query built from brand/model/type, and when to give up («نتونستم تشخیص بدم، اسمش رو بنویس»).
 */

export const VisionSchema = z.object({
  brand: z.string().nullable().describe('brand as printed (e.g. Samsung, شیائومی); null if not visible'),
  model: z.string().nullable().describe('model name/code as printed (e.g. Galaxy A17); null if not visible'),
  product_type: z.string().nullable().describe('what the product is, in Persian (گوشی موبایل، هدفون، پاوربانک …); null if the photo shows no product'),
  visible_price_toman: z.number().nullable().describe('a price printed on a tag/label, converted to toman (ریال ÷ 10); null if none'),
  text_lines: z.array(z.string()).max(12).describe('legible text lines, as printed'),
  confidence: z.number().min(0).max(1).describe('0–1: how sure you are what product this is'),
});
export type Vision = z.infer<typeof VisionSchema>;

export const NOT_RECOGNIZED = 'نتونستم تشخیص بدم، اسمش رو بنویس';

const BRAND_FA: Record<string, string> = {
  samsung: 'سامسونگ',
  xiaomi: 'شیائومی',
  redmi: 'شیائومی',
  poco: 'شیائومی',
  apple: 'اپل',
  iphone: 'اپل',
  huawei: 'هواوی',
  honor: 'آنر',
  nokia: 'نوکیا',
  motorola: 'موتورولا',
  realme: 'ریلمی',
  anker: 'انکر',
  baseus: 'بیسوس',
  sony: 'سونی',
  lg: 'ال جی',
  jbl: 'جی بی ال',
  philips: 'فیلیپس',
  bosch: 'بوش',
  asus: 'ایسوس',
  lenovo: 'لنوو',
  hp: 'اچ پی',
  'g plus': 'جی پلاس',
  gplus: 'جی پلاس',
  tsco: 'تسکو',
};

/** «Samsung» → «سامسونگ» (search runs on Persian titles); Persian names pass through. */
export function brandFa(brand: string | null): string | null {
  if (!brand?.trim()) return null;
  const key = brand.trim().toLowerCase();
  return BRAND_FA[key] ?? brand.trim();
}

const PRICE_RE = /(\d{1,3}(?:[,٬.،]\d{3})+|\d{4,})\s*(تومان|تومن|ت(?=\s|$)|ریال)?/gu;
const MILLION_RE = /(\d+(?:[.٫/]\d+)?)\s*(میلیون|م(?=\s|$))\s*(?:تومان|تومن)?/u;

/** A price printed on a tag: «۶۴٬۵۰۰٬۰۰۰ تومان»، «۵۸.۹ میلیون»، «۶۴۵٬۰۰۰٬۰۰۰ ریال» → toman. */
export function priceFromLines(lines: string[]): number | null {
  const sane = (n: number) => n >= 10_000 && n <= 3_000_000_000;
  for (const raw of lines) {
    const line = toEnDigits(raw);
    const m = line.match(MILLION_RE);
    if (m) {
      const v = Math.round(Number(m[1].replace(/[٫/]/, '.')) * 1_000_000);
      if (sane(v)) return v;
    }
    for (const x of line.matchAll(PRICE_RE)) {
      let v = Number(x[1].replace(/[,٬.،]/g, ''));
      if (x[2] === 'ریال') v = Math.round(v / 10);
      if (sane(v) && (x[2] || /قیمت|تومان|تومن|ریال/u.test(line))) return v;
    }
  }
  return null;
}

/** The shelf price: the model's number when sane, else read from the text lines. */
export function shelfPrice(v: Vision): number | null {
  const n = v.visible_price_toman;
  if (n && n >= 10_000 && n <= 3_000_000_000) return Math.round(n);
  return priceFromLines(v.text_lines);
}

// photo of a scene, a person, an animal … — not something to buy here
const NOT_A_PRODUCT = /^(?:منظره|طبیعت|آسمان|درخت|کوه|حیوان|گربه|سگ|انسان|شخص|آدم|غذا|ساختمان|خیابان|نامشخص|ناشناخته|هیچ|none|unknown|landscape|scenery|person|animal)/iu;

export function recognized(v: Vision): boolean {
  if (v.confidence < 0.45) return false;
  if (v.product_type && NOT_A_PRODUCT.test(v.product_type.trim())) return false;
  return Boolean(v.brand?.trim() || v.model?.trim() || v.product_type?.trim());
}

/** «گوشی موبایل سامسونگ Galaxy A17» → the product search text (type + brand + model, no repeats). */
export function visionQuery(v: Vision): string {
  const parts = [v.product_type, brandFa(v.brand), v.model].map((x) => x?.trim()).filter(Boolean) as string[];
  const seen = new Set<string>();
  const words: string[] = [];
  for (const w of parts.join(' ').split(/\s+/)) {
    const k = normalizeForSearch(w);
    if (!k || seen.has(k) || k === normalizeForSearch(v.brand ?? '§')) continue;
    seen.add(k);
    words.push(w);
  }
  return words.join(' ');
}

/** One line for the card: «سامسونگ Galaxy A17 (گوشی موبایل)». */
export function visionLabel(v: Vision): string {
  const name = [brandFa(v.brand), v.model].filter(Boolean).join(' ');
  return faText(name ? `${name}${v.product_type ? ` (${v.product_type})` : ''}` : (v.product_type ?? ''));
}
