CREATE TABLE "categories" (
	"name" text PRIMARY KEY NOT NULL,
	"name_norm" text NOT NULL,
	"product_count" integer DEFAULT 0 NOT NULL,
	"shop_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "followups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid,
	"offer_id" text NOT NULL,
	"shop_id" text NOT NULL,
	"product_id" text NOT NULL,
	"channel" text NOT NULL,
	"question" text,
	"status" text NOT NULL,
	"new_price" bigint,
	"transcript" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "offers" (
	"offer_id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"shop_id" text NOT NULL,
	"seller_title" text,
	"description" text,
	"price_toman" bigint,
	"last_price_changed_at" timestamp with time zone,
	"warranty" jsonb,
	"price_age_days" integer,
	"freshness" text NOT NULL,
	"price_flag" text NOT NULL,
	"warranty_provider" text,
	"warranty_months" integer,
	"warranty_text" text,
	"has_warranty" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"product_id" text PRIMARY KEY NOT NULL,
	"persian_title" text NOT NULL,
	"brand_name" text,
	"category_name" text,
	"model" text,
	"image_urls" jsonb,
	"specs" jsonb,
	"title_norm" text NOT NULL,
	"search_text" text NOT NULL,
	"brand_norm" text,
	"brand_display" text,
	"seller_count" integer DEFAULT 0 NOT NULL,
	"offer_count" integer DEFAULT 0 NOT NULL,
	"min_price" bigint,
	"median_price" bigint,
	"primary_image" text
);
--> statement-breakpoint
CREATE TABLE "shops" (
	"shop_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"location_label" text,
	"lat" double precision NOT NULL,
	"lon" double precision NOT NULL,
	"category_names" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"contacts" jsonb,
	"payment_options" jsonb,
	"supports_fast_delivery" boolean,
	"weekly_hours" jsonb,
	"instagram" text,
	"website_url" text,
	"mall_key" text,
	"mall_name" text,
	"floor_label" text,
	"floor_num" integer,
	"unit_label" text,
	"unit_kind" text,
	"has_offers" boolean DEFAULT false NOT NULL,
	"offer_count" integer DEFAULT 0 NOT NULL,
	"has_installment" boolean DEFAULT false NOT NULL,
	"has_torobpay" boolean DEFAULT false NOT NULL,
	"installment_in_person" boolean DEFAULT false NOT NULL,
	"torobpay_in_person" boolean DEFAULT false NOT NULL,
	"payment_providers" text[] DEFAULT '{}'::text[] NOT NULL,
	"hours_known" boolean DEFAULT false NOT NULL,
	"geom_lat" double precision,
	"geom_lon" double precision
);
--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_product_id_products_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("product_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "offers" ADD CONSTRAINT "offers_shop_id_shops_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."shops"("shop_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "categories_name_trgm_idx" ON "categories" USING gin ("name_norm" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "followups_session_idx" ON "followups" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "offers_product_idx" ON "offers" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "offers_shop_idx" ON "offers" USING btree ("shop_id");--> statement-breakpoint
CREATE INDEX "products_title_trgm_idx" ON "products" USING gin ("title_norm" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "products_search_trgm_idx" ON "products" USING gin ("search_text" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "products_category_idx" ON "products" USING btree ("category_name");--> statement-breakpoint
CREATE INDEX "shops_lat_lon_idx" ON "shops" USING btree ("lat","lon");--> statement-breakpoint
CREATE INDEX "shops_mall_key_idx" ON "shops" USING btree ("mall_key");--> statement-breakpoint
CREATE INDEX "shops_category_names_idx" ON "shops" USING gin ("category_names");