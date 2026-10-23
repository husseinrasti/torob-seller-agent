import { describe, expect, it } from 'vitest';
import { isMission, mergeMission, parseMission } from './extract';
import { buildPlaceIndex, resolvePlace, scanLocation } from './geocode';
import { gazetteerExact, gazetteerFuzzy, placeKey, trigramSimilarity } from './gazetteer';
import { coverageRadii, widenUntil } from './coverage';
import { noRecommendationNote, pickRecommendation, verdictFor } from './verdict';
import { applyOverrides } from './run';
import type { MissionRow } from './types';

// a slice of the dataset's places: neighbourhood labels and malls (with a mall that shares a name)
const index = buildPlaceIndex([
  { name: 'فردوسی', kind: 'area', lat: 35.693, lon: 51.4202, norm: 'فردوسی' },
  { name: 'تجریش', kind: 'area', lat: 35.8061, lon: 51.43, norm: 'تجریش' },
  { name: 'آسمان', kind: 'area', lat: 35.7775, lon: 51.3537, norm: 'آسمان' },
  { name: 'پاساژ علاءالدین', kind: 'mall', lat: 35.695, lon: 51.4117, norm: 'علاءالدین' },
  { name: 'بازار تجریش', kind: 'mall', lat: 35.8054, lon: 51.4311, norm: 'تجریش' },
  { name: 'پاساژ فردوسی', kind: 'mall', lat: 35.7, lon: 51.42, norm: 'فردوسی' },
]);
const A17 = { id: 'product_d24b597176bdf2a82035dcc2', title: 'گوشی سامسونگ A17 4G' };
const parse = (t: string) => parseMission(t, { index, chosen: A17 });

