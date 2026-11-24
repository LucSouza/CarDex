import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  // O banco Neon é compartilhado com outros apps: o drizzle-kit só enxerga o schema "pokedex".
  schemaFilter: ["pokedex"],
  migrations: { schema: "pokedex", table: "__pokedex_migrations" },
});
