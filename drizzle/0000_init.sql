CREATE SCHEMA IF NOT EXISTS "pokedex";
--> statement-breakpoint
CREATE TYPE "pokedex"."condition" AS ENUM('NM', 'SP', 'MP', 'HP', 'D');--> statement-breakpoint
CREATE TYPE "pokedex"."language" AS ENUM('EN', 'JP', 'PT');--> statement-breakpoint
CREATE TYPE "pokedex"."removal_reason" AS ENUM('SOLD', 'TRADED', 'OTHER');--> statement-breakpoint
CREATE TYPE "pokedex"."variant" AS ENUM('normal', 'reverse', 'holo', 'firstEdition');--> statement-breakpoint
CREATE TABLE "pokedex"."card_prices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"card_id" text NOT NULL,
	"variant" "pokedex"."variant" NOT NULL,
	"source" text NOT NULL,
	"field" text NOT NULL,
	"currency" text NOT NULL,
	"minor" integer NOT NULL,
	"price_lang" text NOT NULL,
	"source_updated_at" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "card_prices_minor_ck" CHECK ("pokedex"."card_prices"."minor" > 0)
);
--> statement-breakpoint
CREATE TABLE "pokedex"."cards" (
	"id" text PRIMARY KEY NOT NULL,
	"catalog_lang" text NOT NULL,
	"name" text NOT NULL,
	"set_id" text NOT NULL,
	"set_name" text,
	"local_id" text NOT NULL,
	"rarity" text,
	"image_base" text,
	"dex_id" integer,
	"variants" jsonb NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pokedex"."collection_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"card_id" text NOT NULL,
	"variant" "pokedex"."variant" NOT NULL,
	"condition" "pokedex"."condition" NOT NULL,
	"owned_language" "pokedex"."language" NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"paid_cents" integer,
	"manual_cents" integer,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"removed_at" timestamp with time zone,
	"removed_reason" "pokedex"."removal_reason",
	"sold_cents" integer,
	CONSTRAINT "collection_quantity_ck" CHECK ("pokedex"."collection_items"."quantity" >= 1 AND "pokedex"."collection_items"."quantity" <= 9999),
	CONSTRAINT "collection_money_ck" CHECK (("pokedex"."collection_items"."paid_cents" IS NULL OR "pokedex"."collection_items"."paid_cents" >= 0) AND ("pokedex"."collection_items"."manual_cents" IS NULL OR "pokedex"."collection_items"."manual_cents" >= 0) AND ("pokedex"."collection_items"."sold_cents" IS NULL OR "pokedex"."collection_items"."sold_cents" >= 0))
);
--> statement-breakpoint
CREATE TABLE "pokedex"."fx_rates" (
	"pair" text PRIMARY KEY NOT NULL,
	"rate_micro" integer NOT NULL,
	"source_date" timestamp with time zone,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pokedex"."rate_limits" (
	"key" text PRIMARY KEY NOT NULL,
	"count" integer NOT NULL,
	"window_start" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pokedex"."sets_cache" (
	"id" text NOT NULL,
	"lang" text NOT NULL,
	"name" text NOT NULL,
	"card_count" integer,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sets_cache_id_lang_pk" PRIMARY KEY("id","lang")
);
--> statement-breakpoint
CREATE TABLE "pokedex"."user_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"factors" jsonb NOT NULL,
	"use_cardmarket_fallback" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pokedex"."users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"disabled_at" timestamp with time zone,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "pokedex"."card_prices" ADD CONSTRAINT "card_prices_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "pokedex"."cards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pokedex"."collection_items" ADD CONSTRAINT "collection_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "pokedex"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pokedex"."collection_items" ADD CONSTRAINT "collection_items_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "pokedex"."cards"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pokedex"."user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "pokedex"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "card_prices_unique" ON "pokedex"."card_prices" USING btree ("card_id","variant","source");--> statement-breakpoint
CREATE INDEX "collection_items_user_idx" ON "pokedex"."collection_items" USING btree ("user_id");