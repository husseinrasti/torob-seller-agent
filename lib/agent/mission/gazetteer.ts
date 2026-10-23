import { normalizeForSearch } from '../../fa/normalize';

/**
 * Static Tehran gazetteer: neighbourhoods, squares and landmarks with approximate centroids (±500 m),
 * used when a place is not one of the dataset's 30 `location_label`s or a mall. No external geocoder.
 * `marker`: the name is also a common word («آزادی»، «انقلاب»), so it only counts after a place
 * marker («محدوده»، «نزدیک»، «میدان»…) when scanning a whole message.
 */
export type GazetteerEntry = { name: string; lat: number; lon: number; aliases?: string[]; marker?: boolean };

export const GAZETTEER: GazetteerEntry[] = [
  // north-west
  { name: 'سعادت‌آباد', lat: 35.7828, lon: 51.3745, aliases: ['سعادت آباد'] },
  { name: 'شهرک غرب', lat: 35.759, lon: 51.373, aliases: ['شهرک قدس'] },
  { name: 'فرحزاد', lat: 35.79, lon: 51.37 },
  { name: 'پونک', lat: 35.76, lon: 51.327 },
  { name: 'مرزداران', lat: 35.747, lon: 51.357 },
  { name: 'ستارخان', lat: 35.707, lon: 51.36 },
  { name: 'گیشا', lat: 35.733, lon: 51.383, aliases: ['کوی نصر'] },
  { name: 'جلال آل احمد', lat: 35.731, lon: 51.385 },
  { name: 'آریاشهر', lat: 35.711, lon: 51.346, aliases: ['آریا شهر'] },
  { name: 'صادقیه', lat: 35.718, lon: 51.333, aliases: ['میدان صادقیه', 'فلکه دوم صادقیه'] },
  { name: 'تهرانسر', lat: 35.697, lon: 51.24 },
  { name: 'اکباتان', lat: 35.708, lon: 51.306, aliases: ['شهرک اکباتان'] },
  { name: 'جنت‌آباد', lat: 35.752, lon: 51.307, aliases: ['جنت آباد'] },
  { name: 'شهران', lat: 35.77, lon: 51.295 },
  { name: 'اشرفی اصفهانی', lat: 35.746, lon: 51.33 },
  { name: 'بلوار فردوس', lat: 35.724, lon: 51.326, aliases: ['فردوس'] },
  { name: 'باغ فیض', lat: 35.7395, lon: 51.3156 },
  { name: 'کن', lat: 35.765, lon: 51.275, marker: true },
  { name: 'چیتگر', lat: 35.73, lon: 51.235 },
  { name: 'ایران مال', lat: 35.755, lon: 51.196 },
  { name: 'تیموری', lat: 35.702, lon: 51.348 },
  { name: 'طرشت', lat: 35.704, lon: 51.362 },
  { name: 'میدان آزادی', lat: 35.6997, lon: 51.338, aliases: ['آزادی', 'برج آزادی'], marker: true },
  { name: 'میدان توحید', lat: 35.705, lon: 51.371, aliases: ['توحید'], marker: true },
  { name: 'اوین', lat: 35.8, lon: 51.39 },
  { name: 'درکه', lat: 35.813, lon: 51.38 },
  { name: 'ولنجک', lat: 35.803, lon: 51.4 },
  // north
  { name: 'تجریش', lat: 35.8044, lon: 51.4337, aliases: ['میدان تجریش', 'شمیران'] },
  { name: 'ونک', lat: 35.7577, lon: 51.41, aliases: ['میدان ونک'] },
  { name: 'ملاصدرا', lat: 35.757, lon: 51.397, aliases: ['ملا صدرا'] },
  { name: 'جردن', lat: 35.774, lon: 51.42, aliases: ['آفریقا', 'بلوار آفریقا'] },
  { name: 'میرداماد', lat: 35.76, lon: 51.433 },
  { name: 'ظفر', lat: 35.768, lon: 51.427, aliases: ['دستگردی'], marker: true },
  { name: 'پارک ملت', lat: 35.781, lon: 51.412 },
  { name: 'محمودیه', lat: 35.798, lon: 51.413 },
  { name: 'زعفرانیه', lat: 35.8063, lon: 51.4208 },
  { name: 'الهیه', lat: 35.79, lon: 51.427 },
  { name: 'فرمانیه', lat: 35.794, lon: 51.47 },
  { name: 'نیاوران', lat: 35.815, lon: 51.472 },
  { name: 'کامرانیه', lat: 35.806, lon: 51.463 },
  { name: 'اقدسیه', lat: 35.803, lon: 51.485 },
  { name: 'قیطریه', lat: 35.793, lon: 51.446 },
  { name: 'چیذر', lat: 35.8, lon: 51.45 },
  { name: 'دروس', lat: 35.77, lon: 51.455 },
  { name: 'قلهک', lat: 35.775, lon: 51.444 },
  { name: 'ضرابخانه', lat: 35.782, lon: 51.458 },
  { name: 'پاسداران', lat: 35.77, lon: 51.465, marker: true },
  { name: 'نوبنیاد', lat: 35.788, lon: 51.478, aliases: ['میدان نوبنیاد'] },
  { name: 'ازگل', lat: 35.8, lon: 51.515 },
  { name: 'سوهانک', lat: 35.8, lon: 51.48 },
  { name: 'لویزان', lat: 35.772, lon: 51.504 },
  { name: 'هروی', lat: 35.765, lon: 51.48, aliases: ['میدان هروی'] },
  { name: 'پالادیوم', lat: 35.798, lon: 51.422 },
  { name: 'دربند', lat: 35.8106, lon: 51.4294 },
  { name: 'دزاشیب', lat: 35.803, lon: 51.4344 },
  { name: 'تاسیسات', lat: 35.808, lon: 51.46, marker: true },
  // centre-north
  { name: 'یوسف‌آباد', lat: 35.73, lon: 51.411, aliases: ['یوسف آباد'] },
  { name: 'امیرآباد', lat: 35.73, lon: 51.392, aliases: ['امیر آباد'] },
  { name: 'میدان آرژانتین', lat: 35.7385, lon: 51.4155, aliases: ['آرژانتین'] },
  { name: 'میدان ولیعصر', lat: 35.7125, lon: 51.4068, aliases: ['ولیعصر'], marker: true },
  { name: 'چهارراه ولیعصر', lat: 35.7008, lon: 51.4103 },
  { name: 'فاطمی', lat: 35.724, lon: 51.4, aliases: ['میدان فاطمی'] },
  { name: 'کشاورز', lat: 35.711, lon: 51.399, aliases: ['بلوار کشاورز'], marker: true },
  { name: 'کریمخان', lat: 35.714, lon: 51.418, aliases: ['کریم خان'] },
  { name: 'هفت‌تیر', lat: 35.7155, lon: 51.4255, aliases: ['هفت تیر', 'میدان هفت تیر'] },
  { name: 'مفتح', lat: 35.713, lon: 51.429 },
  { name: 'سهروردی', lat: 35.7305, lon: 51.4355, aliases: ['خیابان سهروردی', 'سهروردی شمالی'] },
  { name: 'قائم مقام', lat: 35.723, lon: 51.422 },
  { name: 'بهشتی', lat: 35.73, lon: 51.43, marker: true },
  { name: 'سیدخندان', lat: 35.741, lon: 51.444, aliases: ['سید خندان'] },
  { name: 'شریعتی', lat: 35.74, lon: 51.444, marker: true },
  { name: 'توانیر', lat: 35.751, lon: 51.413 },
  { name: 'خواجه نصیر', lat: 35.735, lon: 51.452 },
  { name: 'میدان انقلاب', lat: 35.7006, lon: 51.3913, aliases: ['انقلاب'], marker: true },
  { name: 'دانشگاه تهران', lat: 35.704, lon: 51.396 },
  { name: 'کارگر', lat: 35.706, lon: 51.388, marker: true },
  { name: 'پارک لاله', lat: 35.712, lon: 51.392 },
  { name: 'جمالزاده', lat: 35.703, lon: 51.399 },
  { name: 'بهجت‌آباد', lat: 35.716, lon: 51.406, aliases: ['بهجت آباد'] },
  // centre
  { name: 'جمهوری', lat: 35.6956, lon: 51.407, aliases: ['خیابان جمهوری'], marker: true },
  { name: 'لاله‌زار', lat: 35.6935, lon: 51.418, aliases: ['لاله زار'] },
  { name: 'منوچهری', lat: 35.695, lon: 51.419 },
  { name: 'حافظ', lat: 35.699, lon: 51.412, aliases: ['خیابان حافظ'], marker: true },
  { name: 'میدان فردوسی', lat: 35.7013, lon: 51.4205 },
  { name: 'میدان امام خمینی', lat: 35.6863, lon: 51.4206, aliases: ['توپخانه', 'میدان توپخانه', 'سپه'] },
  { name: 'میدان بهارستان', lat: 35.6919, lon: 51.4295 },
  { name: 'بازار بزرگ', lat: 35.675, lon: 51.423, aliases: ['بازار تهران', 'بازار بزرگ تهران'] },
  { name: 'ناصرخسرو', lat: 35.682, lon: 51.421, aliases: ['ناصر خسرو'] },
  { name: 'امین حضور', lat: 35.682, lon: 51.433 },
  { name: 'منیریه', lat: 35.683, lon: 51.404 },
  { name: 'نواب', lat: 35.683, lon: 51.385 },
  { name: 'مولوی', lat: 35.668, lon: 51.418 },
  { name: 'گمرک', lat: 35.672, lon: 51.399 },
  { name: 'راه‌آهن', lat: 35.658, lon: 51.401, aliases: ['راه آهن', 'میدان راه آهن'] },
  { name: 'شوش', lat: 35.661, lon: 51.43, aliases: ['میدان شوش'] },
  { name: 'میدان شهدا', lat: 35.687, lon: 51.446, aliases: ['شهدا'], marker: true },
  { name: 'میدان امام حسین', lat: 35.7016, lon: 51.4453, aliases: ['امام حسین'], marker: true },
  { name: 'میدان خراسان', lat: 35.673, lon: 51.448, aliases: ['خراسان'], marker: true },
  // east
  { name: 'نارمک', lat: 35.7375, lon: 51.5, aliases: ['هفت حوض'] },
  { name: 'تهران‌پارس', lat: 35.734, lon: 51.534, aliases: ['تهران پارس'] },
  { name: 'رسالت', lat: 35.744, lon: 51.475, aliases: ['میدان رسالت'], marker: true },
  { name: 'مجیدیه', lat: 35.742, lon: 51.49 },
  { name: 'حکیمیه', lat: 35.74, lon: 51.588 },
  { name: 'پیروزی', lat: 35.6857, lon: 51.4807, aliases: ['خیابان پیروزی'], marker: true },
  { name: 'نظام‌آباد', lat: 35.715, lon: 51.471, aliases: ['نظام آباد'] },
  { name: 'تهران‌نو', lat: 35.705, lon: 51.49, aliases: ['تهران نو'] },
  { name: 'سبلان', lat: 35.724, lon: 51.464 },
  { name: 'دماوند', lat: 35.71, lon: 51.48, aliases: ['خیابان دماوند'], marker: true },
  { name: 'افسریه', lat: 35.655, lon: 51.495 },
  { name: 'شمس آباد', lat: 35.744, lon: 51.517 },
  // south
  { name: 'شهرری', lat: 35.596, lon: 51.435, aliases: ['شهر ری'] },
  { name: 'نازی‌آباد', lat: 35.636, lon: 51.4, aliases: ['نازی آباد'] },
  { name: 'جوادیه', lat: 35.656, lon: 51.395 },
  { name: 'یافت‌آباد', lat: 35.66, lon: 51.33, aliases: ['یافت آباد'] },
  { name: 'خانی‌آباد', lat: 35.64, lon: 51.375, aliases: ['خانی آباد'] },
  { name: 'میدان قزوین', lat: 35.682, lon: 51.392, aliases: ['قزوین'], marker: true },
  { name: 'میدان رازی', lat: 35.676, lon: 51.397, aliases: ['رازی'], marker: true },
];

