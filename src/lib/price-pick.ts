import type { Variant } from "./valuation";

/** Um preço normalizado de uma fonte, para UMA variante da carta. */
export interface PriceRow {
  variant: Variant;
  /** tcgplayer (USD) | cardmarket (EUR) */
  source: "tcgplayer" | "cardmarket";
  /** campo usado: marketPrice | trend | avg */
  field: string;
  currency: "USD" | "EUR";
  /** centésimos da moeda */
  minor: number;
  sourceUpdatedAt: Date | null;
}

export interface BasePrice {
  minor: number;
  currency: "USD" | "EUR";
  source: "tcgplayer" | "cardmarket";
  field: string;
  sourceUpdatedAt: Date | null;
}

/**
 * Preço base de uma variante. Regra: TCGplayer em USD; só se NÃO houver, o Cardmarket em EUR e apenas quando
 * `allowCardmarket` (cartas japonesas só têm Cardmarket). Nunca devolve zero nem preço "high": sem preço = null.
 */
export function pickBasePrice(prices: PriceRow[], variant: Variant, allowCardmarket: boolean): BasePrice | null {
  const mine = prices.filter((p) => p.variant === variant && p.minor > 0);
  const tcg = mine.find((p) => p.source === "tcgplayer");
  const chosen = tcg ?? (allowCardmarket ? mine.find((p) => p.source === "cardmarket") : undefined);
  if (!chosen) return null;
  return { minor: chosen.minor, currency: chosen.currency, source: chosen.source, field: chosen.field, sourceUpdatedAt: chosen.sourceUpdatedAt };
}
