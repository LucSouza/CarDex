import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createMemoryDb, type Db } from "@/db";
import { cardPrices, cards, collectionItems, fxRates, users } from "@/db/schema";
import { addItem, getItem, listItems, listRemoved, purgeItem, removeItem, restoreItem, summarize, updateItem, valueOfItem } from "./collection";
import { FxError, getRates } from "./fx";
import { CARD_TTL_MS, ensureCard, readCard, refreshStaleCards, saveCard } from "./price-service";
import { defaultSettings, getSettings, resetSettings, saveSettings } from "./settings";
import { normalizeCard, type Tcgdex } from "./tcgdex";
import { clearRateLimit, createUser, findActiveUserByUsername, getActiveUser, hitRateLimit } from "./users";
import { UserError, itemFormSchema, parseMoney, settingsFormSchema } from "./validation";
import { estimateCents } from "./valuation";

const fx = (name: string): unknown => JSON.parse(readFileSync(path.join(import.meta.dirname, "__fixtures__", name), "utf8"));
const PT = () => normalizeCard(fx("pt-cel25-5.json"), "pt"); // holo, US$ 3,98
const EN = () => normalizeCard(fx("en-base1-58.json"), "en"); // normal, US$ 7,84
const JA = () => normalizeCard(fx("ja-SV-P-001.json"), "ja"); // só Cardmarket: EUR 20,96

const NOW = new Date("2026-11-24T12:00:00Z");
const RATES = { usdMicro: 5_888_100, eurMicro: 6_455_100, fetchedAt: NOW, stale: false };

let db: Db;
let a: string;
let b: string;

const form = (o: Record<string, string> = {}) =>
  itemFormSchema.parse({ cardId: "cel25-5", variant: "holo", condition: "NM", ownedLanguage: "PT", quantity: "1", paid: "", manual: "", note: "", ...o });

/** Tcgdex falso: serve as fixtures e conta as chamadas. */
function fakeTcgdex(opts: { fail?: boolean } = {}) {
  const calls: string[] = [];
  const t = {
    getCard: async (id: string, lang: string) => {
      calls.push(`${lang}:${id}`);
      if (opts.fail) throw new Error("rede fora");
      if (id === "cel25-5" && lang === "pt") return PT();
      if (id === "base1-58" && lang === "en") return EN();
      if (id === "SV-P-001" && lang === "ja") return JA();
      return null;
    },
    getCardAny: async (id: string) => {
      for (const l of ["pt", "en", "ja"]) {
        const c = await t.getCard(id, l);
        if (c) return c;
      }
      return null;
    },
  };
  return { t: t as unknown as Tcgdex, calls };
}

beforeEach(async () => {
  db = await createMemoryDb();
  a = await createUser(db, "Ana", "hash-a");
  b = await createUser(db, "Bruno", "hash-b");
  await saveCard(db, PT(), "pt", NOW);
  await saveCard(db, EN(), "en", NOW);
  await saveCard(db, JA(), "ja", NOW);
});

