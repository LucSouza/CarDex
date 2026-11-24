"use server";

import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { getDb } from "@/db";
import { rateKey } from "@/lib/secure";
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
  // Chaves = HMAC (o IP e o usuário não ficam em claro no banco). `username` já vem normalizado pelo loginSchema.
  // Por IP+usuário (5), por IP (15) e por usuário (30, contra força bruta vinda de muitos IPs). NÃO há limite
  // global: ele deixaria qualquer anônimo bloquear o login de todo mundo.
  const secret = process.env.SESSION_SECRET ?? "";
  const keyPair = rateKey(secret, "login", ip, username);
  const okPair = await hitRateLimit(db, keyPair, 5, WINDOW);
  const okIp = await hitRateLimit(db, rateKey(secret, "login-ip", ip), 15, WINDOW);
  const okUser = await hitRateLimit(db, rateKey(secret, "login-user", username), 30, WINDOW);
  if (!okPair || !okIp || !okUser) return { error: "Muitas tentativas. Aguarde 15 minutos." };

  const user = await findActiveUserByUsername(db, username);
  const valid = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH);
  // mensagem única: não diz se o usuário existe
  if (!user || !valid) return { error: "Usuário ou senha incorretos." };

  await clearRateLimit(db, keyPair);
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
