"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { clientIp, getSession } from "@/lib/session";
import { clearRateLimit, findActiveUserByUsername, hitRateLimit, purgeRateLimits } from "@/lib/users";
import { fieldErrors, loginSchema } from "@/lib/validation";

export interface LoginState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

const WINDOW = 15 * 60;
/** Hash de mentira: o bcrypt roda mesmo quando o usuário não existe (tempo de resposta igual, sem enumerar usuários). */
const DUMMY_HASH = bcrypt.hashSync("senha-inexistente-para-tempo-constante", 10);

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({ username: formData.get("username") ?? "", password: formData.get("password") ?? "" });
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error) };
  const { username, password } = parsed.data;

  const db = getDb();
  const ip = await clientIp();
  await purgeRateLimits(db);
  // por IP+usuário (5), por IP (15) e um limite global (60) contra tentativa distribuída
  const okUser = await hitRateLimit(db, `login:${ip}:${username}`, 5, WINDOW);
  const okIp = await hitRateLimit(db, `login-ip:${ip}`, 15, WINDOW);
  const okGlobal = await hitRateLimit(db, "login:*", 60, WINDOW);
  if (!okUser || !okIp || !okGlobal) return { error: "Muitas tentativas. Aguarde 15 minutos." };

  const user = await findActiveUserByUsername(db, username);
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  // mensagem única: não diz se o usuário existe
  if (!user || !valid) return { error: "Usuário ou senha incorretos." };

  await clearRateLimit(db, `login:${ip}:${username}`);
  const session = await getSession();
  session.userId = user.id;
  session.loggedAt = Date.now();
  await session.save();
  redirect("/");
}

export async function logoutAction(): Promise<void> {
  const session = await getSession();
  session.destroy();
  redirect("/login");
}
