import { describe, expect, it } from "vitest";
import { DEFAULT_CONDITION_BP, DEFAULT_LANGUAGE_BP, estimateCents, parseRateToMicro, resolveValue, toMinor } from "./valuation";

const base = { fxMicro: 5_888_100, conditionBp: 10_000, languageBp: 10_000 };

describe("estimateCents", () => {
  it("US$ 3,98 x 5,8881 = R$ 23,43 (NM, EN)", () => {
    expect(estimateCents({ ...base, baseMinor: 398 })).toBe(2343); // 3,98 x 5,8881 = 23,4346
  });

  it("aplica estado e idioma (PT 0,90 e MP 0,65)", () => {
    const v = estimateCents({ baseMinor: 1000, fxMicro: 5_000_000, conditionBp: DEFAULT_CONDITION_BP.MP, languageBp: DEFAULT_LANGUAGE_BP.PT });
    expect(v).toBe(2925); // 10,00 x 5,00 x 0,65 x 0,90 = 29,25
  });

  it("um único arredondamento, meio para cima", () => {
    // 0,01 x 5,00 x 0,50 = R$ 0,025 -> 3 centavos (meio para cima)
    expect(estimateCents({ baseMinor: 1, fxMicro: 5_000_000, conditionBp: 5000, languageBp: 10_000 })).toBe(3);
    // 0,01 x 4,99 = 4,99 centavos -> 5
    expect(estimateCents({ baseMinor: 1, fxMicro: 4_990_000, conditionBp: 10_000, languageBp: 10_000 })).toBe(5);
    // 0,01 x 4,99 x 0,50 = 2,495 centavos -> 2
    expect(estimateCents({ baseMinor: 1, fxMicro: 4_990_000, conditionBp: 5000, languageBp: 10_000 })).toBe(2);
  });

  it("preço muito alto não perde precisão (BigInt)", () => {
    // US$ 99.999,99 x 5,8881 = R$ 588.809,941119 -> R$ 588.809,94
    expect(estimateCents({ ...base, baseMinor: 9_999_999 })).toBe(58_880_994);
  });

  it("zero no preço dá zero; entradas inválidas lançam erro", () => {
    expect(estimateCents({ ...base, baseMinor: 0 })).toBe(0);
    expect(() => estimateCents({ ...base, baseMinor: -1 })).toThrow(RangeError);
    expect(() => estimateCents({ ...base, baseMinor: 1.5 })).toThrow(RangeError);
    expect(() => estimateCents({ ...base, baseMinor: Number.NaN })).toThrow(RangeError);
  });

  it("somar muitos valores já arredondados não desvia", () => {
    const one = estimateCents({ baseMinor: 7, fxMicro: 5_888_100, conditionBp: 8500, languageBp: 9000 });
    let total = 0;
    for (let i = 0; i < 1000; i++) total += one;
    expect(total).toBe(one * 1000);
  });
});

describe("resolveValue", () => {
  it("manual vence o estimado; sem nenhum dos dois = sem preço (null, não zero)", () => {
    expect(resolveValue({ manualCents: 5000, estimateCents: 2343 })).toEqual({ cents: 5000, source: "manual" });
    expect(resolveValue({ manualCents: null, estimateCents: 2343 })).toEqual({ cents: 2343, source: "estimado" });
    expect(resolveValue({ manualCents: null, estimateCents: null })).toEqual({ cents: null, source: "sem-preco" });
  });
  it("manual de R$ 0,00 é um valor válido (a pessoa disse que vale zero)", () => {
    expect(resolveValue({ manualCents: 0, estimateCents: 2343 })).toEqual({ cents: 0, source: "manual" });
  });
});

describe("parseRateToMicro", () => {
  it("aceita vírgula e ponto, sem float", () => {
    expect(parseRateToMicro("5,8881")).toBe(5_888_100);
    expect(parseRateToMicro("5.8881")).toBe(5_888_100);
    expect(parseRateToMicro("6.4551")).toBe(6_455_100);
    expect(parseRateToMicro(5.8881)).toBe(5_888_100);
    expect(parseRateToMicro("6")).toBe(6_000_000);
  });
  it("rejeita lixo, zero e negativo", () => {
    for (const bad of ["", "abc", "0", "0,0", "-1", "1e5", "5,8881x"]) expect(parseRateToMicro(bad)).toBeNull();
  });
});

describe("toMinor", () => {
  it("converte preço da API em centésimos inteiros e descarta o inválido", () => {
    expect(toMinor(3.98)).toBe(398);
    expect(toMinor(0.1 + 0.2)).toBe(30);
    for (const bad of [0, -1, Number.NaN, Infinity, "3.98", null, undefined, 4_000_000]) expect(toMinor(bad)).toBeNull();
  });
});
