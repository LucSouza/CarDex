/**
 * Câmbio USD->BRL (e EUR->BRL, para a reserva do Cardmarket) pela AwesomeAPI. Guarda a taxa em micro-unidades
 * inteiras com a data da fonte. TTL de 6 h; se a API falhar, usa o último valor e marca "desatualizado".
 * Sem nenhum valor em cache e sem rede = erro explícito (nunca devolve 0).
 */
import { z } from "zod";
import type { Db } from "@/db";
import { fxRates } from "@/db/schema";
import { parseRateToMicro } from "./valuation";

export const FX_URL = "https://economia.awesomeapi.com.br/json/last/USD-BRL,EUR-BRL";
export const FX_TTL_MS = 6 * 60 * 60 * 1000;
/** Depois de uma falha, não tenta de novo por este tempo (senão toda página esperaria o timeout da API fora do ar). */
export const FX_RETRY_BACKOFF_MS = 2 * 60 * 1000;

let lastFailureAt = 0;
/** Só para testes: zera a pausa entre tentativas. */
export function resetFxBackoff(): void {
  lastFailureAt = 0;
}

export class FxError extends Error {}

const Quote = z.object({ bid: z.union([z.string(), z.number()]), timestamp: z.union([z.string(), z.number()]).optional() });
const Response_ = z.object({ USDBRL: Quote, EURBRL: Quote.optional() });

export interface Rates {
  usdMicro: number;
  eurMicro: number | null;
  /** quando a taxa foi buscada na AwesomeAPI */
  fetchedAt: Date;
  /** a API falhou e estamos usando o último valor guardado */
  stale: boolean;
}

function toDate(ts: string | number | undefined): Date | null {
  const n = Number(ts);
  if (!Number.isFinite(n) || n <= 0) return null;
  // a API manda segundos; se algum dia mandar milissegundos (> 10^11) também funciona
  return new Date(n > 1e11 ? n : n * 1000);
}

/** Busca na AwesomeAPI e valida. Lança FxError se algo vier errado. */
export async function fetchRates(fetchImpl: typeof fetch = fetch): Promise<{ usd: { micro: number; date: Date | null }; eur: { micro: number; date: Date | null } | null }> {
  let json: unknown;
  try {
    const res = await fetchImpl(FX_URL, { signal: AbortSignal.timeout(8000), headers: { accept: "application/json" } });
    if (!res.ok) throw new FxError(`AwesomeAPI respondeu ${res.status}.`);
    json = await res.json();
  } catch (e) {
    throw e instanceof FxError ? e : new FxError("Não foi possível buscar o câmbio.");
  }
  const p = Response_.safeParse(json);
  if (!p.success) throw new FxError("Resposta de câmbio fora do formato esperado.");
  const usd = parseRateToMicro(p.data.USDBRL.bid);
  if (usd === null) throw new FxError("Câmbio USD inválido.");
  const eurMicro = p.data.EURBRL ? parseRateToMicro(p.data.EURBRL.bid) : null;
  return {
    usd: { micro: usd, date: toDate(p.data.USDBRL.timestamp) },
    eur: eurMicro !== null && p.data.EURBRL ? { micro: eurMicro, date: toDate(p.data.EURBRL.timestamp) } : null,
  };
}

async function readCached(db: Db) {
  const rows = await db.select().from(fxRates);
  const usd = rows.find((r) => r.pair === "USD-BRL");
  const eur = rows.find((r) => r.pair === "EUR-BRL");
  return { usd, eur };
}

async function upsert(db: Db, pair: string, micro: number, date: Date | null, now: Date) {
  await db
    .insert(fxRates)
    .values({ pair, rateMicro: micro, sourceDate: date, fetchedAt: now })
    .onConflictDoUpdate({ target: fxRates.pair, set: { rateMicro: micro, sourceDate: date, fetchedAt: now } });
}

export async function getRates(db: Db, opts: { now?: Date; fetchImpl?: typeof fetch; force?: boolean } = {}): Promise<Rates> {
  const now = opts.now ?? new Date();
  const cached = await readCached(db);
  const fresh = cached.usd && now.getTime() - cached.usd.fetchedAt.getTime() < FX_TTL_MS;
  if (fresh && !opts.force && cached.usd) {
    return { usdMicro: cached.usd.rateMicro, eurMicro: cached.eur?.rateMicro ?? null, fetchedAt: cached.usd.fetchedAt, stale: false };
  }
  // API fora do ar há pouco e já temos um valor guardado: nem tenta, usa o último (desatualizado)
  if (!opts.force && cached.usd && now.getTime() - lastFailureAt < FX_RETRY_BACKOFF_MS && now.getTime() >= lastFailureAt) {
    return { usdMicro: cached.usd.rateMicro, eurMicro: cached.eur?.rateMicro ?? null, fetchedAt: cached.usd.fetchedAt, stale: true };
  }
  try {
    const r = await fetchRates(opts.fetchImpl);
    lastFailureAt = 0;
    await upsert(db, "USD-BRL", r.usd.micro, r.usd.date, now);
    if (r.eur) await upsert(db, "EUR-BRL", r.eur.micro, r.eur.date, now);
    return { usdMicro: r.usd.micro, eurMicro: r.eur?.micro ?? cached.eur?.rateMicro ?? null, fetchedAt: now, stale: false };
  } catch (e) {
    lastFailureAt = now.getTime();
    if (cached.usd) {
      return { usdMicro: cached.usd.rateMicro, eurMicro: cached.eur?.rateMicro ?? null, fetchedAt: cached.usd.fetchedAt, stale: true };
    }
    throw e instanceof FxError ? e : new FxError("Câmbio indisponível.");
  }
}

/** Para exibir sem lançar erro: null se não houver nenhuma taxa (nem em cache nem na API). */
export async function getRatesSafe(db: Db, opts: { now?: Date; fetchImpl?: typeof fetch } = {}): Promise<Rates | null> {
  try {
    return await getRates(db, opts);
  } catch {
    return null;
  }
}
