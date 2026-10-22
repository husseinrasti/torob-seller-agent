// Loads data/*.csv into PostgreSQL with all derived columns. Idempotent (truncate + reload).
// Usage: pnpm seed [--if-empty]
import './load-env';
import fs from 'node:fs';
import path from 'node:path';
import { once } from 'node:events';
import { parse } from 'csv-parse';
import { Pool, type PoolClient } from 'pg';
import { from as copyFrom } from 'pg-copy-streams';
import { normalizeFa, normalizeForSearch } from '../lib/fa/normalize';
import { parseMall } from '../lib/data/mall';
import { hoursKnown, type WeeklyHours } from '../lib/data/hours';
import {
  datasetAsOf,
  freshnessOf,
  isSanePrice,
  median,
  paymentFlags,
  priceAgeDays,
  priceFlagOf,
  warrantyInfo,
  type PaymentOption,
  type WarrantyRaw,
} from '../lib/data/quality';

const EXPECTED = { shops: 6476, products: 225903, offers: 331506 };
const DATA_DIR = process.env.DATA_DIR || './data';
const IF_EMPTY = process.argv.includes('--if-empty');

type Row = Record<string, string>;

const t0 = Date.now();
const log = (msg: string) => console.log(`[seed +${((Date.now() - t0) / 1000).toFixed(1)}s] ${msg}`);

function nul(v: string | undefined): string | null {
  return v === undefined || v === 'null' || v === '' ? null : v;
}
function json<T>(v: string | undefined): T | null {
  const s = nul(v);
  if (s === null) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}
