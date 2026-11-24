import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { getIronSession, type SessionOptions } from "iron-session";
import { getDb } from "@/db";
import { pickClientIp } from "./secure";
import { getActiveUser } from "./users";

export interface SessionData {
  userId?: string;
  loggedAt?: number;
}

export interface CurrentUser {
  id: string;
  username: string;
}

const SEVEN_DAYS = 60 * 60 * 24 * 7;
export const SESSION_COOKIE = "cardex_session";

function sessionOptions(): SessionOptions {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error("SESSION_SECRET ausente ou curto (mínimo 32 caracteres). Veja o README.");
  }
  return {
    password,
    cookieName: SESSION_COOKIE,
    ttl: SEVEN_DAYS,
    cookieOptions: { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/" },
  };
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions());
}

/**
 * Usuário logado, relido do banco a cada requisição (conta desativada ou apagada perde o acesso na hora).
 * null = sem sessão válida.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  try {
    const s = await getSession();
    if (!s.userId) return null;
    const u = await getActiveUser(getDb(), s.userId);
    return u ? { id: u.id, username: u.username } : null;
  } catch (e) {
    // não esconder falha de banco/configuração como se fosse "deslogado"
    console.error("getCurrentUser falhou:", e);
    return null;
  }
});

/** Use no início de TODA página, Server Action e rota: a checagem vale aqui, não só no proxy. */
export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) redirect("/login");
  return u;
}

/** IP do cliente. Na Vercel, x-real-ip é definido pela plataforma (não pelo cliente). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return pickClientIp(h.get("x-real-ip"), h.get("x-forwarded-for"));
}
