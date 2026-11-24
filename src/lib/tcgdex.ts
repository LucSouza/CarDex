/**
 * Cliente da TCGdex (https://api.tcgdex.net/v2). Sem chave. Host FIXO: nenhuma parte da URL vem do usuário sem
 * validação. Toda resposta é dado externo não confiável: passa por zod e preços inválidos são descartados.
 *
 * Fatos conferidos contra a API real (2026-11-24):
 *  - o preço vem em `pricing` na RAIZ da carta (PT, EN e JA) e, em algumas cartas, também em `variants_detailed[].pricing`;
 *  - TCGplayer (USD) usa as chaves `normal`, `holofoil` e `reverse-holofoil` (com hífen); cartas japonesas NÃO têm TCGplayer;
 *  - Cardmarket (EUR): `trend`/`avg` valem para a versão base e os campos `*-holo` para o reverse holo;
 *  - nem toda carta existe em PT (404): a busca cai em cadeia PT -> EN -> JA; ids de JA não existem em EN/PT.
 */
import { z } from "zod";
import { toMinor, type Variant } from "./valuation";
import type { PriceRow } from "./price-pick";

export const TCGDEX_BASE = "https://api.tcgdex.net/v2";
export const CATALOG_LANGS = ["pt", "en", "ja"] as const;
export type CatalogLang = (typeof CATALOG_LANGS)[number];

const TIMEOUT_MS = 8000;
const MAX_BYTES = 1_500_000;
const ID_RE = /^[A-Za-z0-9._-]{1,40}$/;

export class TcgdexError extends Error {}

const imageUrl = z
  .string()
  .max(300)
  .refine((u) => {
    try {
      const x = new URL(u);
      return x.protocol === "https:" && x.hostname === "assets.tcgdex.net";
    } catch {
      return false;
    }
  });

const Flags = z.object({
  normal: z.boolean().catch(false),
  reverse: z.boolean().catch(false),
  holo: z.boolean().catch(false),
  firstEdition: z.boolean().catch(false),
});

const CardSchema = z.object({
  id: z.string().regex(ID_RE),
  localId: z.union([z.string(), z.number()]).transform(String).pipe(z.string().min(1).max(20)),
  name: z.string().min(1).max(160),
  image: imageUrl.nullish().catch(null),
  rarity: z.string().max(80).nullish().catch(null),
  dexId: z.array(z.number().int()).nullish().catch(null),
  set: z.object({ id: z.string().regex(ID_RE), name: z.string().max(160).nullish().catch(null) }),
  variants: Flags.nullish().catch(null),
  pricing: z.unknown().optional(),
  variants_detailed: z
    .array(z.object({ type: z.string().max(40), pricing: z.unknown().optional() }))
    .nullish()
    .catch(null),
});

export interface NormalizedCard {
  id: string;
  catalogLang: CatalogLang;
  name: string;
  setId: string;
  setName: string | null;
  localId: string;
  rarity: string | null;
  /** URL base SEM sufixo; use imageSrc() para montar a final */
  imageBase: string | null;
  dexId: number | null;
  variants: Record<Variant, boolean>;
}

export interface CardWithPrices {
  card: NormalizedCard;
  prices: PriceRow[];
}

export interface CardBrief {
  id: string;
  localId: string;
  name: string;
  imageBase: string | null;
  lang: CatalogLang;
}

export interface SetBrief {
  id: string;
  name: string;
  cardCount: number | null;
}

// ───────────── preços ─────────────

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const asDate = (v: unknown): Date | null => {
  if (typeof v !== "string") return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
};

/** Chave do TCGplayer -> variante nossa. `reverse-holofoil` leva hífen na TCGdex. */
function tcgVariant(key: string): Variant | null {
  const k = key.toLowerCase();
  if (k === "normal") return "normal";
  if (k === "holofoil") return "holo";
  if (k === "reverse-holofoil") return "reverse";
  if (k.startsWith("1st-edition") || k.startsWith("1stedition")) return "firstEdition";
  return null;
}

