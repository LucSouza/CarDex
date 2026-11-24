import { describe, expect, it } from "vitest";
import { ago, bpToPercent, fmtBRL, fmtMinor } from "./format";

describe("format", () => {
  it("fmtBRL usa ponto de milhar e vírgula, sem float", () => {
    expect(fmtBRL(0)).toBe("R$ 0,00");
    expect(fmtBRL(5)).toBe("R$ 0,05");
    expect(fmtBRL(123456)).toBe("R$ 1.234,56");
    expect(fmtBRL(100_000_000)).toBe("R$ 1.000.000,00");
    expect(fmtBRL(-1050)).toBe("-R$ 10,50");
  });
  it("fmtMinor mostra a moeda de origem", () => {
    expect(fmtMinor(398, "USD")).toBe("US$ 3,98");
    expect(fmtMinor(2096, "EUR")).toBe("€ 20,96");
  });
  it("bpToPercent", () => {
    expect(bpToPercent(9000)).toBe("90");
    expect(bpToPercent(4550)).toBe("45,5");
    expect(bpToPercent(8505)).toBe("85,05");
    expect(bpToPercent(10000)).toBe("100");
  });
  it("ago", () => {
    const now = new Date("2026-11-24T12:00:00Z");
    expect(ago(new Date("2026-11-24T11:30:00Z"), now)).toBe("há 30 min");
    expect(ago(new Date("2026-11-24T06:00:00Z"), now)).toBe("há 6 h");
    expect(ago(new Date("2026-11-20T12:00:00Z"), now)).toBe("há 4 dias");
  });
});
