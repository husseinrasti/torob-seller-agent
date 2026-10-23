import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

// Column names are snake_case in both TS and SQL so raw search SQL reads the same as the schema.

export const shops = pgTable(
  'shops',
  {
    shop_id: text('shop_id').primaryKey(),
    name: text('name').notNull(),
    address: text('address'),
    location_label: text('location_label'),
    lat: doublePrecision('lat').notNull(),
    lon: doublePrecision('lon').notNull(),
    category_names: jsonb('category_names').$type<string[]>().notNull().default([]),
    contacts: jsonb('contacts'),
    payment_options: jsonb('payment_options'),
    supports_fast_delivery: boolean('supports_fast_delivery'),
    weekly_hours: jsonb('weekly_hours'),
    instagram: text('instagram'),
    website_url: text('website_url'),
    // derived
    mall_key: text('mall_key'),
    mall_name: text('mall_name'),
    floor_label: text('floor_label'),
    floor_num: integer('floor_num'),
    unit_label: text('unit_label'),
    unit_kind: text('unit_kind'),
    has_offers: boolean('has_offers').notNull().default(false),
    offer_count: integer('offer_count').notNull().default(0),
    has_installment: boolean('has_installment').notNull().default(false),
    has_torobpay: boolean('has_torobpay').notNull().default(false),
    installment_in_person: boolean('installment_in_person').notNull().default(false),
    torobpay_in_person: boolean('torobpay_in_person').notNull().default(false),
    payment_providers: text('payment_providers').array().notNull().default(sql`'{}'::text[]`),
    hours_known: boolean('hours_known').notNull().default(false),
    geom_lat: doublePrecision('geom_lat'),
    geom_lon: doublePrecision('geom_lon'),
  },
  (t) => [
    index('shops_lat_lon_idx').on(t.lat, t.lon),
    index('shops_mall_key_idx').on(t.mall_key),
    index('shops_category_names_idx').using('gin', t.category_names),
  ],
);

export const products = pgTable(
  'products',
  {
    product_id: text('product_id').primaryKey(),
    persian_title: text('persian_title').notNull(),
    brand_name: text('brand_name'),
    category_name: text('category_name'),
    model: text('model'),
    image_urls: jsonb('image_urls').$type<string[]>(),
    specs: jsonb('specs').$type<Array<{ key: string; section?: string; value: string }>>(),
    // derived
    title_norm: text('title_norm').notNull(),
    search_text: text('search_text').notNull(),
    brand_norm: text('brand_norm'),
    brand_display: text('brand_display'),
    seller_count: integer('seller_count').notNull().default(0),
    offer_count: integer('offer_count').notNull().default(0),
    min_price: bigint('min_price', { mode: 'number' }),
    median_price: bigint('median_price', { mode: 'number' }),
    primary_image: text('primary_image'),
  },
  (t) => [
    index('products_title_trgm_idx').using('gin', t.title_norm.op('gin_trgm_ops')),
    index('products_search_trgm_idx').using('gin', t.search_text.op('gin_trgm_ops')),
    index('products_category_idx').on(t.category_name),
  ],
);

export const offers = pgTable(
  'offers',
  {
    offer_id: text('offer_id').primaryKey(),
    product_id: text('product_id')
      .notNull()
      .references(() => products.product_id),
    shop_id: text('shop_id')
      .notNull()
      .references(() => shops.shop_id),
    seller_title: text('seller_title'),
    description: text('description'),
    price_toman: bigint('price_toman', { mode: 'number' }),
    last_price_changed_at: timestamp('last_price_changed_at', { withTimezone: true }),
    warranty: jsonb('warranty'),
    // derived
    price_age_days: integer('price_age_days'),
    freshness: text('freshness').notNull().$type<'fresh' | 'recent' | 'stale' | 'unknown'>(),
    price_flag: text('price_flag').notNull().$type<'ok' | 'suspicious_low' | 'suspicious_high' | 'missing'>(),
    warranty_provider: text('warranty_provider'),
    warranty_months: integer('warranty_months'),
    warranty_text: text('warranty_text'),
    has_warranty: boolean('has_warranty').notNull().default(false),
  },
  (t) => [index('offers_product_idx').on(t.product_id), index('offers_shop_idx').on(t.shop_id)],
);

export const categories = pgTable(
  'categories',
  {
    name: text('name').primaryKey(),
    name_norm: text('name_norm').notNull(),
    product_count: integer('product_count').notNull().default(0),
    shop_count: integer('shop_count').notNull().default(0),
  },
  (t) => [index('categories_name_trgm_idx').using('gin', t.name_norm.op('gin_trgm_ops'))],
);

/** Name-only accounts (no password) so chats and memory can be kept per person. */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  /** normalized name used for login matching */
  name_key: text('name_key').notNull().unique(),
  /** cross-chat memory: usual location, recent searches/products (see lib/agent/memory.ts) */
  memory: jsonb('memory').notNull().default({}),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  last_seen_at: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
});

/** One row per chat: its agent state, its UI messages and its owner. */
export const sessions = pgTable(
  'sessions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    user_id: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    title: text('title'),
    state: jsonb('state').notNull().default({}),
    messages: jsonb('messages').notNull().default([]),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('sessions_user_updated_idx').on(t.user_id, t.updatedAt)],
);

export const followups = pgTable(
  'followups',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    session_id: uuid('session_id'),
    offer_id: text('offer_id').notNull(),
    shop_id: text('shop_id').notNull(),
    product_id: text('product_id').notNull(),
    channel: text('channel').notNull().$type<'message' | 'call'>(),
    question: text('question'),
    status: text('status')
      .notNull()
      .$type<'pending' | 'contacting' | 'confirmed' | 'out_of_stock' | 'price_changed' | 'no_answer'>(),
    new_price: bigint('new_price', { mode: 'number' }),
    transcript: jsonb('transcript'),
    created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    /** when the simulated reply "arrives" */
    due_at: timestamp('due_at', { withTimezone: true }).notNull(),
    resolved_at: timestamp('resolved_at', { withTimezone: true }),
  },
  (t) => [index('followups_session_idx').on(t.session_id)],
);

export const plans = pgTable('plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  session_id: uuid('session_id'),
  payload: jsonb('payload').notNull(),
  created_at: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

/** «بورس‌ها»: derived commercial clusters (+ curated bazaars), rebuilt by the seed / `pnpm hubs` (lib/data/hubs.ts). */
export const hubs = pgTable('hubs', {
  hub_id: text('hub_id').primaryKey(),
  name: text('name').notNull(),
  source: text('source').notNull(),
  lat: doublePrecision('lat').notNull(),
  lon: doublePrecision('lon').notNull(),
  radius_m: integer('radius_m').notNull(),
  families: jsonb('families').$type<string[]>().notNull(),
  family_counts: jsonb('family_counts').notNull(),
  shop_count: integer('shop_count').notNull(),
  listed_count: integer('listed_count').notNull(),
  category_only_count: integer('category_only_count').notNull(),
  hours_profile: jsonb('hours_profile'),
  typical_hours: jsonb('typical_hours'),
  note: text('note'),
  malls: jsonb('malls').$type<string[]>().notNull().default([]),
  street: text('street'),
  built_at: timestamp('built_at', { withTimezone: true }).notNull().defaultNow(),
});