function typeVariant(type: string): Variant | null {
  const t = type.toLowerCase().replace(/[\s_-]/g, "");
  if (t === "normal") return "normal";
  if (t === "holo" || t === "holofoil") return "holo";
  if (t === "reverse" || t === "reverseholo") return "reverse";
  if (t === "firstedition" || t === "1stedition") return "firstEdition";
  return null;
}

function addTcg(out: PriceRow[], block: unknown): void {
  if (!isObj(block)) return;
  const updated = asDate(block.updated);
  for (const [key, val] of Object.entries(block)) {
    const variant = tcgVariant(key);
    if (!variant || !isObj(val)) continue;
    // marketPrice; sem ele, midPrice. NUNCA highPrice (cartas comuns aparecem com US$ 4.321).
    const market = toMinor(val.marketPrice);
    const mid = market === null ? toMinor(val.midPrice) : null;
    const minor = market ?? mid;
    if (minor === null) continue;
    out.push({ variant, source: "tcgplayer", field: market !== null ? "marketPrice" : "midPrice", currency: "USD", minor, sourceUpdatedAt: updated });
  }
}

function cmPick(b: Obj, suffix: "" | "-holo"): { minor: number; field: string } | null {
  const trend = toMinor(b[`trend${suffix}`]);
  if (trend !== null) return { minor: trend, field: `trend${suffix}` };
  const avg = toMinor(b[`avg${suffix}`]);
  return avg !== null ? { minor: avg, field: `avg${suffix}` } : null;
}

function addCardmarketRoot(out: PriceRow[], block: unknown, flags: Record<Variant, boolean>): void {
  if (!isObj(block)) return;
  const updated = asDate(block.updated);
  const push = (variant: Variant, p: { minor: number; field: string } | null) => {
    if (p) out.push({ variant, source: "cardmarket", field: p.field, currency: "EUR", minor: p.minor, sourceUpdatedAt: updated });
  };
  const base = cmPick(block, "");
  if (flags.normal) push("normal", base);
  else if (flags.holo) push("holo", base); // carta só holo: os campos base são do holo
  if (flags.normal && flags.reverse) push("reverse", cmPick(block, "-holo"));
}

function addCardmarketDetailed(out: PriceRow[], variant: Variant, block: unknown): void {
  if (!isObj(block)) return;
  const p = cmPick(block, "");
  if (p) out.push({ variant, source: "cardmarket", field: p.field, currency: "EUR", minor: p.minor, sourceUpdatedAt: asDate(block.updated) });
}

