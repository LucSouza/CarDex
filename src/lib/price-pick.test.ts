import { describe, expect, it } from "vitest";
import { pickBasePrice, type PriceRow } from "./price-pick";

const tcg = (variant: PriceRow["variant"], minor: number): PriceRow => ({ variant, source: "tcgplayer", field: "marketPrice", currency: "USD", minor, sourceUpdatedAt: null });
const cm = (variant: PriceRow["variant"], minor: number): PriceRow => ({ variant, source: "cardmarket", field: "trend", currency: "EUR", minor, sourceUpdatedAt: null });

describe("pickBasePrice", () => {
  it("prefere TCGplayer (USD)", () => {
    expect(pickBasePrice([cm("normal", 500), tcg("normal", 398)], "normal", true)).toMatchObject({ source: "tcgplayer", currency: "USD", minor: 398 });
  });
  it("só Cardmarket: usa quando permitido (carta japonesa), senão sem preço", () => {
    expect(pickBasePrice([cm("normal", 2096)], "normal", true)).toMatchObject({ source: "cardmarket", currency: "EUR", minor: 2096 });
    expect(pickBasePrice([cm("normal", 2096)], "normal", false)).toBeNull();
  });
  it("respeita a variante: reverse não pega o preço do normal", () => {
    expect(pickBasePrice([tcg("normal", 784)], "reverse", true)).toBeNull();
    expect(pickBasePrice([tcg("normal", 784), tcg("reverse", 1500)], "reverse", true)?.minor).toBe(1500);
  });
  it("nenhum preço = null; preço zero ou negativo é ignorado", () => {
    expect(pickBasePrice([], "normal", true)).toBeNull();
    expect(pickBasePrice([tcg("normal", 0), tcg("holo", -5)], "normal", true)).toBeNull();
  });
});