describe("valor de um item", () => {
  it("estimado = preço base x câmbio x estado x idioma (holo PT, NM)", async () => {
    const s = defaultSettings();
    const id = await addItem(db, a, form(), { now: NOW });
    const v = (await getItem(db, a, id, s, RATES))!;
    const esperado = estimateCents({ baseMinor: 398, fxMicro: 5_888_100, conditionBp: 10_000, languageBp: 9_000 });
    expect(v.value).toMatchObject({ unitCents: esperado, source: "estimado", totalCents: esperado });
    expect(v.value.base).toMatchObject({ source: "tcgplayer", currency: "USD", minor: 398 });
  });

  it("estado e quantidade mudam o valor; valor manual vence", async () => {
    const s = defaultSettings();
    const id = await addItem(db, a, form({ condition: "MP", quantity: "3" }), { now: NOW });
    const v = (await getItem(db, a, id, s, RATES))!;
    const unit = estimateCents({ baseMinor: 398, fxMicro: 5_888_100, conditionBp: 6_500, languageBp: 9_000 });
    expect(v.value.totalCents).toBe(unit * 3);
    await updateItem(db, a, id, form({ condition: "MP", quantity: "3", manual: "50,00" }));
    const m = (await getItem(db, a, id, s, RATES))!;
    expect(m.value).toMatchObject({ unitCents: 5000, source: "manual", totalCents: 15000, base: null });
  });

  it("carta japonesa: só Cardmarket (EUR) convertido; com a reserva desligada fica sem preço (null, nunca zero)", async () => {
    const id = await addItem(db, a, form({ cardId: "SV-P-001", variant: "normal", ownedLanguage: "JP" }), { now: NOW });
    const on = (await getItem(db, a, id, defaultSettings(), RATES))!;
    expect(on.value.base).toMatchObject({ source: "cardmarket", currency: "EUR", minor: 2096 });
    expect(on.value.unitCents).toBe(estimateCents({ baseMinor: 2096, fxMicro: 6_455_100, conditionBp: 10_000, languageBp: 9_500 }));
    const off = (await getItem(db, a, id, { ...defaultSettings(), useCardmarketFallback: false }, RATES))!;
    expect(off.value).toMatchObject({ unitCents: null, source: "sem-preco", totalCents: null });
  });

  it("sem câmbio nenhum: estimado vira sem preço (não quebra)", async () => {
    const id = await addItem(db, a, form(), { now: NOW });
    expect((await getItem(db, a, id, defaultSettings(), null))!.value.source).toBe("sem-preco");
  });

  it("resumo: total só das linhas com preço; sem preço fica de fora e é contado", async () => {
    const s = defaultSettings();
    await addItem(db, a, form({ quantity: "2" }), { now: NOW });
    await addItem(db, a, form({ cardId: "SV-P-001", variant: "normal", ownedLanguage: "JP" }), { now: NOW });
    const views = await listItems(db, a, { ...s, useCardmarketFallback: false }, RATES);
    const sum = summarize(views);
    const unit = estimateCents({ baseMinor: 398, fxMicro: 5_888_100, conditionBp: 10_000, languageBp: 9_000 });
    expect(sum).toMatchObject({ cards: 3, lines: 2, withoutPrice: 1, totalCents: unit * 2 });
  });

  it("lucro: compara o valor com o que foi pago, só nas linhas com valor pago", async () => {
    const id = await addItem(db, a, form({ paid: "10,00", quantity: "2" }), { now: NOW });
    await addItem(db, a, form({ cardId: "base1-58", variant: "normal", ownedLanguage: "EN" }), { now: NOW });
    const sum = summarize(await listItems(db, a, defaultSettings(), RATES));
    expect(sum.paidCents).toBe(2000);
    const own = (await getItem(db, a, id, defaultSettings(), RATES))!;
    expect(sum.valueOfPaidCents).toBe(own.value.totalCents);
  });
});

describe("CRUD da coleção", () => {
  it("cria, edita, remove (venda), restaura e apaga de vez só o que está no histórico", async () => {
    const s = defaultSettings();
    const id = await addItem(db, a, form({ note: "  trocada na feira  " }), { now: NOW });
    expect((await getItem(db, a, id, s, RATES))?.item.note).toBe("trocada na feira");

    await updateItem(db, a, id, form({ condition: "HP", quantity: "2", paid: "5,50" }));
    const e = (await getItem(db, a, id, s, RATES))!.item;
    expect(e).toMatchObject({ condition: "HP", quantity: 2, paidCents: 550 });

    await expect(purgeItem(db, a, id)).rejects.toBeInstanceOf(UserError); // ainda ativa: não apaga de vez
    await removeItem(db, a, id, "SOLD", 4000);
    expect(await listItems(db, a, s, RATES)).toHaveLength(0);
    const hist = await listRemoved(db, a, s, RATES);
    expect(hist).toHaveLength(1);
    expect(hist[0].item).toMatchObject({ removedReason: "SOLD", soldCents: 4000 });
    await expect(updateItem(db, a, id, form())).rejects.toBeInstanceOf(UserError); // removida não edita
    await expect(removeItem(db, a, id, "OTHER", null)).rejects.toBeInstanceOf(UserError); // já removida

    await restoreItem(db, a, id);
    expect(await listItems(db, a, s, RATES)).toHaveLength(1);
    expect((await getItem(db, a, id, s, RATES))!.item).toMatchObject({ removedAt: null, soldCents: null });

    await removeItem(db, a, id, "TRADED", 999); // troca não guarda valor de venda
    expect((await listRemoved(db, a, s, RATES))[0].item.soldCents).toBeNull();
    await purgeItem(db, a, id);
    expect(await listRemoved(db, a, s, RATES)).toHaveLength(0);
  });

  it("variante inexistente na carta é recusada (reverse numa carta só holo)", async () => {
    await expect(addItem(db, a, form({ variant: "reverse" }), { now: NOW })).rejects.toThrow(/variante/);
  });

  it("carta que não existe no catálogo é recusada", async () => {
    await expect(addItem(db, a, form({ cardId: "nao-existe-1" }), { t: fakeTcgdex().t })).rejects.toBeInstanceOf(UserError);
  });

  it("o banco recusa quantidade 0 e dinheiro negativo (CHECK), mesmo fora da validação", async () => {
    const id = await addItem(db, a, form(), { now: NOW });
    await expect(db.update(collectionItems).set({ quantity: 0 }).where(eq(collectionItems.id, id))).rejects.toThrow();
    await expect(db.update(collectionItems).set({ manualCents: -1 }).where(eq(collectionItems.id, id))).rejects.toThrow();
  });
});

