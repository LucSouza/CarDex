import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Chave de limite de tentativas: HMAC do conteúdo com o SESSION_SECRET. O IP (dado pessoal) e o nome de usuário
 * nunca ficam em claro no banco, e quem lê a tabela não consegue reverter nem forjar as chaves sem o segredo.
 */
export function rateKey(secret: string, prefix: string, ...parts: string[]): string {
  const h = createHmac("sha256", secret).update(parts.join("\u0000")).digest("hex").slice(0, 32);
  return `${prefix}:${h}`;
}

/** Compara dois segredos em tempo constante, inclusive no TAMANHO (compara os digests SHA-256). */
export function safeEqual(a: string, b: string): boolean {
  const da = createHash("sha256").update(a).digest();
  const db = createHash("sha256").update(b).digest();
  return timingSafeEqual(da, db);
}

/**
 * IP do cliente a partir dos cabeçalhos. `x-real-ip` é definido pela plataforma (Vercel). Sem ele, usa o ÚLTIMO
 * item de X-Forwarded-For (o que o proxy confiável mais próximo acrescentou), nunca o primeiro (que o cliente forja).
 */
export function pickClientIp(realIp: string | null, forwardedFor: string | null): string {
  const real = realIp?.trim();
  if (real) return real.slice(0, 64);
  const last = forwardedFor?.split(",").map((s) => s.trim()).filter(Boolean).pop();
  return (last ?? "unknown").slice(0, 64);
}