describe('parseMission — Persian phrasings', () => {
  it('the failing example: band ±10%, Saadat Abad, delegated price/open checks', () => {
    const d = parse('من یه گوشی سامسونگ حدود قیمت ۵۰ میلیون تومن میخوام. محدوده سعادت آباد باشه. و خودت بپرس ببین قیمت‌هاشون آپدیت هست یا نه و اینکه الان باز هستند.');
    expect(d.mission.product).toEqual({ query: 'گوشی سامسونگ', brand: 'سامسونگ' });
    expect(d.mission.budget).toEqual({ min: 45_000_000, max: 55_000_000, mode: 'about' });
    expect(d.location?.place.name).toBe('سعادت‌آباد');
    expect(d.mission.conditions.open_now).toBe(true);
    expect(d.mission.verify).toMatchObject({ contact_sellers: true, price_freshness: true, hours: true });
    expect(isMission(d.mission)).toBe(true);
  });

  it('short version with «آپدیته» and «بازن؟»', () => {
    const d = parse('یه گوشی سامسونگ حدود ۵۰ میلیون میخوام، محدوده سعادت آباد، خودت بپرس قیمت‌ها آپدیته و الان بازن؟');
    expect(d.mission.product?.query).toBe('گوشی سامسونگ');
    expect(d.mission.verify.price_freshness).toBe(true);
    expect(d.mission.conditions.open_now).toBe(true);
  });

  it('cheapest + open only near a square', () => {
    const d = parse('هدفون بلوتوثی تا ۳ میلیون نزدیک میدان ولیعصر، فقط اونایی که الان بازن، ارزون‌ترین اول');
    expect(d.mission.budget).toEqual({ max: 3_000_000, mode: 'max' });
    expect(d.location?.place.name).toBe('میدان ولیعصر');
    expect(d.mission.intent).toBe('cheapest');
    expect(d.mission.conditions.open_now).toBe(true);
    expect(d.mission.product?.query).toBe('هدفون بلوتوثی');
    expect(isMission(d.mission)).toBe(true);
  });

  it('a model code inside a mall, with a call', () => {
    const d = parse('ارزون‌ترین A17 توی پاساژ علاءالدین کیه و موجود داره؟ زنگ بزن');
    expect(d.mission.product?.query).toBe('a17');
    expect(d.location?.place).toMatchObject({ name: 'پاساژ علاءالدین', kind: 'mall', radius_m: 300 });
    expect(d.mission.channel).toBe('call');
    expect(d.mission.verify).toMatchObject({ contact_sellers: true, availability: true });
  });

  it('range budget keeps spec numbers in the product; bare neighbourhood beats the mall of the same name', () => {
    const d = parse('یه پاوربانک ۲۰ هزار بین ۱ تا ۲ میلیون تجریش، قسطی باشه');
    expect(d.mission.budget).toEqual({ min: 1_000_000, max: 2_000_000, mode: 'range' });
    expect(d.mission.product?.query).toBe('پاوربانک 20 هزار');
    expect(d.location?.place).toMatchObject({ name: 'تجریش', kind: 'area' });
    expect(d.mission.conditions.installment).toBe(true);
  });

  it('near me + top 3 + plan', () => {
    const d = parse('گوشی سامسونگ تا ۶۰ میلیون نزدیک من، ۳ تا فروشنده بهتر رو پیگیری کن و برنامه مراجعه بده');
    expect(d.mission.location).toBeNull();
    expect(d.nearby).toBe(true);
    expect(d.mission.output).toEqual({ top_n: 3, want_plan: true });
    expect(d.mission.verify.contact_sellers).toBe(true);
    expect(d.mission.budget?.max).toBe(60_000_000);
  });

  it('a bare neighbourhood after a comma', () => {
    const d = parse('دوربین مداربسته برای مغازه، نارمک');
    expect(d.location?.place.name).toBe('نارمک');
    expect(d.mission.product?.query).toBe('دوربین مداربسته');
    expect(isMission(d.mission)).toBe(true);
  });

  it('a single goal is not a mission', () => {
    const d = parse('قهوه ساز خونگی نمیدونم کدوم، حدود ۵ میلیون');
    expect(d.mission.budget).toEqual({ min: 4_500_000, max: 5_500_000, mode: 'about' });
    expect(isMission(d.mission)).toBe(false);
    expect(isMission(parse('گوشی سامسونگ تا ۶۰ میلیون نزدیک من').mission)).toBe(false);
    expect(isMission(parse('چرا این اول شد؟').mission, { hasProductContext: true })).toBe(false);
    expect(isMission(parse('فقط اونایی که الان بازن').mission, { hasProductContext: true })).toBe(false);
  });

  it('«همون گوشی قبلی» uses the chosen product; «فردوسی» is the neighbourhood', () => {
    const d = parse('همون گوشی قبلی رو این بار تو فردوسی چک کن');
    expect(d.mission.product).toEqual({ query: A17.title, product_id: A17.id });
    expect(d.location?.place).toMatchObject({ name: 'فردوسی', kind: 'area' });
    expect(isMission(d.mission)).toBe(true);
  });

  it('minimum budget («از … به بالا») and a gazetteer square', () => {
    const d = parse('لپ تاپ از ۳۰ میلیون به بالا نزدیک ونک');
    expect(d.mission.budget).toEqual({ min: 30_000_000, mode: 'min' });
    expect(d.location?.place.name).toBe('ونک');
    expect(d.mission.product?.query).toBe('لپ تاپ');
  });

  it('«تقریباً» and a spelling variant of the place', () => {
    const d = parse('تقریباً ۲۰ میلیون یه تبلت میخوام تو سعادتاباد');
    expect(d.mission.budget).toEqual({ min: 18_000_000, max: 22_000_000, mode: 'about' });
    expect(d.location?.place.name).toBe('سعادت‌آباد');
  });

  it('brand, «بین … و …» and an open-hours check', () => {
    const d = parse('هدفون انکر بین ۲ و ۴ میلیون، ببین کدوم مغازه‌ها الان باز هستند');
    expect(d.mission.budget).toEqual({ min: 2_000_000, max: 4_000_000, mode: 'range' });
    expect(d.mission.product).toEqual({ query: 'هدفون انکر', brand: 'انکر' });
    expect(d.mission.verify.hours).toBe(true);
    expect(isMission(d.mission)).toBe(true);
  });

  it('«حوالی ۵ میلیون» is a budget; «میدان انقلاب» a place; radius in km', () => {
    const d = parse('اسپیکر جی بی ال حوالی ۵ میلیون، اطراف میدان انقلاب تا ۲ کیلومتری');
    expect(d.mission.budget?.mode).toBe('about');
    expect(d.location?.place.name).toBe('میدان انقلاب');
    expect(d.mission.location?.radius_m).toBe(2000);
    expect(d.mission.product?.brand).toBe('جی بی ال');
  });

  it('common words are places only after a marker', () => {
    expect(parse('گوشی با آزادی کامل انتخاب کن').location).toBeNull();
    expect(parse('گوشی نزدیک آزادی').location?.place.name).toBe('میدان آزادی');
  });

  it('LLM fills product words; rules keep numbers and checks', () => {
    const rules = parse('یه چیزی برای عکاسی حدود ۴۰ میلیون، محدوده ونک، خودت بپرس').mission;
    const merged = mergeMission(rules, {
      product_query: 'دوربین عکاسی',
      brand: null,
      category_hint: 'دوربین عکاسی',
      budget_min_toman: 1,
      budget_max_toman: 2,
      budget_mode: 'range',
      location_text: 'تجریش',
      radius_m: null,
      open_now: false,
      installment: false,
      torobpay: false,
      fast_delivery: false,
      warranty: true,
      verify_price_freshness: false,
      verify_contact_sellers: false,
      verify_availability: true,
      verify_hours: false,
      top_n: null,
      want_plan: false,
      want_compare: false,
      intent: 'balanced',
      channel: 'message',
    });
    expect(merged.product?.query).toBe('دوربین عکاسی');
    expect(merged.budget).toEqual({ min: 36_000_000, max: 44_000_000, mode: 'about' });
    expect(merged.location?.text).toBe('ونک');
    expect(merged.conditions.warranty).toBe(true);
    expect(merged.verify).toMatchObject({ contact_sellers: true, availability: true });
  });
});