function num(v: string | undefined): number | null {
  const s = nul(v);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

async function* readCsv(file: string): AsyncGenerator<Row> {
  const full = path.resolve(DATA_DIR, file);
  if (!fs.existsSync(full)) throw new Error(`missing ${full} — download the dataset into ${DATA_DIR}/ (see README)`);
  const parser = fs.createReadStream(full).pipe(parse({ columns: true, bom: true, relax_quotes: true }));
  for await (const row of parser) yield row as Row;
}

// --- COPY helpers ------------------------------------------------------------------

/** Marks a value for a Postgres text[] column (plain arrays/objects are written as JSON). */
class TextArray {
  constructor(readonly items: string[]) {}
}

type Cell = string | number | boolean | null | undefined | object;

function csvCell(v: Cell): string {
  if (v === null || v === undefined) return '';
  let s: string;
  if (v instanceof TextArray) {
    s = '{' + v.items.map((x) => '"' + x.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"').join(',') + '}';
  } else if (typeof v === 'object') s = JSON.stringify(v);
  else s = String(v);
  return '"' + s.replace(/"/g, '""') + '"';
}

class Copier {
  private buf: string[] = [];
  count = 0;
  private constructor(private stream: NodeJS.WritableStream) {}
  static async open(client: PoolClient, table: string, cols: string[]) {
    const stream = client.query(copyFrom(`COPY ${table} (${cols.join(',')}) FROM STDIN WITH (FORMAT csv)`));
    return new Copier(stream);
  }
  async push(values: Cell[]) {
    this.buf.push(values.map(csvCell).join(',') + '\n');
    this.count++;
    if (this.buf.length >= 2000) await this.flush();
  }
  private async flush() {
    if (!this.buf.length) return;
    const chunk = this.buf.join('');
    this.buf = [];
    if (!this.stream.write(chunk)) await once(this.stream, 'drain');
  }
  async close() {
    await this.flush();
    this.stream.end();
    await once(this.stream, 'finish');
  }
}

// --- derivations -------------------------------------------------------------------

const SEARCH_SPEC_KEYS = ['برند', 'مدل', 'رنگ', 'حافظه', 'رم', 'RAM', 'ظرفیت', 'توان', 'سایز', 'اندازه'];

function topSpecValues(specs: Array<{ key: string; value: string }> | null): string[] {
  if (!specs) return [];
  const out: string[] = [];
  for (const s of specs) {
    if (out.length >= 12) break;
    if (!s?.key || !s?.value || s.value.length > 40) continue;
    if (SEARCH_SPEC_KEYS.some((k) => s.key.includes(k))) out.push(s.value);
  }
  return out;
}

type ProductAgg = { sane: number[]; shops: Set<string>; offers: number; median: number | null; okPrices: number[] };

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    if (IF_EMPTY) {
      const r = await client.query('select exists(select 1 from products limit 1) as has');
      if (r.rows[0].has) {
        log('products already loaded — skipping (--if-empty)');
        return;
      }
    }
    const asOf = datasetAsOf();
    log(`DATA_DIR=${path.resolve(DATA_DIR)} DATASET_AS_OF=${asOf.toISOString()}`);

    // Pass A: offer aggregates per product and shop
    const prod = new Map<string, ProductAgg>();
    const shopOffers = new Map<string, number>();
    for await (const r of readCsv('offers.csv')) {
      let a = prod.get(r.product_id);
      if (!a) prod.set(r.product_id, (a = { sane: [], shops: new Set(), offers: 0, median: null, okPrices: [] }));
      a.offers++;
      a.shops.add(r.shop_id);
      const p = num(r.price_toman);
      if (isSanePrice(p)) a.sane.push(p);
      shopOffers.set(r.shop_id, (shopOffers.get(r.shop_id) ?? 0) + 1);
    }
    for (const a of prod.values()) {
      a.median = median(a.sane);
      a.okPrices = a.sane.filter((p) => priceFlagOf(p, a.median, a.sane.length) === 'ok');
    }
    log(`pass A: ${prod.size} products with offers, ${shopOffers.size} shops with offers`);

    await client.query('BEGIN');
    await client.query('TRUNCATE offers, products, shops, categories');

    // Pass B: shops
    const shopCategoryCount = new Map<string, number>();
    const shopCopy = await Copier.open(client, 'shops', [
      'shop_id', 'name', 'address', 'location_label', 'lat', 'lon', 'category_names', 'contacts', 'payment_options',
      'supports_fast_delivery', 'weekly_hours', 'instagram', 'website_url', 'mall_key', 'mall_name', 'floor_label',
      'floor_num', 'unit_label', 'unit_kind', 'has_offers', 'offer_count', 'has_installment', 'has_torobpay',
      'installment_in_person', 'torobpay_in_person', 'payment_providers', 'hours_known', 'geom_lat', 'geom_lon',
    ]);
    for await (const r of readCsv('shops.csv')) {
      const cats = json<string[]>(r.category_names) ?? [];
      for (const c of new Set(cats)) shopCategoryCount.set(c, (shopCategoryCount.get(c) ?? 0) + 1);
      const payment = json<PaymentOption[]>(r.payment_options) ?? [];
      const pf = paymentFlags(payment);
      const hours = json<WeeklyHours>(r.weekly_hours) ?? {};
      const mall = parseMall(r.address);
      const lat = num(r.lat)!;
      const lon = num(r.lon)!;
      const offerCount = shopOffers.get(r.shop_id) ?? 0;
      const fast = nul(r.supports_fast_delivery);
      await shopCopy.push([
        r.shop_id, r.name, nul(r.address), nul(r.location_label), lat, lon, cats, json(r.contacts), payment,
        fast === null ? null : fast === 'true', hours, nul(r.instagram), nul(r.website_url), mall.mall_key,
        mall.mall_name, mall.floor_label, mall.floor_num, mall.unit_label, mall.unit_kind, offerCount > 0, offerCount,
        pf.has_installment, pf.has_torobpay, pf.installment_in_person, pf.torobpay_in_person, new TextArray(pf.payment_providers),
        hoursKnown(hours), lat, lon,
      ]);
    }
    await shopCopy.close();
    log(`shops: ${shopCopy.count}`);

    // Pass P1: brand dictionary (only 25% of products have brand_name; infer the rest from titles)
    const brandFreq = new Map<string, Map<string, number>>();
    for await (const r of readCsv('products.csv')) {
      const b = nul(r.brand_name);
      if (!b) continue;
      const n = normalizeForSearch(b);
      if (n.length < 2) continue;
      let m = brandFreq.get(n);
      if (!m) brandFreq.set(n, (m = new Map()));
      m.set(b, (m.get(b) ?? 0) + 1);
    }
    const brandDisplay = new Map<string, string>();
    for (const [n, m] of brandFreq) {
      const total = [...m.values()].reduce((x, y) => x + y, 0);
      if (total < 5) continue;
      brandDisplay.set(n, [...m.entries()].sort((x, y) => y[1] - x[1])[0][0]);
    }
    log(`brands: ${brandDisplay.size} known`);
    const inferBrand = (titleNorm: string): string | null => {
      const words = titleNorm.split(' ');
      for (let i = 0; i < Math.min(words.length, 6); i++) {
        const two = i + 1 < words.length ? `${words[i]} ${words[i + 1]}` : null;
        if (two && brandDisplay.has(two)) return two;
        if (brandDisplay.has(words[i])) return words[i];
      }
      return null;
    };

    // Pass P2: products
    const productCategoryCount = new Map<string, number>();
    const productCopy = await Copier.open(client, 'products', [
      'product_id', 'persian_title', 'brand_name', 'category_name', 'model', 'image_urls', 'specs', 'title_norm',
      'search_text', 'brand_norm', 'brand_display', 'seller_count', 'offer_count', 'min_price', 'median_price',
      'primary_image',
    ]);
    for await (const r of readCsv('products.csv')) {
      const category = nul(r.category_name);
      if (category) productCategoryCount.set(category, (productCategoryCount.get(category) ?? 0) + 1);
      const images = json<string[]>(r.image_urls) ?? [];
      const specs = json<Array<{ key: string; section?: string; value: string }>>(r.specs);
      const titleNorm = normalizeForSearch(r.persian_title);
      const brand = nul(r.brand_name);
      const brandNorm = brand ? normalizeForSearch(brand) : inferBrand(titleNorm);
      const brandShown = brand ?? (brandNorm ? brandDisplay.get(brandNorm) ?? null : null);
      const model = nul(r.model);
      const zwnjFree = normalizeFa(r.persian_title).includes('‌')
        ? normalizeFa(r.persian_title).replace(/‌/g, '')
        : '';
      const searchText = [
        titleNorm,
        brandNorm,
        normalizeForSearch(category),
        normalizeForSearch(model),
        ...topSpecValues(specs).map(normalizeForSearch),
        zwnjFree,
      ]
        .filter(Boolean)
        .join(' ')
        .slice(0, 600);
      const a = prod.get(r.product_id);
      const okSorted = a ? [...a.okPrices].sort((x, y) => x - y) : [];
      await productCopy.push([
        r.product_id, r.persian_title, brand, category, model, images, specs, titleNorm, searchText, brandNorm,
        brandShown, a?.shops.size ?? 0, a?.offers ?? 0, okSorted[0] ?? null, median(okSorted), images[0] ?? null,
      ]);
    }
    await productCopy.close();
    log(`products: ${productCopy.count}`);

    // Pass D: offers
    const freshCount: Record<string, number> = {};
    const offerCopy = await Copier.open(client, 'offers', [
      'offer_id', 'product_id', 'shop_id', 'seller_title', 'description', 'price_toman', 'last_price_changed_at',
      'warranty', 'price_age_days', 'freshness', 'price_flag', 'warranty_provider', 'warranty_months',
      'warranty_text', 'has_warranty',
    ]);
    for await (const r of readCsv('offers.csv')) {
      const price = num(r.price_toman);
      const changed = nul(r.last_price_changed_at);
      const age = priceAgeDays(changed, asOf);
      const freshness = freshnessOf(age);
      freshCount[freshness] = (freshCount[freshness] ?? 0) + 1;
      const a = prod.get(r.product_id)!;
      const w = json<WarrantyRaw>(r.warranty);
      const wi = warrantyInfo(w);
      await offerCopy.push([
        r.offer_id, r.product_id, r.shop_id, nul(r.seller_title), nul(r.description), price, changed, w, age,
        freshness, priceFlagOf(price, a.median, a.sane.length), wi.provider, wi.months, wi.text, wi.has_warranty,
      ]);
    }
    await offerCopy.close();
    log(`offers: ${offerCopy.count} freshness=${JSON.stringify(freshCount)}`);

    // Categories (product categories ∪ shop activity categories)
    const catCopy = await Copier.open(client, 'categories', ['name', 'name_norm', 'product_count', 'shop_count']);
    const names = new Set([...productCategoryCount.keys(), ...shopCategoryCount.keys()]);
    for (const name of names) {
      await catCopy.push([name, normalizeForSearch(name), productCategoryCount.get(name) ?? 0, shopCategoryCount.get(name) ?? 0]);
    }
    await catCopy.close();
    log(`categories: ${catCopy.count}`);

    await client.query('COMMIT');
    await client.query('ANALYZE shops; ANALYZE products; ANALYZE offers; ANALYZE categories;');

    const counts = { shops: shopCopy.count, products: productCopy.count, offers: offerCopy.count };
    const bad = (Object.keys(EXPECTED) as Array<keyof typeof EXPECTED>).filter(
      (k) => Math.abs(counts[k] - EXPECTED[k]) / EXPECTED[k] > 0.01,
    );
    log(`done: ${JSON.stringify(counts)}`);
    if (bad.length) throw new Error(`row counts deviate >1% from expected ${JSON.stringify(EXPECTED)}: ${bad.join(', ')}`);
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
