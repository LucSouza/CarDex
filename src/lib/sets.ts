/** Lista de coleções (sets) em PT, EN e JA, guardada no banco e renovada a cada 7 dias. */
import { sql } from "drizzle-orm";
import type { Db } from "@/db";
import { setsCache } from "@/db/schema";
import { CATALOG_LANGS, createTcgdex, type Tcgdex } from "./tcgdex";

export const SETS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface SetOption {
  id: string;
  /** nome na primeira língua que tiver (PT, EN, JA) */
  name: string;
  cardCount: number | null;
}

export async function getSets(db: Db, opts: { t?: Tcgdex; now?: Date } = {}): Promise<SetOption[]> {
  const now = opts.now ?? new Date();
  let rows = await db.select().from(setsCache);
  const newest = rows.reduce((m, r) => Math.max(m, r.fetchedAt.getTime()), 0);
  if (rows.length === 0 || now.getTime() - newest > SETS_TTL_MS) {
    const t = opts.t ?? createTcgdex();
    const fetched = await Promise.all(CATALOG_LANGS.map(async (lang) => ({ lang, sets: await t.listSets(lang).catch(() => []) })));
    const values = fetched.flatMap(({ lang, sets }) => sets.map((s) => ({ id: s.id, lang, name: s.name, cardCount: s.cardCount, fetchedAt: now })));
    if (values.length > 0) {
      await db
        .insert(setsCache)
        .values(values)
        .onConflictDoUpdate({ target: [setsCache.id, setsCache.lang], set: { name: sql`excluded.name`, cardCount: sql`excluded.card_count`, fetchedAt: sql`excluded.fetched_at` } });
      rows = await db.select().from(setsCache);
    }
  }
  const byId = new Map<string, SetOption>();
  for (const lang of CATALOG_LANGS) {
    for (const r of rows.filter((x) => x.lang === lang)) if (!byId.has(r.id)) byId.set(r.id, { id: r.id, name: r.name, cardCount: r.cardCount });
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}
