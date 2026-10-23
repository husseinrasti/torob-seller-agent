CREATE TABLE "hubs" (
	"hub_id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"source" text NOT NULL,
	"lat" double precision NOT NULL,
	"lon" double precision NOT NULL,
	"radius_m" integer NOT NULL,
	"families" jsonb NOT NULL,
	"family_counts" jsonb NOT NULL,
	"shop_count" integer NOT NULL,
	"listed_count" integer NOT NULL,
	"category_only_count" integer NOT NULL,
	"hours_profile" jsonb,
	"typical_hours" jsonb,
	"note" text,
	"malls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"street" text,
	"built_at" timestamp with time zone DEFAULT now() NOT NULL
);
