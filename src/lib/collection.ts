/**
 * Coleção de cada usuário (CRUD). REGRA DE OURO: toda consulta e toda escrita levam `userId` no WHERE.
 * Um usuário nunca lê, edita, remove, restaura nem apaga o item de outro (item alheio = "não encontrado").
 */
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import type { Db } from "@/db";
import { cards, collectionItems } from "@/db/schema";
import { pickBasePrice, type BasePrice, type PriceRow } from "./price-pick";
import { ensureCard, readPricesFor, type CardRow } from "./price-service";
import type { Settings } from "./settings";
import type { CatalogLang, Tcgdex } from "./tcgdex";
import { UserError, type ItemForm } from "./validation";
import { estimateCents, resolveValue, type ValueSource, type Variant } from "./valuation";
import type { Rates } from "./fx";

export type ItemRow = typeof collectionItems.$inferSelect;

export interface ItemValue {
  /** valor de UMA carta em centavos de R$ (null = sem preço) */
  unitCents: number | null;
  source: ValueSource;
  /** preço base usado na estimativa (null se manual ou sem preço) */
  base: BasePrice | null;
  /** unitário x quantidade (null = sem preço) */
  totalCents: number | null;
}

/** Valor de um item: o manual vence; senão preço base x câmbio x estado x idioma; senão "sem preço". */
export function valueOfItem(item: Pick<ItemRow, "variant" | "condition" | "ownedLanguage" | "quantity" | "manualCents">, prices: PriceRow[], settings: Settings, rates: Rates | null): ItemValue {
  const base = pickBasePrice(prices, item.variant as Variant, settings.useCardmarketFallback);
  let estimate: number | null = null;
  if (base && rates) {
    const fxMicro = base.currency === "USD" ? rates.usdMicro : rates.eurMicro;
    if (fxMicro !== null) {
      estimate = estimateCents({
        baseMinor: base.minor,
        fxMicro,
        conditionBp: settings.factors.conditions[item.condition],
        languageBp: settings.factors.languages[item.ownedLanguage],
      });
    }
  }
  const r = resolveValue({ manualCents: item.manualCents, estimateCents: estimate });
  return {
    unitCents: r.cents,
    source: r.source,
    base: r.source === "estimado" ? base : null,
    totalCents: r.cents === null ? null : r.cents * item.quantity,
  };
}

export interface ItemView {
  item: ItemRow;
  card: CardRow;
  prices: PriceRow[];
  value: ItemValue;
}

async function loadViews(db: Db, where: ReturnType<typeof and>, settings: Settings, rates: Rates | null): Promise<ItemView[]> {
  const rows = await db
    .select({ item: collectionItems, card: cards })
    .from(collectionItems)
    .innerJoin(cards, eq(cards.id, collectionItems.cardId))
    .where(where)
    .orderBy(desc(collectionItems.createdAt));
  const prices = await readPricesFor(db, [...new Set(rows.map((r) => r.card.id))]);
  return rows.map((r) => {
    const p = prices.get(r.card.id) ?? [];
    return { item: r.item, card: r.card, prices: p, value: valueOfItem(r.item, p, settings, rates) };
  });
}

/** Itens ATIVOS da coleção do usuário (não removidos). */
export function listItems(db: Db, userId: string, settings: Settings, rates: Rates | null): Promise<ItemView[]> {
  return loadViews(db, and(eq(collectionItems.userId, userId), isNull(collectionItems.removedAt)), settings, rates);
}

/** Histórico: cartas vendidas, trocadas ou removidas. */
export function listRemoved(db: Db, userId: string, settings: Settings, rates: Rates | null): Promise<ItemView[]> {
  return loadViews(db, and(eq(collectionItems.userId, userId), isNotNull(collectionItems.removedAt)), settings, rates);
}

export async function getItem(db: Db, userId: string, id: string, settings: Settings, rates: Rates | null): Promise<ItemView | null> {
  const [v] = await loadViews(db, and(eq(collectionItems.userId, userId), eq(collectionItems.id, id)), settings, rates);
  return v ?? null;
}

export interface Summary {
  /** soma dos valores (centavos de R$) das linhas COM preço */
  totalCents: number;
  /** número de cartas (soma das quantidades) */
  cards: number;
  /** linhas distintas */
  lines: number;
  /** linhas sem preço e sem valor manual: ficam FORA do total */
  withoutPrice: number;
  /** soma do que foi pago (pago x quantidade) nas linhas que têm valor pago */
  paidCents: number;
  /** soma dos valores só das linhas que têm valor pago (para comparar com paidCents) */
  valueOfPaidCents: number;
}

