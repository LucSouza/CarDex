import { eq } from "drizzle-orm";
import type { Db } from "@/db";
import { userSettings, type Factors } from "@/db/schema";
import { DEFAULT_CONDITION_BP, DEFAULT_LANGUAGE_BP } from "./valuation";

export interface Settings {
  factors: Factors;
  useCardmarketFallback: boolean;
}

export const defaultSettings = (): Settings => ({
  factors: { conditions: { ...DEFAULT_CONDITION_BP }, languages: { ...DEFAULT_LANGUAGE_BP } },
  useCardmarketFallback: true,
});

/** Lê as configurações DO USUÁRIO; se ainda não existirem, semeia os padrões. */
export async function getSettings(db: Db, userId: string): Promise<Settings> {
  const [row] = await db.select().from(userSettings).where(eq(userSettings.userId, userId)).limit(1);
  if (row) {
    const d = defaultSettings();
    // completa com os padrões se faltar alguma chave (nunca deixa um fator indefinido chegar à fórmula)
    return {
      factors: { conditions: { ...d.factors.conditions, ...row.factors?.conditions }, languages: { ...d.factors.languages, ...row.factors?.languages } },
      useCardmarketFallback: row.useCardmarketFallback,
    };
  }
  const d = defaultSettings();
  await db.insert(userSettings).values({ userId, factors: d.factors, useCardmarketFallback: d.useCardmarketFallback }).onConflictDoNothing();
  return d;
}

export async function saveSettings(db: Db, userId: string, s: Settings): Promise<void> {
  await db
    .insert(userSettings)
    .values({ userId, factors: s.factors, useCardmarketFallback: s.useCardmarketFallback })
    .onConflictDoUpdate({ target: userSettings.userId, set: { factors: s.factors, useCardmarketFallback: s.useCardmarketFallback, updatedAt: new Date() } });
}

export async function resetSettings(db: Db, userId: string): Promise<void> {
  await saveSettings(db, userId, defaultSettings());
}
