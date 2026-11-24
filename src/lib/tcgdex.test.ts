import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { TcgdexError, createTcgdex, imageSrc, normNumber, normalizeCard, searchCards } from "./tcgdex";

const fx = (name: string): unknown => JSON.parse(readFileSync(path.join(import.meta.dirname, "__fixtures__", name), "utf8"));

/** fetch falso: devolve o JSON gravado para cada caminho; o resto é 404. */
function fakeFetch(routes: Record<string, unknown | number>) {
  const calls: string[] = [];
  const impl = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const key = url.replace("https://api.tcgdex.net/v2", "");
    const hit = routes[key];
    if (typeof hit === "number") return new Response("erro", { status: hit });
    if (hit === undefined) return new Response("not found", { status: 404 });
    return new Response(JSON.stringify(hit), { status: 200 });
  }) as typeof fetch;
  return { impl, calls };
}

describe("normalizeCard: formatos reais da TCGdex", () => {
  it("carta PT (cel25-5): holo em USD pelo marketPrice, nunca pelo highPrice (US$ 4.321)", () => {
    const { card, prices } = normalizeCard(fx("pt-cel25-5.json"), "pt");
    expect(card).toMatchObject({ id: "cel25-5", name: "Pikachu", setId: "cel25", localId: "5", catalogLang: "pt", dexId: 25 });
    expect(card.imageBase).toBe("https://assets.tcgdex.net/pt/swsh/cel25/5");
    const holo = prices.find((p) => p.variant === "holo" && p.source === "tcgplayer");
    expect(holo).toMatchObject({ minor: 398, currency: "USD", field: "marketPrice" });
    expect(prices.some((p) => p.minor === 432_100)).toBe(false);
  });

  it("carta EN (base1-58): normal em USD", () => {
    const { prices } = normalizeCard(fx("en-base1-58.json"), "en");
    expect(prices.find((p) => p.variant === "normal" && p.source === "tcgplayer")).toMatchObject({ minor: 784, currency: "USD" });
    expect(prices.some((p) => p.minor === 432_100)).toBe(false);
  });

  it("a chave do reverse na TCGdex é reverse-holofoil (com hífen)", () => {
    const { prices } = normalizeCard(fx("pt-swsh1-30.json"), "pt");
    expect(prices.find((p) => p.variant === "normal" && p.source === "tcgplayer")?.minor).toBe(17);
    const reverse = prices.find((p) => p.variant === "reverse" && p.source === "tcgplayer");
    expect(reverse?.currency).toBe("USD");
    expect(reverse?.minor).toBeGreaterThan(0);
  });

  it("PT e EN do mesmo id trazem o mesmo preço (swsh1-30)", () => {
    const pt = normalizeCard(fx("pt-swsh1-30.json"), "pt").prices.map((p) => `${p.variant}|${p.source}|${p.minor}`).sort();
    const en = normalizeCard(fx("en-swsh1-30.json"), "en").prices.map((p) => `${p.variant}|${p.source}|${p.minor}`).sort();
    expect(pt).toEqual(en);
  });

  it("carta japonesa (SV-P-001): sem TCGplayer; só Cardmarket em EUR (trend); sem imagem", () => {
    const { card, prices } = normalizeCard(fx("ja-SV-P-001.json"), "ja");
    expect(card).toMatchObject({ id: "SV-P-001", catalogLang: "ja", imageBase: null });
    expect(prices.some((p) => p.source === "tcgplayer")).toBe(false);
    expect(prices.find((p) => p.source === "cardmarket" && p.variant === "normal")).toMatchObject({ minor: 2096, currency: "EUR", field: "trend" });
  });

  it("resposta fora do formato lança erro claro (sem nome, id inválido, host de imagem estranho)", () => {
    expect(() => normalizeCard({ id: "x-1", localId: "1", set: { id: "x" } }, "en")).toThrow(TcgdexError);
    expect(() => normalizeCard({ id: "../etc", localId: "1", name: "A", set: { id: "x" } }, "en")).toThrow(TcgdexError);
    const c = normalizeCard({ id: "x-1", localId: 1, name: "A", set: { id: "x" }, image: "https://evil.example/a.png" }, "en");
    expect(c.card.imageBase).toBeNull(); // host fora da lista nunca vira imagem
    expect(c.card.localId).toBe("1");
  });

  it("preço inválido (texto, negativo, nulo) é descartado, não vira zero", () => {
    const { prices } = normalizeCard(
      { id: "x-1", localId: "1", name: "A", set: { id: "x" }, variants: { normal: true }, pricing: { tcgplayer: { unit: "USD", normal: { marketPrice: "7", midPrice: -1 } }, cardmarket: { trend: null, avg: 0 } } },
      "en",
    );
    expect(prices).toEqual([]);
  });
});