describe("isolamento entre usuários (multiusuário)", () => {
  it("B não lê, edita, remove, restaura nem apaga o item de A; a lista de B vem vazia", async () => {
    const s = defaultSettings();
    const id = await addItem(db, a, form(), { now: NOW });
    expect(await getItem(db, b, id, s, RATES)).toBeNull();
    expect(await listItems(db, b, s, RATES)).toHaveLength(0);
    await expect(updateItem(db, b, id, form({ quantity: "9" }))).rejects.toBeInstanceOf(UserError);
    await expect(removeItem(db, b, id, "SOLD", 100)).rejects.toBeInstanceOf(UserError);
    // o item de A continua intacto
    expect((await getItem(db, a, id, s, RATES))!.item).toMatchObject({ quantity: 1, removedAt: null });

    await removeItem(db, a, id, "OTHER", null);
    await expect(restoreItem(db, b, id)).rejects.toBeInstanceOf(UserError);
    await expect(purgeItem(db, b, id)).rejects.toBeInstanceOf(UserError);
    expect(await listRemoved(db, b, s, RATES)).toHaveLength(0);
    expect(await listRemoved(db, a, s, RATES)).toHaveLength(1);
  });

  it("totais são só do próprio usuário", async () => {
    await addItem(db, a, form({ quantity: "5" }), { now: NOW });
    await addItem(db, b, form({ quantity: "1" }), { now: NOW });
    const s = defaultSettings();
    expect(summarize(await listItems(db, a, s, RATES)).cards).toBe(5);
    expect(summarize(await listItems(db, b, s, RATES)).cards).toBe(1);
  });

  it("configurações são por usuário", async () => {
    const sa = defaultSettings();
    sa.factors.languages.PT = 7000;
    await saveSettings(db, a, sa);
    expect((await getSettings(db, a)).factors.languages.PT).toBe(7000);
    expect((await getSettings(db, b)).factors.languages.PT).toBe(9000); // padrão da B, intacto
  });

  it("usuário desativado não é encontrado no login", async () => {
    expect(await findActiveUserByUsername(db, " ANA ")).not.toBeNull();
    await db.update(users).set({ disabledAt: new Date() }).where(eq(users.id, a));
    expect(await findActiveUserByUsername(db, "ana")).toBeNull();
    expect(await getActiveUser(db, a)).toBeNull();
    expect(await getActiveUser(db, b)).not.toBeNull();
  });
});

describe("configurações", () => {
  it("semeia os padrões (PT 0,90), edita, valida e restaura", async () => {
    const d = await getSettings(db, a);
    expect(d.factors.languages).toEqual({ EN: 10000, JP: 9500, PT: 9000 });
    expect(d.factors.conditions.SP).toBe(8500);
    expect(d.useCardmarketFallback).toBe(true);
    await saveSettings(db, a, { ...d, useCardmarketFallback: false });
    expect((await getSettings(db, a)).useCardmarketFallback).toBe(false);
    await resetSettings(db, a);
    expect((await getSettings(db, a)).useCardmarketFallback).toBe(true);
  });

  it("formulário: porcentagem vira basis points e o inválido é recusado", () => {
    const ok = settingsFormSchema.parse({ NM: "100", SP: "85", MP: "65", HP: "45,5", D: "25", EN: "100", JP: "95", PT: "90" });
    expect(ok).toMatchObject({ HP: 4550, PT: 9000, useCardmarketFallback: false });
    expect(settingsFormSchema.safeParse({ NM: "abc", SP: "85", MP: "65", HP: "45", D: "25", EN: "100", JP: "95", PT: "90" }).success).toBe(false);
    expect(settingsFormSchema.safeParse({ NM: "250", SP: "85", MP: "65", HP: "45", D: "25", EN: "100", JP: "95", PT: "90" }).success).toBe(false);
    expect(settingsFormSchema.parse({ NM: "100", SP: "85", MP: "65", HP: "45", D: "25", EN: "100", JP: "95", PT: "90", useCardmarketFallback: "on" }).useCardmarketFallback).toBe(true);
  });
});

