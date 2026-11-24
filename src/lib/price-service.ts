/**
 * Cache de cartas e preços no banco, com TTL de 24 h. Falha da API mantém o último valor (e marca "stale").
 * Catálogo e preços são GLOBAIS (compartilhados por todos os usuários); a coleção é de cada usuário.
 */
import { and, asc, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { cardPrices, cards, collectionItems } from "@/db/schema";
import type { PriceRow } from "./price-pick";
import { createTcgdex, type CardWithPrices, type CatalogLang, type Tcgdex } from "./tcgdex";
import type { Variant } from "./valuation";

export const CARD_TTL_MS = 24 * 60 * 60 * 1000;

export type CardRow = typeof cards.$inferSelect;

export interface CachedCard {
  card: CardRow;
  prices: PriceRow[];
  /** a busca na API falhou e estes são dados antigos */
  stale: boolean;
}

function toPriceRows(rows: (typeof cardPrices.$inferSelect)[]): PriceRow[] {
  return rows.map((r) => ({
    variant: r.variant as Variant,
    source: r.source as PriceRow["source"],
    field: r.field,
    currency: r.currency as PriceRow["currency"],
    minor: r.minor,
    sourceUpdatedAt: r.sourceUpdatedAt,
  }));
}

export async function readCard(db: Db, id: string): Promise<CachedCard | null> {
  const [card] = await db.select().from(cards).where(eq(cards.id, id)).limit(1);
  if (!card) return null;
  const rows = await db.select().from(cardPrices).where(eq(cardPrices.cardId, id));
  return { card, prices: toPriceRows(rows), stale: false };
}

/** Preços de várias cartas de uma vez (a tela da coleção). */
export async function readPricesFor(db: Db, ids: string[]): Promise<Map<string, PriceRow[]>> {
  const out = new Map<string, PriceRow[]>();
  if (ids.length === 0) return out;
  const rows = await db.select().from(cardPrices).where(inArray(cardPrices.cardId, ids));
  for (const r of rows) out.set(r.cardId, [...(out.get(r.cardId) ?? []), ...toPriceRows([r])]);
  return out;
}

/** Grava a carta e SUBSTITUI os preços (uma transação). */
export async function saveCard(db: Db, data: CardWithPrices, priceLang: CatalogLang, now = new Date()): Promise<void> {
  const c = data.card;
  await db.transaction(async (tx) => {
    await tx
      .insert(cards)
      .values({
        id: c.id,
        catalogLang: c.catalogLang,
        name: c.name,
        setId: c.setId,
        setName: c.setName,
        localId: c.localId,
        rarity: c.rarity,
        imageBase: c.imageBase,
        dexId: c.dexId,
        variants: c.variants,
        fetchedAt: now,
      })
      .onConflictDoUpdate({
        target: cards.id,
        set: { catalogLang: c.catalogLang, name: c.name, setId: c.setId, setName: c.setName, localId: c.localId, rarity: c.rarity, imageBase: c.imageBase, dexId: c.dexId, variants: c.variants, fetchedAt: now },
      });
    await tx.delete(cardPrices).where(eq(cardPrices.cardId, c.id));
    if (data.prices.length > 0) {
      await tx.insert(cardPrices).values(
        data.prices.map((p) => ({
          cardId: c.id,
          variant: p.variant,
          source: p.source,
          field: p.field,
          currency: p.currency,
          minor: p.minor,
          priceLang,
          sourceUpdatedAt: p.sourceUpdatedAt,
          fetchedAt: now,
        })),
      );
    }
  });
}

/**
 * Busca a carta na API. Em `lang` se informado, senão PT -> EN -> JA. Se a carta PT vier SEM nenhum preço, tenta o
 * preço do MESMO id em EN (proteção barata: normalmente PT e EN trazem o mesmo preço).
 */
export async function fetchCard(t: Tcgdex, id: string, lang?: CatalogLang): Promise<{ data: CardWithPrices; priceLang: CatalogLang } | null> {
  const data = lang ? await t.getCard(id, lang) : await t.getCardAny(id);
  if (!data) return null;
  let priceLang = data.card.catalogLang;
  if (data.prices.length === 0 && priceLang === "pt") {
    try {
      const en = await t.getCard(id, "en");
      if (en && en.prices.length > 0) return { data: { card: data.card, prices: en.prices }, priceLang: "en" };
    } catch {
      // sem o EN, segue com a carta PT sem preço
    }
  }
  priceLang = data.card.catalogLang;
  return { data, priceLang };
}

/**
 * Carta + preços do cache; se ausente ou velha (> 24 h) busca de novo. Falha de rede com cache = devolve o antigo
 * com `stale: true`. Sem cache e sem rede = lança o erro.
 */
export async function ensureCard(
  db: Db,
  id: string,
  opts: { t?: Tcgdex; lang?: CatalogLang; now?: Date; force?: boolean } = {},
): Promise<CachedCard | null> {
  const now = opts.now ?? new Date();
  const cached = await readCard(db, id);
  const fresh = cached && now.getTime() - cached.card.fetchedAt.getTime() < CARD_TTL_MS;
  if (cached && fresh && !opts.force) return cached;
  const t = opts.t ?? createTcgdex();
  try {
    const got = await fetchCard(t, id, opts.lang ?? (cached?.card.catalogLang as CatalogLang | undefined));
    if (!got) return cached ? { ...cached, stale: true } : null;
    await saveCard(db, got.data, got.priceLang, now);
    return (await readCard(db, id)) ?? null;
  } catch (e) {
    if (cached) return { ...cached, stale: true };
    throw e;
  }
}

export interface RefreshResult {
  refreshed: number;
  failed: number;
  /** cartas ainda velhas que ficaram para a próxima rodada (o lote é retomável) */
  remaining: number;
}

/**
 * Atualiza as cartas que estão em ALGUMA coleção (ou só na do `userId`; itens não removidos), as mais velhas primeiro, com concorrência limitada
 * e um orçamento de tempo (o limite de execução serverless). Retomável: o que sobrar fica para a próxima chamada.
 */
export async function refreshStaleCards(
  db: Db,
  opts: { t?: Tcgdex; now?: Date; force?: boolean; concurrency?: number; budgetMs?: number; limit?: number; userId?: string } = {},
): Promise<RefreshResult> {
  const now = opts.now ?? new Date();
  const t = opts.t ?? createTcgdex();
  const concurrency = Math.max(1, opts.concurrency ?? 3);
  const deadline = Date.now() + (opts.budgetMs ?? 45_000);
  const cutoff = new Date(now.getTime() - CARD_TTL_MS);

  const used = db
    .select({ id: collectionItems.cardId })
    .from(collectionItems)
    .where(opts.userId ? and(isNull(collectionItems.removedAt), eq(collectionItems.userId, opts.userId)) : isNull(collectionItems.removedAt));
  const staleWhere = opts.force ? sql`true` : lt(cards.fetchedAt, cutoff);
  const queue = await db
    .select({ id: cards.id, lang: cards.catalogLang })
    .from(cards)
    .where(and(inArray(cards.id, used), staleWhere))
    .orderBy(asc(cards.fetchedAt))
    .limit(opts.limit ?? 500);

  let refreshed = 0;
  let failed = 0;
  let next = 0;
  async function worker() {
    while (next < queue.length && Date.now() < deadline) {
      const job = queue[next++];
      try {
        const got = await fetchCard(t, job.id, job.lang as CatalogLang);
        if (got) {
          await saveCard(db, got.data, got.priceLang, now);
          refreshed++;
        } else failed++;
      } catch {
        failed++; // mantém o preço antigo
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return { refreshed, failed, remaining: Math.max(0, queue.length - refreshed - failed) };
}
