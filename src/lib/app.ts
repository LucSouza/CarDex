import { getDb } from "@/db";
import { getRatesSafe } from "./fx";
import { getSettings } from "./settings";
import { requireUser } from "./session";

/** Contexto das páginas: usuário logado (obrigatório), banco, configurações DELE e câmbio (null se indisponível). */
export async function appContext() {
  const user = await requireUser();
  const db = getDb();
  const [settings, rates] = await Promise.all([getSettings(db, user.id), getRatesSafe(db)]);
  return { user, db, settings, rates };
}