describe("cache de preços (TTL e falha de rede)", () => {
  it("cache novo não chama a API; velho chama; falha com cache mantém o preço antigo e avisa", async () => {
    const f = fakeTcgdex();
    const fresh = await ensureCard(db, "cel25-5", { t: f.t, now: NOW });
    expect(fresh?.stale).toBe(false);
    expect(f.calls).toHaveLength(0);

    const later = new Date(NOW.getTime() + CARD_TTL_MS + 1000);
    const upd = await ensureCard(db, "cel25-5", { t: f.t, now: later });
    expect(upd?.stale).toBe(false);
    expect(f.calls).toEqual(["pt:cel25-5"]);

    const down = fakeTcgdex({ fail: true });
    const later2 = new Date(later.getTime() + CARD_TTL_MS + 1000);
    const kept = await ensureCard(db, "cel25-5", { t: down.t, now: later2 });
    expect(kept?.stale).toBe(true);
    expect(kept?.prices.find((p) => p.variant === "holo" && p.source === "tcgplayer")?.minor).toBe(398); // preço antigo mantido
  });

  it("carta nova sem rede e sem cache: erro (não inventa)", async () => {
    await expect(ensureCard(db, "outra-1", { t: fakeTcgdex({ fail: true }).t })).rejects.toThrow();
  });

  it("refresh em lote: só cartas em coleção e velhas; falha de uma não derruba as outras e mantém o preço", async () => {
    await addItem(db, a, form(), { now: NOW });
    await addItem(db, a, form({ cardId: "base1-58", variant: "normal", ownedLanguage: "EN" }), { now: NOW });
    const later = new Date(NOW.getTime() + CARD_TTL_MS + 1000);
    const f = fakeTcgdex();
    const r = await refreshStaleCards(db, { t: f.t, now: later, concurrency: 2 });
    expect(r).toMatchObject({ refreshed: 2, failed: 0, remaining: 0 });
    expect(f.calls.sort()).toEqual(["en:base1-58", "pt:cel25-5"]);

    const later2 = new Date(later.getTime() + CARD_TTL_MS + 1000);
    const bad = await refreshStaleCards(db, { t: fakeTcgdex({ fail: true }).t, now: later2 });
    expect(bad).toMatchObject({ refreshed: 0, failed: 2 });
    expect((await readCard(db, "cel25-5"))?.prices.length).toBeGreaterThan(0);
  });

  it("o refresh ignora cartas que só existem em itens removidos e respeita o orçamento de tempo", async () => {
    const id = await addItem(db, a, form(), { now: NOW });
    await removeItem(db, a, id, "OTHER", null);
    const later = new Date(NOW.getTime() + CARD_TTL_MS + 1000);
    expect(await refreshStaleCards(db, { t: fakeTcgdex().t, now: later })).toMatchObject({ refreshed: 0, failed: 0 });
    await addItem(db, a, form(), { now: NOW });
    const r = await refreshStaleCards(db, { t: fakeTcgdex().t, now: later, budgetMs: -1 });
    expect(r).toMatchObject({ refreshed: 0, remaining: 1 }); // sem tempo: fica para a próxima rodada
  });

  it("carta PT sem nenhum preço usa o preço do mesmo id em EN", async () => {
    const semPreco = PT();
    semPreco.prices = [];
    const calls: string[] = [];
    const t = {
      getCard: async (_id: string, lang: string) => {
        calls.push(lang);
        return lang === "pt" ? semPreco : { card: { ...EN().card, id: "cel25-5" }, prices: EN().prices };
      },
      getCardAny: async () => semPreco,
    } as unknown as Tcgdex;
    await db.delete(cards).where(eq(cards.id, "cel25-5"));
    const c = await ensureCard(db, "cel25-5", { t, lang: "pt", now: NOW, force: true });
    expect(calls).toEqual(["pt", "en"]);
    expect(c?.prices.length).toBeGreaterThan(0);
    const [row] = await db.select().from(cardPrices).where(eq(cardPrices.cardId, "cel25-5")).limit(1);
    expect(row.priceLang).toBe("en");
  });
});