describe('gazetteer and geocoding', () => {
  it('spelling variants map to the same point', () => {
    expect(placeKey('سعادت آباد')).toBe(placeKey('سعادت‌آباد'));
    expect(placeKey('سعادتاباد')).toBe(placeKey('سعادت‌آباد'));
    const a = gazetteerExact('سعادت آباد');
    expect(a?.name).toBe('سعادت‌آباد');
    expect(gazetteerExact('سعادت‌آباد')).toBe(a);
    expect(gazetteerExact('سعادتاباد')).toBe(a);
    expect(gazetteerFuzzy('سعادت ابادد')?.entry).toBe(a);
  });

  it('trigram similarity behaves like pg_trgm', () => {
    expect(trigramSimilarity('نارمک', 'نارمک')).toBe(1);
    expect(trigramSimilarity('تهرانپارس', 'تهرانپارص')).toBeGreaterThan(0.45);
    expect(trigramSimilarity('ونک', 'پونک')).toBeLessThan(0.45);
  });

  it('resolves malls, dataset labels, gazetteer and typos; unknown → null', () => {
    expect(resolvePlace('پاساژ علاءالدین', index)?.kind).toBe('mall');
    expect(resolvePlace('علاالدین', index)?.name).toBe('پاساژ علاءالدین');
    expect(resolvePlace('بازار تجریش', index)?.kind).toBe('mall');
    expect(resolvePlace('تجریش', index)?.kind).toBe('area');
    expect(resolvePlace('نزدیک شهرک غرب', index)?.name).toBe('شهرک غرب');
    expect(resolvePlace('تهرانپارص', index)?.name).toBe('تهران‌پارس');
    expect(resolvePlace('ناکجاآباد خیالی', index)).toBeNull();
  });

  it('scanLocation reports the span including the marker', () => {
    const m = scanLocation('گوشی سامسونگ محدوده سعادت آباد باشه', index);
    expect(m?.phrase).toBe('سعادت آباد');
    expect(m?.span).toEqual([2, 5]);
  });
});

describe('coverage loop', () => {
  it('tries wider radii until 3 sellers', async () => {
    expect(coverageRadii(1000)).toEqual([1000, 2000, 3000, 5000, 8000]);
    expect(coverageRadii(300)).toEqual([300, 1000, 2000, 3000, 5000, 8000]);
    const counts: Record<number, number> = { 1000: 0, 2000: 0, 3000: 2, 5000: 4, 8000: 9 };
    const r = await widenUntil(1000, async (m) => Array.from({ length: counts[m] }, (_, i) => i));
    expect(r.used).toBe(5000);
    expect(r.rows).toHaveLength(4);
    expect(r.inRequested).toBe(0);
    expect(r.tried.map((t) => t.sellers)).toEqual([0, 0, 2, 4]);
  });

  it('keeps the widest radius when it never reaches the target', async () => {
    const r = await widenUntil(1000, async (m) => (m >= 3000 ? [1] : []));
    expect(r.used).toBe(8000);
    expect(r.rows).toEqual([1]);
  });
});

