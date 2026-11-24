import { and, eq, isNull, lte, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { rateLimits, users } from "@/db/schema";

export type UserRow = typeof users.$inferSelect;

/** Usuário ativo (conta desativada não entra). */
export async function findActiveUserByUsername(db: Db, username: string): Promise<UserRow | null> {
  const [u] = await db
    .select()
    .from(users)
    .where(and(eq(users.username, username.trim().toLowerCase()), isNull(users.disabledAt)))
    .limit(1);
  return u ?? null;
}

export async function getActiveUser(db: Db, id: string): Promise<UserRow | null> {
  const [u] = await db.select().from(users).where(and(eq(users.id, id), isNull(users.disabledAt))).limit(1);
  return u ?? null;
}

export async function createUser(db: Db, username: string, passwordHash: string): Promise<string> {
  const [row] = await db
    .insert(users)
    .values({ username: username.trim().toLowerCase(), passwordHash })
    .returning({ id: users.id });
  return row.id;
}

// ───────────── limite de tentativas (login), no banco: memória não vale em serverless ─────────────

/** Conta uma tentativa de forma atômica. Retorna false se passou do limite na janela. */
export async function hitRateLimit(db: Db, key: string, max: number, windowSec: number): Promise<boolean> {
  const res = await db.execute(sql`
    INSERT INTO pokedex.rate_limits (key, count, window_start)
    VALUES (${key}, 1, now())
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN pokedex.rate_limits.window_start < now() - make_interval(secs => ${windowSec}) THEN 1 ELSE pokedex.rate_limits.count + 1 END,
      window_start = CASE WHEN pokedex.rate_limits.window_start < now() - make_interval(secs => ${windowSec}) THEN now() ELSE pokedex.rate_limits.window_start END
    RETURNING count
  `);
  const count = Number((res.rows[0] as { count: number | string }).count);
  return count <= max;
}

export async function clearRateLimit(db: Db, key: string): Promise<void> {
  await db.delete(rateLimits).where(eq(rateLimits.key, key));
}

/** Apaga contadores com mais de um dia (a tabela não cresce com usuários inventados). */
export async function purgeRateLimits(db: Db): Promise<void> {
  await db.delete(rateLimits).where(lte(rateLimits.windowStart, sql`now() - interval '1 day'`));
}