describe("câmbio", () => {
  const ok = (usd: string, eur: string) =>
    (async () => new Response(JSON.stringify({ USDBRL: { bid: usd, timestamp: "1795549248" }, EURBRL: { bid: eur, timestamp: "1795549007" } }), { status: 200 })) as typeof fetch;
  const down = (async () => new Response("x", { status: 500 })) as typeof fetch;

  it("busca, converte para micro-unidades e guarda; dentro do TTL não busca de novo", async () => {
    const r = await getRates(db, { now: NOW, fetchImpl: ok("5,8881", "6.4551") });
    expect(r).toMatchObject({ usdMicro: 5_888_100, eurMicro: 6_455_100, stale: false });
    const again = await getRates(db, { now: new Date(NOW.getTime() + 60_000), fetchImpl: down });
    expect(again).toMatchObject({ usdMicro: 5_888_100, stale: false }); // cache: nem chamou a API
  });

  it("depois de 6 h busca de novo; se a API falhar usa o último valor e marca desatualizado", async () => {
    await getRates(db, { now: NOW, fetchImpl: ok("5.8881", "6.4551") });
    const later = new Date(NOW.getTime() + 7 * 3600_000);
    const r = await getRates(db, { now: later, fetchImpl: down });
    expect(r).toMatchObject({ usdMicro: 5_888_100, stale: true });
  });

  it("sem cache e sem rede: erro explícito, nunca 0", async () => {
    await expect(getRates(db, { now: NOW, fetchImpl: down })).rejects.toBeInstanceOf(FxError);
    expect(await db.select().from(fxRates)).toHaveLength(0);
  });

  it("câmbio inválido (zero, texto) é recusado", async () => {
    await expect(getRates(db, { now: NOW, fetchImpl: ok("0", "1") })).rejects.toBeInstanceOf(FxError);
    await expect(getRates(db, { now: NOW, fetchImpl: ok("abc", "1") })).rejects.toBeInstanceOf(FxError);
  });
});

describe("limite de tentativas de login", () => {
  it("bloqueia depois do máximo na janela e libera ao limpar", async () => {
    for (let i = 0; i < 5; i++) expect(await hitRateLimit(db, "login:1.2.3.4:ana", 5, 900)).toBe(true);
    expect(await hitRateLimit(db, "login:1.2.3.4:ana", 5, 900)).toBe(false);
    expect(await hitRateLimit(db, "login:9.9.9.9:ana", 5, 900)).toBe(true); // outra chave
    await clearRateLimit(db, "login:1.2.3.4:ana");
    expect(await hitRateLimit(db, "login:1.2.3.4:ana", 5, 900)).toBe(true);
  });
});

describe("valores digitados", () => {
  it("parseMoney aceita 12,50 | 1.234,56 | 12.5 e recusa lixo", () => {
    expect(parseMoney("12,50")).toBe(1250);
    expect(parseMoney("1.234,56")).toBe(123456);
    expect(parseMoney("12.5")).toBe(1250);
    expect(parseMoney("R$ 7")).toBe(700);
    expect(parseMoney("")).toBeNull();
    for (const bad of ["abc", "-5", "1,234", "12,345", "1e3"]) expect(() => parseMoney(bad)).toThrow(UserError);
  });

  it("formulário da carta: quantidade 0 ou 10000 e estado inventado são recusados", () => {
    const base = { cardId: "cel25-5", variant: "holo", condition: "NM", ownedLanguage: "PT", quantity: "1" };
    expect(itemFormSchema.safeParse({ ...base, quantity: "0" }).success).toBe(false);
    expect(itemFormSchema.safeParse({ ...base, quantity: "10000" }).success).toBe(false);
    expect(itemFormSchema.safeParse({ ...base, condition: "XX" }).success).toBe(false);
    expect(itemFormSchema.safeParse({ ...base, cardId: "../x" }).success).toBe(false);
    expect(itemFormSchema.safeParse(base).success).toBe(true);
  });
});

describe("valueOfItem puro", () => {
  it("usa o fator de idioma e estado das configurações do usuário", () => {
    const s = defaultSettings();
    s.factors.languages.PT = 5000;
    const prices = PT().prices;
    const v = valueOfItem({ variant: "holo", condition: "NM", ownedLanguage: "PT", quantity: 1, manualCents: null }, prices, s, RATES);
    expect(v.unitCents).toBe(estimateCents({ baseMinor: 398, fxMicro: 5_888_100, conditionBp: 10_000, languageBp: 5_000 }));
  });
});
