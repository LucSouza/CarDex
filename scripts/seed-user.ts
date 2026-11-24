/**
 * Cria (ou redefine a senha de) um usuário do CarDex.
 *
 *   npm run seed:user -- ana
 *
 * A senha é digitada sem aparecer na tela (ou vem da variável CARDEX_PASSWORD, para automação).
 * Só o hash bcrypt vai para o banco; a senha nunca é impressa nem gravada. Mínimo de 10 caracteres.
 */
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { getDb, runMigrations } from "../src/db";
import { users } from "../src/db/schema";

const MIN_LEN = 10;

function readHidden(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const stdin = process.stdin;
    if (!stdin.isTTY) return reject(new Error("Sem terminal interativo: defina a variável CARDEX_PASSWORD."));
    process.stdout.write(prompt);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");
    let buf = "";
    const onData = (ch: string) => {
      for (const c of ch) {
        if (c === "\r" || c === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          process.stdout.write("\n");
          return resolve(buf);
        }
        if (c === "\u0003") {
          stdin.setRawMode(false);
          return reject(new Error("Cancelado."));
        }
        if (c === "\u007f" || c === "\b") buf = buf.slice(0, -1);
        else buf += c;
      }
    };
    stdin.on("data", onData);
  });
}

async function main() {
  const username = (process.argv[2] ?? "").trim().toLowerCase();
  if (!/^[a-z0-9._-]{2,40}$/.test(username)) {
    throw new Error("Uso: npm run seed:user -- <usuario>   (2 a 40 caracteres: letras minúsculas, números, . _ -)");
  }
  const pw = process.env.CARDEX_PASSWORD ?? (await readHidden(`Senha de ${username} (mín. ${MIN_LEN} caracteres): `));
  if (pw.length < MIN_LEN) throw new Error(`A senha precisa ter pelo menos ${MIN_LEN} caracteres.`);

  await runMigrations();
  const db = getDb();
  const hash = await bcrypt.hash(pw, 12);
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
  if (existing) {
    await db.update(users).set({ passwordHash: hash, disabledAt: null }).where(eq(users.id, existing.id));
    console.log(`✓ Senha de "${username}" redefinida.`);
  } else {
    await db.insert(users).values({ username, passwordHash: hash });
    console.log(`✓ Usuário "${username}" criado.`);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