describe("imageSrc", () => {
  it("monta o sufixo obrigatório; sem base = null", () => {
    expect(imageSrc("https://assets.tcgdex.net/pt/swsh/cel25/5")).toBe("https://assets.tcgdex.net/pt/swsh/cel25/5/low.webp");
    expect(imageSrc("https://assets.tcgdex.net/pt/swsh/cel25/5", "high")).toBe("https://assets.tcgdex.net/pt/swsh/cel25/5/high.webp");
    expect(imageSrc(null)).toBeNull();
  });
});

describe("cliente: rede e falhas", () => {
  it("404 = null; id inválido nunca vira URL", async () => {
    const { impl, calls } = fakeFetch({});
    const t = createTcgdex(impl);
    expect(await t.getCard("base1-58", "pt")).toBeNull();
    await expect(t.getCard("../../etc/passwd", "pt")).rejects.toThrow(TcgdexError);
    expect(calls).toHaveLength(1);
  });

  it("429 uma vez e depois 200: tenta de novo e funciona", async () => {
    let n = 0;
    const impl = (async () => (++n === 1 ? new Response("", { status: 429 }) : new Response(JSON.stringify(fx("en-base1-58.json")), { status: 200 }))) as typeof fetch;
    const c = await createTcgdex(impl).getCard("base1-58", "en");
    expect(c?.card.name).toBe("Pikachu");
    expect(n).toBe(2);
  });

  it("5xx duas vezes: erro (a camada de cima mantém o preço antigo)", async () => {
    const { impl, calls } = fakeFetch({ "/en/cards/base1-58": 503 });
    await expect(createTcgdex(impl).getCard("base1-58", "en")).rejects.toThrow();
    expect(calls).toHaveLength(2);
  });

  it("getCardAny: cai PT -> EN -> JA", async () => {
    const { impl, calls } = fakeFetch({ "/en/cards/base1-58": fx("en-base1-58.json") });
    const c = await createTcgdex(impl).getCardAny("base1-58");
    expect(c?.card.catalogLang).toBe("en");
    expect(calls.map((u) => u.split("/")[4])).toEqual(["pt", "en"]);
  });
});

describe("searchCards: PT, EN e JA juntos", () => {
  const pikachu = (lang: string, id: string, name: string) => ({ id, localId: id.split("-").pop(), name, image: `https://assets.tcgdex.net/${lang}/x/y/1` });

  it("o mesmo id em PT e EN aparece uma vez (PT vence); carta só japonesa aparece com o próprio id", async () => {
    const { impl } = fakeFetch({
      "/pt/cards?name=pika&pagination:page=1&pagination:itemsPerPage=20": [pikachu("pt", "cel25-5", "Pikachu")],
      "/en/cards?name=pika&pagination:page=1&pagination:itemsPerPage=20": [pikachu("en", "cel25-5", "Pikachu"), pikachu("en", "base1-58", "Pikachu")],
      "/ja/cards?name=pika&pagination:page=1&pagination:itemsPerPage=20": [pikachu("ja", "SV-P-001", "ピカチュウ")],
    });
    const out = await searchCards(createTcgdex(impl), { name: "pika" });
    expect(out.map((c) => `${c.id}:${c.lang}`)).toEqual(["cel25-5:pt", "base1-58:en", "SV-P-001:ja"]);
  });

  it("uma língua fora do ar não derruba as outras", async () => {
    const { impl } = fakeFetch({
      "/pt/cards?name=pika&pagination:page=1&pagination:itemsPerPage=20": 500,
      "/en/cards?name=pika&pagination:page=1&pagination:itemsPerPage=20": [pikachu("en", "base1-58", "Pikachu")],
    });
    const out = await searchCards(createTcgdex(impl), { name: "pika" });
    expect(out.map((c) => c.id)).toEqual(["base1-58"]);
  });

  it("coleção + número usa a lista do set e aceita 025 = 25", async () => {
    const { impl } = fakeFetch({
      "/en/sets/swsh1": { cards: [pikachu("en", "swsh1-25", "Zacian"), pikachu("en", "swsh1-30", "Scorbunny")] },
    });
    const out = await searchCards(createTcgdex(impl), { setId: "swsh1", number: "025" });
    expect(out.map((c) => c.id)).toEqual(["swsh1-25"]);
  });

  it("sem nome, número nem coleção = vazio", async () => {
    expect(await searchCards(createTcgdex(fakeFetch({}).impl), {})).toEqual([]);
  });
});

describe("normNumber", () => {
  it("025, 25 e ' 25 ' são o mesmo número", () => {
    expect(normNumber("025")).toBe("25");
    expect(normNumber(" 25 ")).toBe("25");
    expect(normNumber("SWSH001")).toBe("swsh001");
  });
});