const row = (o: Partial<MissionRow>): MissionRow => ({
  offer_id: 'o1',
  shop_id: 's1',
  product_id: 'p1',
  shop_name: 'فروشگاه',
  product_title: 'کالا',
  price: 50_000_000,
  price_flag: 'ok',
  freshness: 'fresh',
  price_age_days: 1,
  open: { known: true, open: true, label: 'باز است' },
  distance_m: 500,
  lat: 35.7,
  lon: 51.4,
  mall: null,
  followup: null,
  verdict: 'ok',
  verdict_reason: '',
  ...o,
});
const band = { min: 45_000_000, max: 55_000_000 };

describe('verdict rules', () => {
  it('recommended: in band + fresh/confirmed + open (or hours unknown)', () => {
    expect(verdictFor(row({}), band).verdict).toBe('recommended');
    expect(verdictFor(row({ freshness: 'stale', price_age_days: 60, followup: { id: 'f', status: 'confirmed', new_price: null, replied_at: null } }), band).verdict).toBe('recommended');
    expect(verdictFor(row({ open: { known: false, open: null, label: 'ثبت نشده' } }), band).verdict).toBe('recommended');
  });

  it('avoid: out of stock, suspicious price, closed for the rest of the day', () => {
    expect(verdictFor(row({ followup: { id: 'f', status: 'out_of_stock', new_price: null, replied_at: null } }), band).verdict).toBe('avoid');
    expect(verdictFor(row({ price_flag: 'suspicious_low' }), band).verdict).toBe('avoid');
    expect(verdictFor(row({ open: { known: true, open: false, label: 'تعطیل' } }), band).verdict).toBe('avoid');
  });

  it('closed but opening later today is not avoided; out of band is ok; stale & unchecked is unknown', () => {
    expect(verdictFor(row({ open: { known: true, open: false, label: 'بسته', opensAt: '17:00' } }), band).verdict).toBe('ok');
    expect(verdictFor(row({ price: 60_000_000 }), band).verdict).toBe('ok');
    expect(verdictFor(row({ freshness: 'stale', price_age_days: 45 }), band).verdict).toBe('unknown');
    expect(verdictFor(row({ freshness: 'unknown', price_age_days: null }), band).verdict).toBe('unknown');
  });

  it('a quoted new price is judged against the band', () => {
    const changed = (p: number) => row({ followup: { id: 'f', status: 'price_changed', new_price: p, replied_at: null } });
    expect(verdictFor(changed(54_000_000), band).verdict).toBe('recommended');
    expect(verdictFor(changed(58_000_000), band).verdict).toBe('ok');
  });

  it('recommendation: cheapest for «ارزان‌ترین», else the first; explicit note otherwise', () => {
    const rows = [row({ offer_id: 'a', price: 54_000_000 }), row({ offer_id: 'b', price: 46_000_000 })].map((r) => ({ ...r, ...verdictFor(r, band) }));
    expect(pickRecommendation(rows, 'cheapest')?.offer_id).toBe('b');
    expect(pickRecommendation(rows, 'balanced')?.offer_id).toBe('a');
    expect(noRecommendationNote([], band)).toMatch(/^پیشنهادی ندارم چون/);
    const outside = [row({ price: 44_000_000 })].map((r) => ({ ...r, ...verdictFor(r, band) }));
    expect(noRecommendationNote(outside, band)).toMatch(/داخل بازه/);
    const oos = [row({ followup: { id: 'f', status: 'out_of_stock', new_price: null, replied_at: null } })].map((r) => ({ ...r, ...verdictFor(r, band) }));
    expect(noRecommendationNote(oos, band)).toMatch(/کنار گذاشته شد/);
  });
});

describe('chip edits', () => {
  it('drop / radius / place overrides', () => {
    const m = parse('یه پاوربانک بین ۱ تا ۲ میلیون تجریش، قسطی باشه، الان باز باشه').mission;
    const n = applyOverrides(m, { drop: ['installment', 'hours'], radius_m: 5000 });
    expect(n.conditions.installment).toBeUndefined();
    expect(n.conditions.open_now).toBeUndefined();
    expect(n.location).toEqual({ text: 'تجریش', radius_m: 5000 });
    expect(applyOverrides(m, { location_text: 'فردوسی' }).location).toEqual({ text: 'فردوسی' });
    expect(applyOverrides(m, { drop: ['budget'] }).budget).toBeNull();
  });
});
