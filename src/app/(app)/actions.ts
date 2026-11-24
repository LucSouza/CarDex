"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { addItem, purgeItem, removeItem, restoreItem, updateItem } from "@/lib/collection";
import { getRates } from "@/lib/fx";
import { refreshStaleCards } from "@/lib/price-service";
import { getSettings, resetSettings, saveSettings } from "@/lib/settings";
import { requireUser } from "@/lib/session";
import { TcgdexError, type CatalogLang } from "@/lib/tcgdex";
import { hitRateLimit } from "@/lib/users";
import { UserError, fieldErrors, itemFormSchema, removeFormSchema, settingsFormSchema } from "@/lib/validation";

export interface FormState {
  error?: string;
  ok?: string;
  fieldErrors?: Record<string, string>;
}

function fields(fd: FormData): Record<string, string> {
  const o: Record<string, string> = {};
  for (const [k, v] of fd.entries()) if (typeof v === "string") o[k] = v;
  return o;
}

/** Erros esperados viram mensagem; o resto vai para o log e a pessoa vê um aviso genérico. */
async function guard(fn: () => Promise<void>): Promise<FormState | null> {
  try {
    await fn();
    return null;
  } catch (e) {
    if (e instanceof UserError) return { error: e.message };
    if (e instanceof TcgdexError) return { error: "Não foi possível falar com a TCGdex agora. Tente de novo em instantes." };
    console.error("ação falhou:", e);
    return { error: "Algo deu errado. Tente de novo." };
  }
}

const uuid = z.uuid();
const langSchema = z.enum(["pt", "en", "ja"]);

/** Adiciona (sem `id`) ou edita (com `id`) uma carta da coleção do usuário logado. */
export async function saveItemAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const raw = fields(fd);
  const parsed = itemFormSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const id = raw.id ? uuid.safeParse(raw.id) : null;
  if (id && !id.success) return { error: "Carta inválida." };
  const lang = langSchema.safeParse(raw.lang);
  const db = getDb();
  const failed = await guard(async () => {
    if (id?.success) await updateItem(db, user.id, id.data, parsed.data);
    else await addItem(db, user.id, parsed.data, { lang: lang.success ? (lang.data as CatalogLang) : undefined });
  });
  if (failed) return failed;
  redirect("/colecao");
}

export async function removeItemAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = removeFormSchema.safeParse(fields(fd));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const failed = await guard(() => removeItem(getDb(), user.id, parsed.data.id, parsed.data.reason, parsed.data.sold));
  if (failed) return failed;
  redirect("/colecao");
}

export async function restoreItemAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "Carta inválida." };
  const failed = await guard(() => restoreItem(getDb(), user.id, id.data));
  if (failed) return failed;
  redirect("/colecao");
}

export async function purgeItemAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const id = uuid.safeParse(fd.get("id"));
  if (!id.success) return { error: "Carta inválida." };
  const failed = await guard(() => purgeItem(getDb(), user.id, id.data));
  if (failed) return failed;
  redirect("/historico");
}

export async function saveSettingsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const parsed = settingsFormSchema.safeParse(fields(fd));
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const p = parsed.data;
  const failed = await guard(() =>
    saveSettings(getDb(), user.id, {
      factors: {
        conditions: { NM: p.NM, SP: p.SP, MP: p.MP, HP: p.HP, D: p.D },
        languages: { EN: p.EN, JP: p.JP, PT: p.PT },
      },
      useCardmarketFallback: p.useCardmarketFallback,
    }),
  );
  return failed ?? { ok: "Configurações salvas." };
}

export async function resetSettingsAction(): Promise<FormState> {
  const user = await requireUser();
  const failed = await guard(() => resetSettings(getDb(), user.id));
  return failed ?? { ok: "Valores iniciais restaurados." };
}

/** Botão "Atualizar agora": força câmbio e preços das cartas DESTE usuário. */
export async function refreshAction(): Promise<FormState> {
  const user = await requireUser();
  const db = getDb();
  if (!(await hitRateLimit(db, `refresh:${user.id}`, 6, 10 * 60))) {
    return { error: "Você atualizou várias vezes seguidas. Aguarde alguns minutos." };
  }
  try {
    await getSettings(db, user.id);
    await getRates(db, { force: true }).catch(() => null);
    const r = await refreshStaleCards(db, { userId: user.id, force: true, concurrency: 3, budgetMs: 40_000 });
    if (r.failed > 0) return { error: `${r.refreshed} atualizadas, ${r.failed} falharam (mantive o preço antigo). Tente de novo mais tarde.` };
    if (r.remaining > 0) return { ok: `${r.refreshed} atualizadas. Restam ${r.remaining}: clique de novo para continuar.` };
    return { ok: r.refreshed === 0 ? "Nada para atualizar." : `${r.refreshed} cartas atualizadas.` };
  } catch (e) {
    console.error("refresh falhou:", e);
    return { error: "Não foi possível atualizar agora." };
  }
}
