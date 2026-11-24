import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgSchema, primaryKey, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";

/** Schema próprio: o mesmo banco Neon hospeda outros apps, que não podem ser tocados. */
export const pokedex = pgSchema("pokedex");

export const conditionEnum = pokedex.enum("condition", ["NM", "SP", "MP", "HP", "D"]);
export const languageEnum = pokedex.enum("language", ["EN", "JP", "PT"]);
export const variantEnum = pokedex.enum("variant", ["normal", "reverse", "holo", "firstEdition"]);
export const removalReasonEnum = pokedex.enum("removal_reason", ["SOLD", "TRADED", "OTHER"]);

/** Cada pessoa tem a sua coleção. Sem cadastro público por enquanto: o usuário é criado por script. */
export const users = pokedex.table("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  /** minúsculas, usado no login */
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  /** preenchido = conta desativada (não entra) */
  disabledAt: timestamp("disabled_at", { withTimezone: true }),
});

export interface Factors {
  /** basis points: 10000 = 1,00 */
  conditions: Record<"NM" | "SP" | "MP" | "HP" | "D", number>;
  languages: Record<"EN" | "JP" | "PT", number>;
}

export const userSettings = pokedex.table("user_settings", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  factors: jsonb("factors").$type<Factors>().notNull(),
  /** sem preço em USD (TCGplayer), usar o do Cardmarket (EUR) convertido? */
  useCardmarketFallback: boolean("use_cardmarket_fallback").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ───────────── catálogo e preços (globais: compartilhados por todos os usuários) ─────────────

export const cards = pokedex.table("cards", {
  /** id da TCGdex (ex.: "swsh1-30") */
  id: text("id").primaryKey(),
  /** idioma do catálogo em que a carta foi encontrada (pt|en|ja) */
  catalogLang: text("catalog_lang").notNull(),
  name: text("name").notNull(),
  setId: text("set_id").notNull(),
  setName: text("set_name"),
  localId: text("local_id").notNull(),
  rarity: text("rarity"),
  /** URL base da imagem, SEM sufixo (o sufixo /low.webp ou /high.webp é colocado na hora de exibir) */
  imageBase: text("image_base"),
  dexId: integer("dex_id"),
  variants: jsonb("variants").$type<Record<"normal" | "reverse" | "holo" | "firstEdition", boolean>>().notNull(),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

export const cardPrices = pokedex.table(
  "card_prices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    cardId: text("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
    variant: variantEnum("variant").notNull(),
    /** tcgplayer (USD) | cardmarket (EUR) */
    source: text("source").notNull(),
    /** campo usado: marketPrice | trend | avg */
    field: text("field").notNull(),
    currency: text("currency").notNull(),
    /** centésimos da moeda de origem (nunca float) */
    minor: integer("minor").notNull(),
    /** de que idioma do catálogo veio o preço (a PT às vezes vem sem preço e usa a EN do mesmo id) */
    priceLang: text("price_lang").notNull(),
    sourceUpdatedAt: timestamp("source_updated_at", { withTimezone: true }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("card_prices_unique").on(t.cardId, t.variant, t.source),
    check("card_prices_minor_ck", sql`${t.minor} > 0`),
  ],
);

export const setsCache = pokedex.table(
  "sets_cache",
  {
    id: text("id").notNull(),
    lang: text("lang").notNull(),
    name: text("name").notNull(),
    cardCount: integer("card_count"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.id, t.lang] })],
);

export const fxRates = pokedex.table("fx_rates", {
  /** "USD-BRL" | "EUR-BRL" */
  pair: text("pair").primaryKey(),
  /** taxa x 1.000.000 (inteiro) */
  rateMicro: integer("rate_micro").notNull(),
  sourceDate: timestamp("source_date", { withTimezone: true }),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
});

// ───────────── coleção (do usuário) ─────────────

export const collectionItems = pokedex.table(
  "collection_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    cardId: text("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "restrict" }),
    variant: variantEnum("variant").notNull(),
    condition: conditionEnum("condition").notNull(),
    /** idioma da carta FÍSICA que a pessoa tem (separado do idioma do catálogo) */
    ownedLanguage: languageEnum("owned_language").notNull(),
    quantity: integer("quantity").notNull().default(1),
    /** quanto pagou, em centavos de R$ (opcional) */
    paidCents: integer("paid_cents"),
    /** valor manual em centavos de R$: vence o estimado */
    manualCents: integer("manual_cents"),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    /** exclusão lógica: carta vendida/trocada sai da coleção e do total, mas fica no histórico */
    removedAt: timestamp("removed_at", { withTimezone: true }),
    removedReason: removalReasonEnum("removed_reason"),
    /** quanto recebeu na venda, em centavos de R$ (opcional) */
    soldCents: integer("sold_cents"),
  },
  (t) => [
    index("collection_items_user_idx").on(t.userId),
    check("collection_quantity_ck", sql`${t.quantity} >= 1 AND ${t.quantity} <= 9999`),
    check("collection_money_ck", sql`(${t.paidCents} IS NULL OR ${t.paidCents} >= 0) AND (${t.manualCents} IS NULL OR ${t.manualCents} >= 0) AND (${t.soldCents} IS NULL OR ${t.soldCents} >= 0)`),
  ],
);

// ───────────── limite de tentativas (login) ─────────────

export const rateLimits = pokedex.table("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull(),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull().defaultNow(),
});