/** Extrai e normaliza TODOS os preços que a carta traz. Variante/fonte repetida: a primeira vence. */
export function extractPrices(raw: { pricing?: unknown; variants_detailed?: { type: string; pricing?: unknown }[] | null }, flags: Record<Variant, boolean>): PriceRow[] {
  const found: PriceRow[] = [];
  for (const d of raw.variants_detailed ?? []) {
    const variant = typeVariant(d.type);
    if (!variant || !isObj(d.pricing)) continue;
    addTcg(found, d.pricing.tcgplayer);
    addCardmarketDetailed(found, variant, d.pricing.cardmarket);
  }
  if (isObj(raw.pricing)) {
    addTcg(found, raw.pricing.tcgplayer);
    addCardmarketRoot(found, raw.pricing.cardmarket, flags);
  }
  const seen = new Set<string>();
  return found.filter((p) => {
    const k = `${p.variant}|${p.source}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Valida e normaliza a resposta bruta de UMA carta. */
export function normalizeCard(json: unknown, lang: CatalogLang): CardWithPrices {
  const parsed = CardSchema.safeParse(json);
  if (!parsed.success) throw new TcgdexError("Resposta da TCGdex fora do formato esperado.");
  const c = parsed.data;
  const flags: Record<Variant, boolean> = {
    normal: c.variants?.normal ?? false,
    reverse: c.variants?.reverse ?? false,
    holo: c.variants?.holo ?? false,
    firstEdition: c.variants?.firstEdition ?? false,
  };
  return {
    card: {
      id: c.id,
      catalogLang: lang,
      name: c.name,
      setId: c.set.id,
      setName: c.set.name ?? null,
      localId: c.localId,
      rarity: c.rarity ?? null,
      imageBase: c.image ?? null,
      dexId: c.dexId?.[0] ?? null,
      variants: flags,
    },
    prices: extractPrices(c, flags),
  };
}

// ───────────── imagens ─────────────

/** Sufixo obrigatório (CONFIRMADO): a URL base devolve HTML. low.webp = grade; high.webp = detalhe. */
export function imageSrc(imageBase: string | null, quality: "low" | "high" = "low"): string | null {
  if (!imageBase) return null;
  return `${imageBase}/${quality}.webp`;
}

// ───────────── cliente ─────────────

const BriefSchema = z.object({
  id: z.string().regex(ID_RE),
  localId: z.union([z.string(), z.number()]).transform(String).pipe(z.string().min(1).max(20)),
  name: z.string().min(1).max(160),
  image: imageUrl.nullish().catch(null),
});

const SetListSchema = z.array(
  z.object({
    id: z.string().regex(ID_RE),
    name: z.string().min(1).max(160),
    cardCount: z.object({ total: z.number().int().nullish().catch(null) }).nullish().catch(null),
  }),
);

const SetDetailSchema = z.object({ cards: z.array(BriefSchema.partial({ image: true })).catch([]) });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createTcgdex(fetchImpl: typeof fetch = fetch) {
  /** GET com timeout, 1 retry (rede, 5xx, 429) e limite de tamanho. 404 = null. */
  async function getJson(path: string): Promise<unknown | null> {
    const url = `${TCGDEX_BASE}${path}`;
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const res = await fetchImpl(url, { signal: AbortSignal.timeout(TIMEOUT_MS), headers: { accept: "application/json" } });
        if (res.status === 404) return null;
        if (res.status === 429 || res.status >= 500) {
          lastErr = new TcgdexError(`TCGdex respondeu ${res.status}.`);
          await sleep(400 * (attempt + 1));
          continue;
        }
        if (!res.ok) throw new TcgdexError(`TCGdex respondeu ${res.status}.`);
        const text = await res.text();
        if (text.length > MAX_BYTES) throw new TcgdexError("Resposta da TCGdex grande demais.");
        return JSON.parse(text) as unknown;
      } catch (e) {
        if (e instanceof TcgdexError && !/respondeu (429|5\d\d)/.test(e.message)) throw e;
        lastErr = e;
        await sleep(400 * (attempt + 1));
      }
    }
    throw lastErr instanceof Error ? lastErr : new TcgdexError("Falha ao falar com a TCGdex.");
  }

  const enc = encodeURIComponent;

  async function getCard(id: string, lang: CatalogLang): Promise<CardWithPrices | null> {
    if (!ID_RE.test(id)) throw new TcgdexError("Id de carta inválido.");
    const json = await getJson(`/${lang}/cards/${enc(id)}`);
    return json === null ? null : normalizeCard(json, lang);
  }

  /** A carta na primeira língua da cadeia em que existir (PT -> EN -> JA). */
  async function getCardAny(id: string): Promise<CardWithPrices | null> {
    for (const lang of CATALOG_LANGS) {
      const c = await getCard(id, lang);
      if (c) return c;
    }
    return null;
  }

  function toBriefs(json: unknown, lang: CatalogLang): CardBrief[] {
    if (!Array.isArray(json)) return [];
    const out: CardBrief[] = [];
    for (const item of json) {
      const p = BriefSchema.safeParse(item);
      if (p.success) out.push({ id: p.data.id, localId: p.data.localId, name: p.data.name, imageBase: p.data.image ?? null, lang });
    }
    return out;
  }

  async function searchByName(name: string, lang: CatalogLang, page = 1, perPage = 20): Promise<CardBrief[]> {
    const q = name.trim().slice(0, 60);
    if (!q) return [];
    const json = await getJson(`/${lang}/cards?name=${enc(q)}&pagination:page=${page}&pagination:itemsPerPage=${perPage}`);
    return toBriefs(json, lang);
  }

  async function searchByLocalId(localId: string, lang: CatalogLang, page = 1, perPage = 20): Promise<CardBrief[]> {
    const n = localId.trim();
    if (!/^[A-Za-z0-9-]{1,12}$/.test(n)) return [];
    const json = await getJson(`/${lang}/cards?localId=${enc(n)}&pagination:page=${page}&pagination:itemsPerPage=${perPage}`);
    return toBriefs(json, lang);
  }

  async function listSets(lang: CatalogLang): Promise<SetBrief[]> {
    const json = await getJson(`/${lang}/sets`);
    const p = SetListSchema.safeParse(json);
    return p.success ? p.data.map((s) => ({ id: s.id, name: s.name, cardCount: s.cardCount?.total ?? null })) : [];
  }

  async function listSetCards(setId: string, lang: CatalogLang): Promise<CardBrief[]> {
    if (!ID_RE.test(setId)) return [];
    const json = await getJson(`/${lang}/sets/${enc(setId)}`);
    const p = SetDetailSchema.safeParse(json);
    if (!p.success) return [];
    return p.data.cards.flatMap((c) => (c.id && c.name && c.localId !== undefined ? [{ id: c.id, localId: String(c.localId), name: c.name, imageBase: c.image ?? null, lang }] : []));
  }

  return { getCard, getCardAny, searchByName, searchByLocalId, listSets, listSetCards };
}

export type Tcgdex = ReturnType<typeof createTcgdex>;

// ───────────── busca combinada ─────────────

const stripAccents = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
/** "025" e "25" são o mesmo número; "SWSH001" continua como está. */
export const normNumber = (s: string) => (/^\d+$/.test(s.trim()) ? String(Number(s.trim())) : s.trim().toLowerCase());

export interface SearchQuery {
  name?: string;
  number?: string;
  setId?: string;
}

/**
 * Busca em PT, EN e JA e junta. Quando o id existe em mais de uma língua (PT e EN têm o mesmo id) a PRIMEIRA da
 * cadeia vence (PT). Cartas só japonesas aparecem com o próprio id. Com coleção informada usa a lista do set.
 */
export async function searchCards(t: Tcgdex, q: SearchQuery, page = 1): Promise<CardBrief[]> {
  const name = q.name?.trim() ?? "";
  const number = q.number?.trim() ?? "";
  const perLang = await Promise.all(
    CATALOG_LANGS.map(async (lang): Promise<CardBrief[]> => {
      try {
        if (q.setId) {
          const cards = await t.listSetCards(q.setId, lang);
          return cards.filter((c) => (!number || normNumber(c.localId) === normNumber(number)) && (!name || stripAccents(c.name).includes(stripAccents(name))));
        }
        if (name) {
          const list = await t.searchByName(name, lang, page);
          return number ? list.filter((c) => normNumber(c.localId) === normNumber(number)) : list;
        }
        if (number) {
          const variants = [...new Set([number, number.padStart(3, "0"), normNumber(number)])];
          return (await Promise.all(variants.map((v) => t.searchByLocalId(v, lang, page)))).flat();
        }
        return [];
      } catch {
        return []; // uma língua fora do ar não derruba a busca das outras
      }
    }),
  );
  const seen = new Set<string>();
  const out: CardBrief[] = [];
  for (const list of perLang) {
    for (const c of list) {
      if (seen.has(c.id)) continue;
      seen.add(c.id);
      out.push(c);
    }
  }
  return out;
}