/** Generic place words that may precede a name («میدان ونک»، «خیابان جمهوری»). */
export const PLACE_PREFIXES = new Set(['میدان', 'خیابان', 'بلوار', 'چهارراه', 'محله', 'منطقه', 'شهرک', 'کوی', 'فلکه', 'ایستگاه', 'مترو', 'پل']);
/** Words that announce a place in a sentence («محدوده سعادت آباد»، «نزدیک تجریش»). */
export const PLACE_MARKERS = new Set(['محدوده', 'محدوده‌ی', 'نزدیک', 'نزدیکی', 'نزدیکای', 'اطراف', 'حوالی', 'توی', 'تو', 'در', 'سمت', 'طرف', 'طرفای', 'بر', 'منطقه', 'محله', 'حدود']);

/** Comparison key: normalized, no spaces/ZWNJ, «آ» → «ا» (so «سعادت آباد» = «سعادت‌آباد» = «سعادتاباد»). */
export function placeKey(text: string): string {
  return normalizeForSearch(text).replace(/[\s‌]+/g, '').replace(/آ/g, 'ا');
}

/** pg_trgm-style trigram similarity of two keys (|A∩B| / |A∪B|). */
export function trigramSimilarity(a: string, b: string): number {
  const grams = (s: string) => {
    const p = `  ${s} `;
    const out = new Set<string>();
    for (let i = 0; i + 3 <= p.length; i++) out.add(p.slice(i, i + 3));
    return out;
  };
  const A = grams(a);
  const B = grams(b);
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return inter / (A.size + B.size - inter || 1);
}

