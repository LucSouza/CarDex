import { describe, expect, it } from "vitest";
import { loginSchema } from "./validation";
import { pickClientIp, rateKey, safeEqual } from "./secure";

const SECRET = "x".repeat(40);

describe("rateKey", () => {
  it("é estável, não contém o IP nem o usuário em claro e muda com o segredo", () => {
    const k = rateKey(SECRET, "login", "203.0.113.9", "ana");
    expect(k).toBe(rateKey(SECRET, "login", "203.0.113.9", "ana"));
    expect(k.startsWith("login:")).toBe(true);
    expect(k).not.toContain("203.0.113.9");
    expect(k).not.toContain("ana");
    expect(rateKey("y".repeat(40), "login", "203.0.113.9", "ana")).not.toBe(k);
  });
  it("partes diferentes dão chaves diferentes (e a fronteira entre partes conta)", () => {
    expect(rateKey(SECRET, "p", "a", "bc")).not.toBe(rateKey(SECRET, "p", "ab", "c"));
    expect(rateKey(SECRET, "p", "1.1.1.1")).not.toBe(rateKey(SECRET, "p", "1.1.1.2"));
  });
});

describe("safeEqual", () => {
  it("igual, diferente e de tamanhos diferentes", () => {
    expect(safeEqual("segredo-123", "segredo-123")).toBe(true);
    expect(safeEqual("segredo-123", "segredo-124")).toBe(false);
    expect(safeEqual("curto", "um-segredo-bem-mais-longo")).toBe(false);
    expect(safeEqual("", "x")).toBe(false);
  });
});

describe("pickClientIp", () => {
  it("prefere x-real-ip; sem ele usa o ÚLTIMO X-Forwarded-For, nunca o primeiro (forjável)", () => {
    expect(pickClientIp("198.51.100.7", "6.6.6.6, 10.0.0.1")).toBe("198.51.100.7");
    expect(pickClientIp(null, "6.6.6.6, 203.0.113.5")).toBe("203.0.113.5");
    expect(pickClientIp(null, null)).toBe("unknown");
    expect(pickClientIp("  ", " , ")).toBe("unknown");
  });
});

describe("loginSchema normaliza o usuário (a chave do limite não dá para burlar com maiúsculas ou espaços)", () => {
  it("trim + minúsculas", () => {
    expect(loginSchema.parse({ username: "  Admin ", password: "x" }).username).toBe("admin");
    expect(loginSchema.parse({ username: "ADMIN", password: "x" }).username).toBe("admin");
  });
});
