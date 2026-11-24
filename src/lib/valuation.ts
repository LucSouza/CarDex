/**
 * Valor estimado de uma carta. Funções PURAS, em inteiros: nada de float, nada de banco.
 *
 *   valor (centavos de R$) = preço base (centésimos da moeda) x câmbio x fator do estado x fator do idioma
 *
 * Câmbio em micro-unidades (x 1.000.000) e fatores em basis points (10000 = 1,00). A multiplicação usa BigInt
 * (quatro inteiros grandes estouram o Number) e há UM único arredondamento (meio para cima), no fim.
 */

export const CONDITIONS = ["NM", "SP", "MP", "HP", "D"] as const;
export type Condition = (typeof CONDITIONS)[number];
export const LANGUAGES = ["EN", "JP", "PT"] as const;
export type Language = (typeof LANGUAGES)[number];
export const VARIANTS = ["normal", "reverse", "holo", "firstEdition"] as const;
export type Variant = (typeof VARIANTS)[number];

export const CONDITION_LABEL: Record<Condition, string> = {
  NM: "Near Mint (NM)",
  SP: "Levemente jogada (SP)",
  MP: "Moderadamente jogada (MP)",
  HP: "Muito jogada (HP)",
  D: "Danificada (D)",
};
export const LANGUAGE_LABEL: Record<Language, string> = { EN: "Inglês", JP: "Japonês", PT: "Português" };
export const VARIANT_LABEL: Record<Variant, string> = {
  normal: "Normal",
  reverse: "Reverse holo",
  holo: "Holo",
  firstEdition: "1ª edição",
};

/** CHUTES iniciais, não dados de mercado: cada pessoa calibra em /config. */
export const DEFAULT_CONDITION_BP: Record<Condition, number> = { NM: 10000, SP: 8500, MP: 6500, HP: 4500, D: 2500 };
export const DEFAULT_LANGUAGE_BP: Record<Language, number> = { EN: 10000, JP: 9500, PT: 9000 };

const BP = BigInt(10_000);
const MICRO = BigInt(1_000_000);
const DIV = BP * BP * MICRO;

export interface EstimateInput {
  /** preço base em centésimos da moeda de origem (ex.: US$ 3,98 = 398) */
  baseMinor: number;
  /** câmbio x 1.000.000 (R$ 5,8881 = 5888100) */
  fxMicro: number;
  conditionBp: number;
  languageBp: number;
}

function assertInt(n: number, what: string): void {
  if (!Number.isSafeInteger(n) || n < 0) throw new RangeError(`${what} inválido (inteiro >= 0): ${n}`);
}

/** Valor estimado em centavos de R$ (um único arredondamento, meio para cima). */
export function estimateCents(i: EstimateInput): number {
  assertInt(i.baseMinor, "preço base");
  assertInt(i.fxMicro, "câmbio");
  assertInt(i.conditionBp, "fator de estado");
  assertInt(i.languageBp, "fator de idioma");
  const num = BigInt(i.baseMinor) * BigInt(i.fxMicro) * BigInt(i.conditionBp) * BigInt(i.languageBp);
  return Number((num * BigInt(2) + DIV) / (DIV * BigInt(2)));
}

export interface ResolveInput {
  /** valor manual (centavos de R$): se existir, vence o estimado */
  manualCents: number | null;
  /** estimado (centavos de R$) ou null quando não há preço */
  estimateCents: number | null;
}

export type ValueSource = "manual" | "estimado" | "sem-preco";

/** Valor UNITÁRIO que vale para a carta. `null` = sem preço (nunca vira R$ 0,00 em silêncio). */
export function resolveValue(i: ResolveInput): { cents: number | null; source: ValueSource } {
  if (i.manualCents !== null) return { cents: i.manualCents, source: "manual" };
  if (i.estimateCents !== null) return { cents: i.estimateCents, source: "estimado" };
  return { cents: null, source: "sem-preco" };
}

/** Converte "5,8881" ou "5.8881" em micro-unidades SEM passar por float. Inválido = null. */
export function parseRateToMicro(raw: string | number): number | null {
  const s = String(raw).trim().replace(",", ".");
  const m = /^(\d{1,6})(?:\.(\d{1,12}))?$/.exec(s);
  if (!m) return null;
  const frac = (m[2] ?? "").padEnd(6, "0").slice(0, 6);
  const micro = Number(m[1]) * 1_000_000 + Number(frac);
  return Number.isSafeInteger(micro) && micro > 0 ? micro : null;
}

/** Converte um preço decimal da API (ex.: 3.98) em centésimos inteiros. Inválido, <= 0 ou absurdo = null. */
export function toMinor(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0 || v > 1_000_000) return null;
  const minor = Math.round(v * 100);
  return minor > 0 ? minor : null;
}
