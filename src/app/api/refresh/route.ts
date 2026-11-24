import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db";
import { getRates } from "@/lib/fx";
import { refreshStaleCards } from "@/lib/price-service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function validBearer(header: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16 || !header?.startsWith("Bearer ")) return false;
  const given = Buffer.from(header.slice(7));
  const want = Buffer.from(secret);
  return given.length === want.length && timingSafeEqual(given, want);
}

/**
 * Atualização diária de preços e câmbio, chamada pelo Vercel Cron (GET com `Authorization: Bearer <CRON_SECRET>`).
 * SÓ Bearer: nada de sessão por cookie aqui (um GET que muda estado com cookie seria alvo de CSRF).
 * Retomável: o que não couber no orçamento de tempo fica para a próxima rodada.
 */
export async function GET(req: NextRequest) {
  if (!validBearer(req.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const db = getDb();
  const fx = await getRates(db, { force: true }).then(
    (r) => ({ ok: true, stale: r.stale }),
    () => ({ ok: false, stale: true }),
  );
  const r = await refreshStaleCards(db, { concurrency: 3, budgetMs: 50_000 });
  return NextResponse.json({ fx, ...r });
}