export function summarize(views: ItemView[]): Summary {
  const s: Summary = { totalCents: 0, cards: 0, lines: views.length, withoutPrice: 0, paidCents: 0, valueOfPaidCents: 0 };
  for (const v of views) {
    s.cards += v.item.quantity;
    if (v.value.totalCents === null) s.withoutPrice++;
    else s.totalCents += v.value.totalCents;
    if (v.item.paidCents !== null && v.value.totalCents !== null) {
      s.paidCents += v.item.paidCents * v.item.quantity;
      s.valueOfPaidCents += v.value.totalCents;
    }
  }
  return s;
}

function assertVariantAllowed(card: CardRow, variant: Variant): void {
  const flags = card.variants;
  const any = flags.normal || flags.reverse || flags.holo || flags.firstEdition;
  // a TCGdex às vezes não informa variantes (cartas japonesas): nesse caso qualquer uma vale
  if (any && !flags[variant]) throw new UserError("Esta carta não existe nessa variante.");
}

const notFound = () => new UserError("Carta não encontrada na sua coleção.");

export async function addItem(
  db: Db,
  userId: string,
  form: ItemForm,
  opts: { t?: Tcgdex; lang?: CatalogLang; now?: Date } = {},
): Promise<string> {
  const cached = await ensureCard(db, form.cardId, { t: opts.t, lang: opts.lang, now: opts.now });
  if (!cached) throw new UserError("Carta não encontrada no catálogo.");
  assertVariantAllowed(cached.card, form.variant);
  const [row] = await db
    .insert(collectionItems)
    .values({
      userId,
      cardId: form.cardId,
      variant: form.variant,
      condition: form.condition,
      ownedLanguage: form.ownedLanguage,
      quantity: form.quantity,
      paidCents: form.paid,
      manualCents: form.manual,
      note: form.note,
    })
    .returning({ id: collectionItems.id });
  return row.id;
}

/** Edita um item ATIVO do usuário (a carta em si não muda: para trocar de carta, remova e adicione outra). */
export async function updateItem(db: Db, userId: string, id: string, form: ItemForm): Promise<void> {
  const [cur] = await db
    .select({ cardId: collectionItems.cardId })
    .from(collectionItems)
    .where(and(eq(collectionItems.id, id), eq(collectionItems.userId, userId), isNull(collectionItems.removedAt)))
    .limit(1);
  if (!cur) throw notFound();
  const [card] = await db.select().from(cards).where(eq(cards.id, cur.cardId)).limit(1);
  if (card) assertVariantAllowed(card, form.variant);
  const res = await db
    .update(collectionItems)
    .set({
      variant: form.variant,
      condition: form.condition,
      ownedLanguage: form.ownedLanguage,
      quantity: form.quantity,
      paidCents: form.paid,
      manualCents: form.manual,
      note: form.note,
      updatedAt: new Date(),
    })
    .where(and(eq(collectionItems.id, id), eq(collectionItems.userId, userId), isNull(collectionItems.removedAt)))
    .returning({ id: collectionItems.id });
  if (res.length === 0) throw notFound();
}

/** Tira da coleção (vendida/trocada/outro). Exclusão lógica: some do total e vai para o histórico. */
export async function removeItem(db: Db, userId: string, id: string, reason: "SOLD" | "TRADED" | "OTHER", soldCents: number | null): Promise<void> {
  const res = await db
    .update(collectionItems)
    .set({ removedAt: new Date(), removedReason: reason, soldCents: reason === "SOLD" ? soldCents : null, updatedAt: new Date() })
    .where(and(eq(collectionItems.id, id), eq(collectionItems.userId, userId), isNull(collectionItems.removedAt)))
    .returning({ id: collectionItems.id });
  if (res.length === 0) throw notFound();
}

/** Desfaz a remoção (a carta volta para a coleção). */
export async function restoreItem(db: Db, userId: string, id: string): Promise<void> {
  const res = await db
    .update(collectionItems)
    .set({ removedAt: null, removedReason: null, soldCents: null, updatedAt: new Date() })
    .where(and(eq(collectionItems.id, id), eq(collectionItems.userId, userId), isNotNull(collectionItems.removedAt)))
    .returning({ id: collectionItems.id });
  if (res.length === 0) throw notFound();
}

/** Apaga de vez um item que JÁ está no histórico (corrigir um lançamento errado). */
export async function purgeItem(db: Db, userId: string, id: string): Promise<void> {
  const res = await db
    .delete(collectionItems)
    .where(and(eq(collectionItems.id, id), eq(collectionItems.userId, userId), isNotNull(collectionItems.removedAt)))
    .returning({ id: collectionItems.id });
  if (res.length === 0) throw notFound();
}
