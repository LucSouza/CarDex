import path from "node:path";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { migrate as migratePg } from "drizzle-orm/node-postgres/migrator";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";
import * as schema from "./schema";

/** Os dois drivers (node-postgres e PGlite) expõem a mesma API do Drizzle. Tipamos pelo de produção. */
export type Db = NodePgDatabase<typeof schema>;

/** Tabela de controle de migrations DEDICADA: não colide com `drizzle.__drizzle_migrations` de outros apps. */
export function migrationsConfig() {
  return {
    migrationsFolder: path.join(process.cwd(), "drizzle"),
    migrationsSchema: "pokedex",
    migrationsTable: "__pokedex_migrations",
  };
}

const globalForDb = globalThis as unknown as { __pokedexDb?: Db };

function isPostgresUrl(url: string | undefined): url is string {
  return !!url && /^postgres(ql)?:\/\//.test(url);
}

/** Neon/Postgres se DATABASE_URL for postgres://, senão PGlite em .pglite/ */
export function getDb(): Db {
  if (globalForDb.__pokedexDb) return globalForDb.__pokedexDb;
  const url = process.env.DATABASE_URL;
  let db: Db;
  if (isPostgresUrl(url)) {
    const pool = new Pool({ connectionString: url, max: 3 });
    db = drizzlePg(pool, { schema });
  } else {
    if (process.env.NODE_ENV === "production") {
      // PGlite grava em disco local: em produção (Vercel) isso perderia os dados. Falhe alto e claro.
      throw new Error("DATABASE_URL ausente ou inválida em produção (esperado postgres://...).");
    }
    const client = new PGlite(path.join(process.cwd(), ".pglite"));
    db = drizzlePglite(client, { schema }) as unknown as Db;
  }
  globalForDb.__pokedexDb = db;
  return db;
}

/** Banco em memória com as migrations aplicadas (testes). Devolve também o cliente cru. */
export async function createMemoryDb(): Promise<Db> {
  return (await createMemoryDbWithClient()).db;
}

export async function createMemoryDbWithClient(): Promise<{ db: Db; client: PGlite }> {
  const client = new PGlite();
  const db = drizzlePglite(client, { schema });
  await migratePglite(db, migrationsConfig());
  return { db: db as unknown as Db, client };
}

export async function runMigrations(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (isPostgresUrl(url)) {
    const pool = new Pool({ connectionString: url, max: 1 });
    try {
      await migratePg(drizzlePg(pool), migrationsConfig());
    } finally {
      await pool.end();
    }
  } else {
    const client = new PGlite(path.join(process.cwd(), ".pglite"));
    await migratePglite(drizzlePglite(client), migrationsConfig());
    await client.close();
  }
}