export type GazetteerHit = { entry: GazetteerEntry; score: number };

const INDEX: Map<string, GazetteerEntry> = (() => {
  const m = new Map<string, GazetteerEntry>();
  for (const e of GAZETTEER) for (const n of [e.name, ...(e.aliases ?? [])]) if (!m.has(placeKey(n))) m.set(placeKey(n), e);
  return m;
})();

/** Exact (spelling-insensitive) gazetteer lookup. */
export function gazetteerExact(text: string): GazetteerEntry | null {
  return INDEX.get(placeKey(text)) ?? null;
}

/** Fuzzy lookup (trigram ≥ threshold) for typos such as «سعادتاباد» or «تهرانپارس». */
export function gazetteerFuzzy(text: string, threshold = 0.45): GazetteerHit | null {
  const k = placeKey(text);
  if (k.length < 3) return null;
  let best: GazetteerHit | null = null;
  for (const [key, entry] of INDEX) {
    const s = trigramSimilarity(k, key);
    if (s >= threshold && (!best || s > best.score)) best = { entry, score: s };
  }
  return best;
}

/** Gazetteer keys with their entries, for scanning whole messages. */
export function gazetteerKeys(): Map<string, GazetteerEntry> {
  return INDEX;
}

/** Up to `limit` gazetteer names closest (by spelling) to a text — for «did you mean» chips. */
export function gazetteerSuggest(text: string, limit = 3): string[] {
  const k = placeKey(text);
  return [...new Set(GAZETTEER.map((e) => e.name))]
    .map((name) => ({ name, s: trigramSimilarity(k, placeKey(name)) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, limit)
    .map((x) => x.name);
}
